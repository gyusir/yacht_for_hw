#!/usr/bin/env node
// Room bot: keeps an augment-mode Yacht room open at a fixed code and plays whoever joins.
//   node tools/room-bot/bot.js                 # production RTDB (needs admin credentials)
//   BOT_EMULATOR=1 node tools/room-bot/bot.js  # local emulator (localhost:9000)
// Env: BOT_ROOM (default 7777), BOT_NAME (default Claude), BOT_NO_CLAUDE=1 (rule-based only),
//      BOT_MODEL (default sonnet), CLAUDE_BIN (path to the claude CLI).
// Moves go through the same reducers as Cloud Functions (functions/game-rules.js),
// applied in RTDB transactions with admin rights — the bot never bypasses game rules.
'use strict';

const crypto = require("crypto");
const path = require("path");

if (process.env.BOT_EMULATOR === "1" && !process.env.FIREBASE_DATABASE_EMULATOR_HOST) {
  process.env.FIREBASE_DATABASE_EMULATOR_HOST = "localhost:9000";
}

const admin = require(path.join(__dirname, "../../functions/node_modules/firebase-admin"));
const Rules = require("../../functions/game-rules");
const Aug = require("../../functions/augments");
const Brain = require("./brain");
const Advisor = require("./advisor");
const Taunts = require("./taunts");

const ROOM = process.env.BOT_ROOM || "7777";
const NAME = (process.env.BOT_NAME || "Claude").slice(0, 12);
const UID = process.env.BOT_UID || "bot-claude";
const PK = "player1";
const OPP = "player2";
const STEP_MS = Number(process.env.BOT_STEP_MS || 600);
const RESET_AFTER_MS = 20000;            // finished -> fresh waiting room (results already saved by onGameFinished)
const KEEPALIVE_MS = 30 * 60 * 1000;     // cleanupStaleRooms drops waiting rooms idle for 2h
const IDLE_FORFEIT_MS = 15 * 60 * 1000;  // opponent idle on their turn this long -> bot wins
const DICE_SKIN = "ascend.claude";        // Claude Ascend (beat this bot 5 times to unlock it)
// A disconnected opponent forfeits only if it is their turn and they have not come back for this long.
// Phones drop the socket whenever the app goes to the background, so being offline alone never ends the game.
const DISCONNECT_WIN_MS = 5 * 60 * 1000;
const PICK_GRACE_MS = 3000;
// Turn pacing copied from the Hail (wave) bot in js/bot-game.js, so the human can follow every hold and roll:
// think 1.5-2.2s -> roll -> wait for the roll animation, then 1.0-1.5s -> hold dice one by one (150ms apart)
// -> 0.8-1.2s -> roll ... -> 1.2-1.8s -> record. BOT_PACE scales it (e.g. 0.3 for quick local tests).
const PACE = Number(process.env.BOT_PACE || 1);
const between = (lo, hi) => Math.round((lo + rand(hi - lo + 1)) * PACE);
// Client roll animation (js/game.js + Dice.staggerStop): 0.4s spin, then the spinning dice stop 0.5s apart.
const rollAnimMs = (spinning) => 400 + Math.max(0, spinning - 1) * 500;
const LOTTERY_REVEAL_MS = 1300;          // js/augment-ui.js spins a lucky die at least 1.2s before revealing it

function log(msg) { console.log(new Date().toISOString() + " [" + ROOM + "] " + msg); }
Advisor.setLogger(log);
const EDIT_LABEL = { adjust: "정밀 조정", nudge: "미세 조정", copy: "복제", wild: "와일드" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (n) => crypto.randomInt(0, n);

const appOptions = {
  databaseURL: "https://yacht-ff0c8-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "yacht-ff0c8"
};
if (!process.env.FIREBASE_DATABASE_EMULATOR_HOST) appOptions.credential = admin.credential.applicationDefault();
admin.initializeApp(appOptions);
const db = admin.database();
const roomRef = db.ref("rooms/" + ROOM);
const TS = admin.database.ServerValue.TIMESTAMP;

let latest = null;
roomRef.on("value", (s) => { latest = s.val(); });

function freshRoom() {
  const dice = {};
  for (let i = 0; i < 5; i++) dice[i] = { value: 0, held: false };
  return {
    type: "private", gameMode: "yacht", augmentMode: true, status: "waiting",
    createdAt: TS, lastActivityAt: TS, currentTurn: "player1", rollCount: 0, dice: dice,
    players: { player1: { name: NAME, nicknameKo: NAME, nicknameEn: NAME, uid: UID, connected: true,
      scores: { _init: true }, diceSkin: DICE_SKIN, bot: true } },
    winner: "", hostBot: true
  };
}

function ours(room) { return !!(room && room.players && room.players.player1 && room.players.player1.uid === UID); }

// Same contract as Cloud Functions' runRoomTransaction: reducer returns {error} or result.
async function tx(reducer) {
  let out = null, err = null;
  const res = await roomRef.transaction((room) => {
    out = null; err = null;
    if (!room) return room;
    const r = reducer(room);
    if (r && r.error) { err = r.error; return; }
    out = r;
    return room;
  });
  if (!res.committed) throw new Error("rejected: " + (err || "aborted"));
  if (!out) throw new Error("room missing");
  return out;
}

async function setupRoom() {
  await roomRef.set(freshRoom());
  await db.ref("augmentPicks/" + ROOM).remove();
  roomRef.child("players/player1/connected").onDisconnect().set(false);
  log("room open (waiting)");
}

// Speech bubble on the opponent's screen (same path as player emotes).
let lastEmote = 0;
async function emote(msg) {
  if (!msg) return;
  const ts = Math.max(Date.now(), lastEmote + 2000);
  lastEmote = ts;
  await roomRef.child("emotes/" + PK).set({ msg: String(msg).slice(0, 90), name: NAME, ts: ts }).catch(() => {});
}

// Situational lines (records, score gap, idling), like the in-browser bots.
const taunts = Taunts.create({ say: emote, rand: rand, me: PK, opp: OPP, log: log, lastSaid: () => lastEmote });

// ── Augment pick (mirrors the pickAugment callable) ──
async function pick(room) {
  const phase = room.augmentPhase;
  const offers = Object.values((phase.offers && phase.offers[PK]) || {});
  await emote("🤔");
  const choice = await Advisor.pickAugment(room, PK, offers);
  await emote(choice.say);
  log("pick tier " + phase.tier + ": " + choice.pick + " (" + choice.by + ") " + (choice.why || ""));
  await commitPick(phase.tier, (cur) => { if (cur[PK]) return; cur[PK] = choice.pick; return cur; });
}

async function commitPick(tier, mutate) {
  const pickRef = db.ref("augmentPicks/" + ROOM + "/" + tier);
  const pr = await pickRef.transaction((cur) => mutate(cur || {}));
  if (!pr.committed) return;
  const picks = pr.snapshot.val() || {};
  const both = !!(picks.player1 && picks.player2);
  await tx((room) => {
    const r = both ? Rules.applyPicks(room, picks, tier, TS) : Rules.markReady(room, PK, tier);
    if (r.error || r.stale) return r.error ? r : { stale: true };
    return r;
  }).catch((e) => log("pick commit: " + e.message));
  if (both) await pickRef.remove();
}

// ── Bot turn ──
async function act(action) {
  const r = await tx((room) => Rules.applyAction(room, UID, action));
  log("action " + JSON.stringify(action) + " -> " + JSON.stringify(r));
}

async function roll(hold) {
  hold = hold || [];
  if ((latest && latest.rollCount) > 0) {
    // Toggle holds one die at a time like the Hail bot (each toggle plays the hold sound on the opponent's screen).
    const cur = (latest && latest.heldDice) || {};
    let changed = false;
    for (let i = 0; i < 5; i++) {
      const want = hold.indexOf(i) !== -1;
      if (want === (cur[i] === true)) continue;
      await sleep(Math.round(150 * PACE));
      await roomRef.child("heldDice/" + i).set(want ? true : null);
      changed = true;
    }
    if (changed || hold.length) await sleep(between(800, 1200));
  }
  const vals = [0, 1, 2, 3, 4].map(() => 1 + rand(6));
  const r = await tx((room) => {
    if (!hold || !hold.length) room.heldDice = null;
    return Rules.applyRoll(room, UID, vals);
  });
  log("roll " + JSON.stringify([0, 1, 2, 3, 4].map((i) => r.dice[i].value)) + " (#" + r.rollCount + (r.extraUsed ? ", extra" : "") + ")");
  // Wait until the dice have stopped on the opponent's screen, then "look" at them like the Hail bot does.
  await sleep(Math.round(rollAnimMs(5 - hold.length) * PACE) + between(1000, 1500));
}

async function playTurn() {
  let room = latest;
  // Before the first roll: seal / swap / declarations.
  if ((room.rollCount || 0) === 0) {
    const opts = Brain.preRollOptions(room, PK);
    if (Brain.hasPreRollChoice(opts)) {
      await emote("🤔");
      const plan = await Advisor.preRoll(room, PK, opts, Brain.defaultPreRoll(room, PK, opts));
      if (plan.seal || plan.swap || plan.declare) await emote(plan.say);
      log("pre-roll plan (" + plan.by + "): " + JSON.stringify({ seal: plan.seal, swap: plan.swap, declare: plan.declare }) + " " + (plan.why || ""));
      for (const a of [plan.seal && { type: "seal", category: plan.seal }, plan.swap && { type: "swap", category: plan.swap }, plan.declare]) {
        if (!a) continue;
        await act(a).catch((e) => log("action failed: " + e.message));
        await sleep(STEP_MS);
      }
    }
    taunts.gameStart();
    await sleep(between(1500, 2200));
    await roll(null);
  }
  for (;;) {
    room = latest;
    if (!room || room.status !== "playing" || room.currentTurn !== PK) return;
    const mv = Brain.diceMove(room, PK);
    if (!mv.roll) break;
    await roll(mv.hold);
  }
  await sleep(between(1200, 1800));
  room = latest;
  const opts = Brain.finalOptions(room, PK);
  const fallback = Brain.defaultFinal(room, PK, opts);
  let choice;
  // Ask Claude only when spending a charge would actually beat the best plain record.
  const plainU = Math.max.apply(null, opts.filter((o) => !Brain.usesCharge(o)).map((o) => o.u).concat(-Infinity));
  const chargedU = Math.max.apply(null, opts.filter(Brain.usesCharge).map((o) => o.u).concat(-Infinity));
  if (chargedU > plainU + 1) {
    await emote("🤔");
    choice = await Advisor.finalChoice(room, PK, opts, fallback);
    if (Brain.usesCharge(choice)) await emote(choice.say);
  } else choice = Object.assign({ by: "rule" }, fallback);
  if (choice.edit) {
    // Say exactly which die changed and pause, so the opponent can follow the edit before the record lands.
    const before = Brain.diceOf(room);
    const ok = await act(choice.edit).then(() => true, (e) => { log("edit failed: " + e.message); return false; });
    if (ok) {
      const after = Brain.diceOf(latest);
      const i = after.findIndex((v, k) => v !== before[k]);
      const label = EDIT_LABEL[choice.edit.type] || choice.edit.type;
      await emote(i === -1 ? label : label + ": " + (i + 1) + "번 주사위 " + before[i] + " → " + after[i]);
      await sleep(3000);
    }
  }
  const coinFlip = rand(2);
  let r;
  try {
    r = await tx((rm) => Rules.applySelect(rm, UID, choice.category, {
      useDouble: choice.useDouble, useInsurance: choice.useInsurance, useCoin: choice.useCoin,
      coinFlip: coinFlip, rand: rand, now: Date.now() }));
  } catch (e) {
    // Last resort: best plain category for the current dice.
    log("select failed (" + e.message + "), falling back");
    const rm = latest;
    const b = Brain.bestChoice(Brain.diceOf(rm), rm.players[PK], rm.turnFlags || {}, !!(rm.turnFlags && rm.turnFlags.noYacht));
    r = await tx((x) => Rules.applySelect(x, UID, b.c, { rand: rand, now: Date.now(), coinFlip: coinFlip }));
    choice.category = b.c;
  }
  log("record " + choice.category + " = " + r.score + " (" + choice.by + ")" + (r.effects && r.effects.length ? " " + r.effects.join(",") : "") + (choice.why ? " — " + choice.why : ""));
}

// ── Main loop ──
let finishedAt = 0, lastKeepalive = 0, oppOffline = false;

async function step() {
  const room = latest;
  if (room === null) return setupRoom();
  if (!ours(room)) { log("code " + ROOM + " is taken by another room; waiting"); return sleep(60000); }
  const now = Date.now();
  taunts.observe(room);

  if (room.status === "waiting") {
    finishedAt = 0;
    if (now - lastKeepalive > KEEPALIVE_MS) {
      lastKeepalive = now;
      await roomRef.update({ lastActivityAt: TS, "players/player1/connected": true });
    }
    return;
  }
  if (room.status === "finished") {
    if (!finishedAt) {
      finishedAt = now;
      const t1 = Aug.totalScore(room.players.player1.scores || {}, room.players.player1.aug);
      const t2 = room.players.player2 ? Aug.totalScore(room.players.player2.scores || {}, room.players.player2.aug) : 0;
      log("game over: winner=" + room.winner + " " + t1 + ":" + t2);
    }
    if (now - finishedAt >= RESET_AFTER_MS) return setupRoom();
    return;
  }
  if (room.status !== "playing") return;
  lastKeepalive = now;

  if (room.drawProposal && room.drawProposal.proposedBy === OPP) {
    log("draw proposal declined");
    await roomRef.child("drawProposal").set(null);
  }

  // Opponent left without leaveGame: offline on their turn for 5 min, or idle on their turn for 15 min.
  // The clock is lastActivityAt (their turn's start or last action), so rejoining resumes the same game.
  const opp = room.players && room.players[OPP];
  const idleMs = room.currentTurn === OPP && typeof room.lastActivityAt === "number" ? now - room.lastActivityAt : 0;
  const offline = opp && opp.connected === false;
  if (offline !== oppOffline) { oppOffline = offline; log(offline ? "opponent offline (waiting for rejoin)" : "opponent back online"); }
  if ((offline && idleMs > DISCONNECT_WIN_MS) || idleMs > IDLE_FORFEIT_MS) {
    log("opponent gone -> bot wins (" + (offline ? "offline" : "idle") + " " + Math.round(idleMs / 1000) + "s on their turn)");
    await tx((rm) => { if (rm.status !== "playing") return { error: "NOT_PLAYING" }; rm.status = "finished"; rm.winner = PK; return {}; }).catch(() => {});
    return;
  }

  // Lucky die at game end: roll ours like a player would, and roll for an opponent who never does.
  const lot = room.lotteryPhase;
  if (lot) {
    const pending = lot.pending || {};
    if (pending[PK]) {
      await sleep(between(1500, 2200));
      const die = 1 + rand(6);
      const r = await tx((rm) => Rules.applyLottery(rm, UID, die)).catch((e) => { log("lottery: " + e.message); return null; });
      if (r) {
        log("lucky die " + r.die + " -> " + (r.prize ? "+" + r.prize : "miss"));
        await sleep(LOTTERY_REVEAL_MS);  // the opponent's screen spins it ~1.2s before showing the face
        await emote("🎲 " + r.die + (r.prize ? "! +" + r.prize : " … 꽝"));
      }
    } else if (pending[OPP] && now >= (lot.deadline || 0) + Rules.LOTTERY_GRACE_MS + 2000) {
      log("opponent lucky die timed out -> rolled for them");
      const dice = { player1: 1 + rand(6), player2: 1 + rand(6) };
      await tx((rm) => Rules.claimLotteryTimeout(rm, UID, dice, Date.now())).catch((e) => log("lottery claim: " + e.message));
    }
    return;
  }

  const phase = room.augmentPhase;
  if (phase) {
    const ready = phase.ready || {};
    if (!ready[PK]) return pick(room);
    if (!ready[OPP] && now > (phase.deadline || 0) + PICK_GRACE_MS) {
      log("opponent pick timed out -> random pick");
      await commitPick(phase.tier, (cur) => Rules.fillMissingPicks(room, cur, rand));
    }
    return;
  }
  if (room.currentTurn === PK) return playTurn();
}

async function main() {
  log("bot starting (" + (process.env.FIREBASE_DATABASE_EMULATOR_HOST ? "emulator " + process.env.FIREBASE_DATABASE_EMULATOR_HOST : "production") + ")");
  await roomRef.once("value").then((s) => { latest = s.val(); });
  if (ours(latest)) {
    await roomRef.child("players/player1/connected").set(true);
    roomRef.child("players/player1/connected").onDisconnect().set(false);
    // A room opened by an older bot version keeps its skin otherwise.
    if (latest.status === "waiting") await roomRef.child("players/player1/diceSkin").set(DICE_SKIN);
  }
  for (;;) {
    try { await step(); } catch (e) { log("error: " + (e.stack || e.message)); await sleep(3000); }
    await sleep(500);
  }
}

async function shutdown() {
  log("shutting down");
  try { if (ours(latest)) await roomRef.child("players/player1/connected").set(false); } catch (e) { /* ignore */ }
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

main();
