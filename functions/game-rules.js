// Pure game-state reducers shared by Cloud Functions transactions and tools/augment_sim.js.
// Each apply* function validates first, then mutates `room` in place and returns
// { ok: true, ... } — or returns { error: CODE } without mutating anything.
'use strict';

const Scoring = require("./scoring");
const Aug = require("./augments");

const ERRORS = {
  NOT_PLAYING: ["failed-precondition", "Game is not in progress."],
  NOT_PLAYER: ["permission-denied", "Not a player in this room."],
  NOT_YOUR_TURN: ["failed-precondition", "Not your turn."],
  NO_ROLLS: ["failed-precondition", "No rolls remaining."],
  NO_ROLL_YET: ["failed-precondition", "Roll the dice first."],
  INVALID_CATEGORY: ["invalid-argument", "Invalid category."],
  CATEGORY_FILLED: ["failed-precondition", "Category already filled."],
  INVALID_DICE: ["failed-precondition", "Invalid game state."],
  NOT_AUGMENT: ["failed-precondition", "Not an augment game."],
  AUGMENT_PHASE: ["failed-precondition", "Augment selection in progress."],
  NO_PHASE: ["failed-precondition", "No augment selection in progress."],
  NOT_OFFERED: ["invalid-argument", "Augment not offered."],
  ROLL_LOCKED: ["failed-precondition", "Dice were changed this turn."],
  YACHT_BLOCKED: ["failed-precondition", "Yacht is blocked this turn."],
  DOUBLE_YACHT: ["invalid-argument", "Double cannot be used on Yacht."],
  NO_CHARGE: ["failed-precondition", "No charges left."],
  ALREADY_EDITED: ["failed-precondition", "A die was already changed this turn."],
  EDIT_BLOCKED: ["failed-precondition", "Only Yacht is left; this augment cannot be used."],
  INVALID_TARGET: ["invalid-argument", "Invalid target."],
  INVALID_ACTION: ["invalid-argument", "Invalid action."],
  DECLARE_AFTER_ROLL: ["failed-precondition", "Declare before your first roll."],
  ALREADY_DECLARED: ["failed-precondition", "Already declared this turn."],
  MULTIPLIER_CONFLICT: ["failed-precondition", "Only one multiplier per record."]
};

function fail(code) { return { error: code }; }

function findPlayerKey(players, uid) {
  if (players.player1 && players.player1.uid === uid) return "player1";
  if (players.player2 && players.player2.uid === uid) return "player2";
  return null;
}

function opponentOf(key) {
  return key === "player1" ? "player2" : "player1";
}

function isAugment(room) {
  return room.augmentMode === true && room.gameMode === "yacht";
}

// RTDB drops empty arrays/objects and may return arrays as objects; normalise.
function ensureAug(player) {
  const aug = player.aug || {};
  let owned = aug.owned || [];
  if (!Array.isArray(owned)) owned = Object.keys(owned).map((k) => owned[k]);
  player.aug = { owned: owned, charges: Object.assign({}, aug.charges || {}) };
  return player.aug;
}

function filled(scores, c) {
  return scores && scores[c] !== null && scores[c] !== undefined;
}

function filledCount(scores, gameMode) {
  return Scoring.getCategories(gameMode).filter((c) => filled(scores, c)).length;
}

// augment=true: augment-mode total (includes the upper-section bonus).
function total(player, gameMode, augment) {
  const s = (player && player.scores) || {};
  return augment ? Aug.totalScore(s, player && player.aug) : Scoring.totalScore(s, gameMode, s.yahtzeeBonus);
}

function isInt(v, lo, hi) {
  return typeof v === "number" && Math.floor(v) === v && v >= lo && v <= hi;
}

// ─── Augment phase ───

// now: server time in ms (sets the pick deadline)
function openAugmentPhase(room, tier, rand, now) {
  room.augmentPhase = {
    tier: tier,
    deadline: (typeof now === "number" ? now : 0) + Aug.PICK_TIME_MS,
    offers: {
      player1: Aug.drawOffers(tier, rand),
      player2: Aug.drawOffers(tier, rand)
    },
    ready: { player1: false, player2: false }
  };
}

// Called when player2 joins (status -> playing).
function startGame(room, rand, now) {
  if (!isAugment(room)) return;
  ensureAug(room.players.player1);
  ensureAug(room.players.player2);
  room.turnFlags = null;
  openAugmentPhase(room, 1, rand, now);
}

function validatePick(room, uid, augmentId) {
  if (room.status !== "playing") return fail("NOT_PLAYING");
  const pk = findPlayerKey(room.players || {}, uid);
  if (!pk) return fail("NOT_PLAYER");
  if (!isAugment(room)) return fail("NOT_AUGMENT");
  const phase = room.augmentPhase;
  if (!phase) return fail("NO_PHASE");
  const offers = (phase.offers && phase.offers[pk]) || [];
  if (Object.keys(offers).map((k) => offers[k]).indexOf(augmentId) === -1) return fail("NOT_OFFERED");
  return { ok: true, playerKey: pk, tier: phase.tier };
}

function markReady(room, playerKey, tier) {
  const phase = room.augmentPhase;
  if (!phase || phase.tier !== tier) return { ok: true, stale: true };
  phase.ready = phase.ready || {};
  phase.ready[playerKey] = true;
  return { ok: true };
}

// picks: { player1: id, player2: id } — both must be valid offers of the current phase.
function applyPicks(room, picks, tier, now) {
  const phase = room.augmentPhase;
  if (!isAugment(room) || !phase) return fail("NO_PHASE");
  if (phase.tier !== tier) return { ok: true, stale: true };
  for (const pk of ["player1", "player2"]) {
    const offers = (phase.offers && phase.offers[pk]) || [];
    const list = Object.keys(offers).map((k) => offers[k]);
    if (list.indexOf(picks[pk]) === -1) return fail("NOT_OFFERED");
  }
  for (const pk of ["player1", "player2"]) {
    const aug = ensureAug(room.players[pk]);
    const def = Aug.DEFS[picks[pk]];
    aug.owned.push(picks[pk]);
    if (def.pool) aug.charges[def.pool] = (aug.charges[def.pool] || 0) + def.charges;
  }
  room.augmentReveal = { tier: tier, player1: picks.player1, player2: picks.player2, ts: now };
  room.augmentPhase = null;
  return { ok: true };
}

// ─── Roll ───

function applyRoll(room, uid, randomValues) {
  if (room.status !== "playing") return fail("NOT_PLAYING");
  const pk = findPlayerKey(room.players || {}, uid);
  if (!pk) return fail("NOT_PLAYER");
  if (room.currentTurn !== pk) return fail("NOT_YOUR_TURN");

  const aug = isAugment(room);
  const rollCount = room.rollCount || 0;
  let flags = room.turnFlags || {};
  let cap = Aug.BASE_ROLLS;
  let useExtra = false;
  const me = room.players[pk];

  if (aug) {
    if (room.augmentPhase) return fail("AUGMENT_PHASE");
    ensureAug(me);
    if (flags.locked) return fail("ROLL_LOCKED");
    cap = rollCount === 0
      ? Aug.rollCap(me.aug, total(me, room.gameMode, true), total(room.players[opponentOf(pk)], room.gameMode, true))
      : (flags.rollCap || Aug.BASE_ROLLS);
    if (rollCount >= cap) {
      if (rollCount < Aug.MAX_ROLLS && Aug.charge(me.aug, "extraRoll") > 0) useExtra = true;
      else return fail("NO_ROLLS");
    }
  } else if (rollCount >= Aug.BASE_ROLLS) {
    return fail("NO_ROLLS");
  }

  const heldData = room.heldDice || {};
  const newDice = {};
  for (let i = 0; i < 5; i++) {
    const currentDie = room.dice && room.dice[i];
    const isHeld = rollCount > 0 && heldData[i] === true && currentDie && currentDie.value >= 1;
    newDice[i] = isHeld
      ? { value: currentDie.value, held: true }
      : { value: randomValues[i], held: false };
  }

  room.dice = newDice;
  room.rollCount = rollCount + 1;
  room.lastActivityAt = { ".sv": "timestamp" };

  if (aug) {
    // Keep this turn's declarations (callShot / all-in), made before the first roll.
    if (rollCount === 0) flags = { rollCap: cap, called: flags.called || null, allIn: flags.allIn === true };
    if (useExtra) {
      me.aug.charges.extraRoll -= 1;
      flags.extraUsed = (flags.extraUsed || 0) + 1;
    }
    room.turnFlags = flags;
  }
  return { ok: true, dice: newDice, rollCount: room.rollCount, extraUsed: useExtra };
}

// ─── Augment actions (own turn, before recording) ───

function applyAction(room, uid, action) {
  if (room.status !== "playing") return fail("NOT_PLAYING");
  const pk = findPlayerKey(room.players || {}, uid);
  if (!pk) return fail("NOT_PLAYER");
  if (!isAugment(room)) return fail("NOT_AUGMENT");
  if (room.augmentPhase) return fail("AUGMENT_PHASE");
  if (room.currentTurn !== pk) return fail("NOT_YOUR_TURN");
  if (!action || typeof action.type !== "string") return fail("INVALID_ACTION");

  const me = room.players[pk];
  const opp = room.players[opponentOf(pk)];
  const aug = ensureAug(me);
  const flags = room.turnFlags || {};
  const type = action.type;

  if (type === "copy" || type === "adjust" || type === "nudge" || type === "wild") {
    if (Aug.charge(aug, type) < 1) return fail("NO_CHARGE");
    if ((room.rollCount || 0) < 1) return fail("NO_ROLL_YET");
    if (flags.dieEdited) return fail("ALREADY_EDITED");
    if (!isInt(action.die, 0, 4)) return fail("INVALID_TARGET");
    const cur = room.dice && room.dice[action.die] && room.dice[action.die].value;
    if (!isInt(cur, 1, 6)) return fail("INVALID_DICE");
    let v;
    if (type === "copy") {
      if (!isInt(action.from, 0, 4) || action.from === action.die) return fail("INVALID_TARGET");
      v = room.dice[action.from] && room.dice[action.from].value;
    } else if (type === "adjust") {
      if (action.delta !== 1 && action.delta !== -1) return fail("INVALID_TARGET");
      v = cur + action.delta;
    } else if (type === "nudge") {
      if (action.delta !== 1 && action.delta !== -1) return fail("INVALID_TARGET");
      v = cur + action.delta;
    } else {
      v = action.value;
    }
    if (!isInt(v, 1, 6) || v === cur) return fail("INVALID_TARGET");
    // copy/wild block Yacht for the rest of the turn and edits end rolling, so the
    // player must still have a non-Yacht category to record (otherwise: deadlock).
    if ((type === "copy" || type === "wild") &&
        !Scoring.getCategories(room.gameMode).some((c) => c !== "yacht" && !filled(me.scores, c))) {
      return fail("EDIT_BLOCKED");
    }

    room.dice[action.die].value = v;
    aug.charges[type] -= 1;
    flags.dieEdited = true;
    flags.editType = type;
    flags.locked = true;
    if (type === "copy" || type === "wild") flags.noYacht = true;
    room.turnFlags = flags;
    room.lastActivityAt = { ".sv": "timestamp" };
    return { ok: true, type: type, die: action.die, value: v };
  }

  // Declarations: before the first roll, one per turn (callShot or all-in).
  if (type === "call" || type === "allIn") {
    const pool = type === "call" ? "call" : "allIn";
    if (Aug.charge(aug, pool) < 1) return fail("NO_CHARGE");
    if ((room.rollCount || 0) !== 0) return fail("DECLARE_AFTER_ROLL");
    if (flags.called || flags.allIn) return fail("ALREADY_DECLARED");
    if (type === "call") {
      const c = action.category;
      if (Aug.CALL_CATS.indexOf(c) === -1) return fail("INVALID_TARGET");
      if (filled(me.scores, c) || me.sealed === c) return fail("INVALID_TARGET");
      flags.called = c;
    } else {
      flags.allIn = true;
    }
    aug.charges[pool] -= 1;
    room.turnFlags = flags;
    room.lastActivityAt = { ".sv": "timestamp" };
    return { ok: true, type: type, category: flags.called || null };
  }

  if (type === "seal") {
    if (Aug.charge(aug, "seal") < 1) return fail("NO_CHARGE");
    const c = action.category;
    if (Scoring.getCategories(room.gameMode).indexOf(c) === -1) return fail("INVALID_TARGET");
    if (filled(opp.scores, c) || opp.sealed) return fail("INVALID_TARGET");
    opp.sealed = c;
    aug.charges.seal -= 1;
    room.lastActivityAt = { ".sv": "timestamp" };
    return { ok: true, type: type, category: c };
  }

  if (type === "swap") {
    if (Aug.charge(aug, "swap") < 1) return fail("NO_CHARGE");
    const c = action.category;
    if (Aug.UPPER.indexOf(c) === -1) return fail("INVALID_TARGET");
    if (!filled(me.scores, c) || !filled(opp.scores, c)) return fail("INVALID_TARGET");
    if (me.scores[c] === opp.scores[c]) return fail("INVALID_TARGET");
    const mine = me.scores[c];
    me.scores[c] = opp.scores[c];
    opp.scores[c] = mine;
    aug.charges.swap -= 1;
    room.lastSwap = { by: pk, category: c, ts: { ".sv": "timestamp" } };
    room.lastActivityAt = { ".sv": "timestamp" };
    return { ok: true, type: type, category: c };
  }

  return fail("INVALID_ACTION");
}

// ─── Select category ───

// opts: { useDouble: bool, useInsurance: 'safetyNet'|'bigInsurance'|null, rand: (n) => int, now: ms }
function applySelect(room, uid, category, opts) {
  opts = opts || {};
  if (room.status !== "playing") return fail("NOT_PLAYING");
  const pk = findPlayerKey(room.players || {}, uid);
  if (!pk) return fail("NOT_PLAYER");
  if (room.currentTurn !== pk) return fail("NOT_YOUR_TURN");
  if ((room.rollCount || 0) < 1) return fail("NO_ROLL_YET");

  const gameMode = room.gameMode;
  const aug = isAugment(room);
  if (Scoring.getCategories(gameMode).indexOf(category) === -1) return fail("INVALID_CATEGORY");

  const me = room.players[pk];
  const oppKey = opponentOf(pk);
  const myScores = me.scores || {};
  if (filled(myScores, category)) return fail("CATEGORY_FILLED");

  const flags = room.turnFlags || {};
  if (aug) {
    if (room.augmentPhase) return fail("AUGMENT_PHASE");
    ensureAug(me);
    if (flags.noYacht && category === "yacht") return fail("YACHT_BLOCKED");
    if (opts.useDouble) {
      if (category === "yacht") return fail("DOUBLE_YACHT");
      if (Aug.charge(me.aug, "double") < 1) return fail("NO_CHARGE");
    }
    if (opts.useInsurance) {
      if (Aug.INSURANCE.indexOf(opts.useInsurance) === -1) return fail("INVALID_ACTION");
      if (Aug.charge(me.aug, opts.useInsurance) < 1) return fail("NO_CHARGE");
    }
    if (opts.useCoin) {
      if (category === "yacht") return fail("DOUBLE_YACHT");
      if (Aug.charge(me.aug, "coin") < 1) return fail("NO_CHARGE");
    }
    // One active multiplier per record: double, coin and all-in don't stack.
    if ((opts.useDouble ? 1 : 0) + (opts.useCoin ? 1 : 0) + (flags.allIn ? 1 : 0) > 1) return fail("MULTIPLIER_CONFLICT");
  } else if (opts.useDouble || opts.useInsurance || opts.useCoin) {
    return fail("NOT_AUGMENT");
  }

  const diceValues = [];
  for (let i = 0; i < 5; i++) {
    const d = room.dice && room.dice[i];
    const v = (d && d.value) || 0;
    if (v < 1 || v > 6) return fail("INVALID_DICE");
    diceValues.push(v);
  }

  // ── validation done; mutate ──
  let score;
  let effects = [];
  if (aug) {
    // coinFlip: 0 = win, 1 = lose (server pre-draws it; falls back to rand)
    const coinFlip = !opts.useCoin ? null : (opts.coinFlip === 0 || opts.coinFlip === 1) ? opts.coinFlip : opts.rand(2);
    const cats = Scoring.getCategories(gameMode);
    const r = Aug.finalScore(diceValues, category, {
      aug: me.aug, sealed: me.sealed, useDouble: !!opts.useDouble, useInsurance: opts.useInsurance || null,
      called: flags.called || null, allIn: flags.allIn === true,
      coin: coinFlip === null ? null : (coinFlip === 0 ? "win" : "lose"),
      isLastStand: filledCount(myScores, gameMode) >= cats.length - Aug.LAST_STAND_RECORDS
    });
    score = r.score;
    effects = r.effects;
    for (const pool of Object.keys(r.consume)) me.aug.charges[pool] -= r.consume[pool];
    // Hot streak: bonus for consecutive records of STREAK_MIN+ (after every other effect).
    if (Aug.owns(me.aug, "hotStreak")) {
      const st = Aug.streakStep(me.aug, me.streak || 0, score);
      if (st.bonus > 0) { score += st.bonus; effects.push("hotStreak"); }
      me.streak = st.streak;
    }
  } else {
    score = Scoring.calculate(diceValues, category, gameMode);
  }

  me.scores = myScores;
  me.scores[category] = score;
  me.lastCategory = category;
  if (aug) me.lastEffects = effects.length ? effects : null;

  if ((category === "yacht" || category === "yahtzee") && score === 50) {
    room.celebration = { player: pk, ts: { ".sv": "timestamp" } };
  }

  let yahtzeeBonus = false;
  if (gameMode === "yahtzee") {
    const allSame = diceValues.every((v) => v === diceValues[0]);
    if (allSame && myScores.yahtzee === 50 && category !== "yahtzee") {
      me.scores.yahtzeeBonus = (myScores.yahtzeeBonus || 0) + 100;
      yahtzeeBonus = true;
    }
  }

  room.lastActivityAt = { ".sv": "timestamp" };
  room.currentTurn = oppKey;
  room.rollCount = 0;
  for (let i = 0; i < 5; i++) {
    if (room.dice[i]) {
      room.dice[i].held = false;
      room.dice[i].value = 0;
    }
  }
  room.heldDice = null;
  if (aug) room.turnFlags = null;

  const opp = room.players[oppKey] || {};
  const oppScores = opp.scores || {};
  let steals = null;

  if (Scoring.allFilled(me.scores, gameMode) && Scoring.allFilled(oppScores, gameMode)) {
    if (aug) {
      steals = applySteals(room, gameMode, opts);
    }
    const myTotal = total(me, gameMode, aug);
    const oppTotal = total(opp, gameMode, aug);
    if (myTotal > oppTotal) room.winner = pk;
    else if (oppTotal > myTotal) room.winner = oppKey;
    else room.winner = "tie";
    room.status = "finished";
  } else if (aug) {
    // Open the next augment pick when both players have completed the tier's round.
    const mine = filledCount(me.scores, gameMode);
    const theirs = filledCount(oppScores, gameMode);
    if (mine === theirs) {
      for (const tier of [2, 3]) {
        if (Aug.TIER_ROUNDS[tier] === mine) {
          if (typeof opts.rand !== "function") throw new Error("applySelect: rand required");
          openAugmentPhase(room, tier, opts.rand, opts.now);
        }
      }
    }
  }

  return { ok: true, score: score, effects: effects, yahtzeeBonus: yahtzeeBonus, playerKey: pk, steals: steals };
}

// Game end: steals (simultaneous, from pre-steal scores), then the lottery roll.
// opts.lotteryDice: { player1: 1-6, player2: 1-6 } pre-drawn by the server (falls back to opts.rand).
function applySteals(room, gameMode, opts) {
  const cats = Scoring.getCategories(gameMode);
  const plan = [];
  for (const pk of ["player1", "player2"]) {
    const me = room.players[pk];
    if (!Aug.owns(ensureAug(me), "steal")) continue;
    const t = Aug.stealTarget(room.players[opponentOf(pk)].scores || {}, cats);
    if (t && t.amount > 0) plan.push({ by: pk, category: t.category, amount: t.amount });
  }
  for (const s of plan) {
    const victim = room.players[opponentOf(s.by)].scores;
    const thief = room.players[s.by].scores;
    victim[s.category] -= s.amount;
    thief[s.category] += s.amount;
  }
  room.stealLog = plan.length ? plan : null;
  // Lottery: one die per owner; LOTTERY_MIN+ wins the prize (kept apart from categories).
  const lotto = [];
  for (const pk of ["player1", "player2"]) {
    const p = room.players[pk];
    if (!Aug.owns(ensureAug(p), "lottery")) continue;
    const pre = opts && opts.lotteryDice && opts.lotteryDice[pk];
    let die;
    if (isInt(pre, 1, 6)) die = pre;
    else if (opts && typeof opts.rand === "function") die = 1 + opts.rand(6);
    else throw new Error("applySteals: lottery dice required");
    const prize = die >= Aug.LOTTERY_MIN ? Aug.LOTTERY_SCORE : 0;
    p.scores.lottery = prize;
    lotto.push({ by: pk, die: die, prize: prize });
  }
  room.lotteryLog = lotto.length ? lotto : null;
  return plan;
}

// Timeout: fill in a random offer for every player who has not picked yet.
// picks: hidden picks already stored; returns a complete { player1, player2 } map.
function fillMissingPicks(room, picks, rand) {
  const phase = room.augmentPhase;
  const out = Object.assign({}, picks || {});
  for (const pk of ["player1", "player2"]) {
    if (out[pk]) continue;
    const offers = (phase.offers && phase.offers[pk]) || [];
    const list = Object.keys(offers).map((k) => offers[k]);
    out[pk] = list[rand(list.length)];
  }
  return out;
}

module.exports = {
  ERRORS,
  findPlayerKey,
  opponentOf,
  isAugment,
  ensureAug,
  filledCount,
  total,
  startGame,
  openAugmentPhase,
  validatePick,
  markReady,
  applyPicks,
  fillMissingPicks,
  applyRoll,
  applyAction,
  applySelect
};
