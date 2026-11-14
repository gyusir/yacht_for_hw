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

const ROOM = process.env.BOT_ROOM || "7777";
const NAME = (process.env.BOT_NAME || "Claude").slice(0, 12);
const UID = process.env.BOT_UID || "bot-claude";
const PK = "player1";
const OPP = "player2";
const STEP_MS = Number(process.env.BOT_STEP_MS || 900);
const RESET_AFTER_MS = 20000;            // finished -> fresh waiting room (results already saved by onGameFinished)
const KEEPALIVE_MS = 30 * 60 * 1000;     // cleanupStaleRooms drops waiting rooms idle for 2h
const IDLE_FORFEIT_MS = 15 * 60 * 1000;  // opponent idle on their turn this long -> bot wins
const DISCONNECT_WIN_MS = 60 * 1000;     // opponent disconnected this long -> bot wins
const PICK_GRACE_MS = 3000;

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
      scores: { _init: true }, diceSkin: "classic", bot: true } },
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
  if (hold && hold.length) {
    const held = {}; hold.forEach((i) => { held[i] = true; });
    await roomRef.child("heldDice").set(held);
    await sleep(STEP_MS / 2);
  }
  const vals = [0, 1, 2, 3, 4].map(() => 1 + rand(6));
  const r = await tx((room) => {
    if (!hold || !hold.length) room.heldDice = null;
    return Rules.applyRoll(room, UID, vals);
  });
  log("roll " + JSON.stringify([0, 1, 2, 3, 4].map((i) => r.dice[i].value)) + " (#" + r.rollCount + (r.extraUsed ? ", extra" : "") + ")");
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
    await sleep(STEP_MS);
    await roll(null);
  }
  for (;;) {
    await sleep(STEP_MS);
    room = latest;
    if (!room || room.status !== "playing" || room.currentTurn !== PK) return;
    const mv = Brain.diceMove(room, PK);
    if (!mv.roll) break;
    await roll(mv.hold);
  }
  room = latest;
  const opts = Brain.finalOptions(room, PK);
  const fallback = Brain.defaultFinal(room, PK, opts);
  let choice;
  if (opts.some(Brain.usesCharge)) {
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
  const lotteryDice = { player1: 1 + rand(6), player2: 1 + rand(6) };
  let r;
  try {
    r = await tx((rm) => Rules.applySelect(rm, UID, choice.category, {
      useDouble: choice.useDouble, useInsurance: choice.useInsurance, useCoin: choice.useCoin,
      coinFlip: coinFlip, lotteryDice: lotteryDice, rand: rand, now: Date.now() }));
  } catch (e) {
    // Last resort: best plain category for the current dice.
    log("select failed (" + e.message + "), falling back");
    const rm = latest;
    const b = Brain.bestChoice(Brain.diceOf(rm), rm.players[PK], rm.turnFlags || {}, !!(rm.turnFlags && rm.turnFlags.noYacht));
    r = await tx((x) => Rules.applySelect(x, UID, b.c, { rand: rand, now: Date.now(), coinFlip: coinFlip, lotteryDice: lotteryDice }));
    choice.category = b.c;
  }
  log("record " + choice.category + " = " + r.score + " (" + choice.by + ")" + (r.effects && r.effects.length ? " " + r.effects.join(",") : "") + (choice.why ? " — " + choice.why : ""));
}

// ── Main loop ──
let finishedAt = 0, lastKeepalive = 0, oppGoneSince = 0;

async function step() {
  const room = latest;
  if (room === null) return setupRoom();
  if (!ours(room)) { log("code " + ROOM + " is taken by another room; waiting"); return sleep(60000); }
  const now = Date.now();

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

  // Opponent left without leaveGame: disconnected, or idle on their turn.
  const opp = room.players && room.players[OPP];
  oppGoneSince = opp && opp.connected === false ? (oppGoneSince || now) : 0;
  const idle = room.currentTurn === OPP && typeof room.lastActivityAt === "number" && now - room.lastActivityAt > IDLE_FORFEIT_MS;
  if ((oppGoneSince && now - oppGoneSince > DISCONNECT_WIN_MS) || idle) {
    log("opponent gone -> bot wins");
    await tx((rm) => { if (rm.status !== "playing") return { error: "NOT_PLAYING" }; rm.status = "finished"; rm.winner = PK; return {}; }).catch(() => {});
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
