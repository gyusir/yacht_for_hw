// Augment definitions and scoring pipeline for Augment mode (Yacht only).
// IMPORTANT: shared verbatim with yacht_for_hw/js/augments.js (client preview).
// Edit this file, then copy it to js/augments.js (tools/augment_sim.js checks they match).
(function (root, factory) {
  var api;
  if (typeof module === 'object' && module.exports) {
    api = factory(require('./scoring'));
    module.exports = api;
  } else {
    root.YachtGame = root.YachtGame || {};
    root.YachtGame.Augments = factory(root.YachtGame.Scoring);
  }
})(typeof self !== 'undefined' ? self : this, function (Scoring) {
  'use strict';

  // kind: passive  = applied automatically by the server
  //       roll     = automatic extra roll when the normal roll cap is reached
  //       dieEdit  = active, changes one die after rolling (ends rolling for the turn)
  //       target   = active, targets a category (seal: opponent / swap: both players)
  //       toggle   = active, armed by the player and applied with selectCategory (double, insurance, coin)
  //       declare  = active, declared before the first roll of a turn (callShot, allIn)
  // pool: charge pool the augment adds to (augments sharing a pool stack their charges)
  var DEFS = {
    // ── Tier 1 (picked before turn 1) ──
    extraRoll:      { tier: 1, kind: 'roll',    pool: 'extraRoll',   charges: 3 },
    safetyNet:      { tier: 1, kind: 'toggle',  pool: 'safetyNet',   charges: 1 },   // armed: a 0 becomes 10
    straightRelax:  { tier: 1, kind: 'passive' },
    fullHouseBonus: { tier: 1, kind: 'passive' },
    copy:           { tier: 1, kind: 'dieEdit', pool: 'copy',        charges: 1 },
    jackpot:        { tier: 1, kind: 'passive' },                                    // Yacht 50 -> 90
    coin:           { tier: 1, kind: 'toggle',  pool: 'coin',        charges: 2 },   // armed: x2 or x1/2 (50/50)
    shortcut:       { tier: 1, kind: 'passive' },                                    // upper bonus hurdle 63 -> 55
    // ── Tier 2 (picked before turn 5) ──
    fourthRoll:     { tier: 2, kind: 'passive' },
    seal:           { tier: 2, kind: 'target',  pool: 'seal',        charges: 1 },
    double:         { tier: 2, kind: 'toggle',  pool: 'double',      charges: 1 },
    comeback:       { tier: 2, kind: 'passive' },
    nudge:          { tier: 2, kind: 'dieEdit', pool: 'nudge',       charges: 1 },   // +1 or -1, once
    hotStreak:      { tier: 2, kind: 'passive' },                                    // consecutive records >= 12: +6/+12/+18/+24
    callShot:       { tier: 2, kind: 'declare', pool: 'call',        charges: 4 },   // call a combo; record it (> 0) for +25
    allIn:          { tier: 2, kind: 'declare', pool: 'allIn',       charges: 2 },   // record >= 18 doubles, else 0
    // ── Tier 3 (picked before turn 9) ──
    swap:           { tier: 3, kind: 'target',  pool: 'swap',        charges: 1 },
    wild:           { tier: 3, kind: 'dieEdit', pool: 'wild',        charges: 1 },
    bigInsurance:   { tier: 3, kind: 'toggle',  pool: 'bigInsurance', charges: 1 },  // armed: a 0 becomes 20
    steal:          { tier: 3, kind: 'passive' },
    fineTune:       { tier: 3, kind: 'dieEdit', pool: 'adjust',      charges: 2 },   // +1 or -1
    lastStand:      { tier: 3, kind: 'passive' },                                    // last 2 records x2
    lottery:        { tier: 3, kind: 'passive' },                                    // game end: die >= 4 -> +40
    finalSprint:    { tier: 3, kind: 'passive' }                                     // each non-zero record +5
  };

  var TIER_ROUNDS = { 1: 0, 2: 4, 3: 8 };     // pick happens when both players have filled N categories
  var OFFER_SIZE = 2;
  var MAX_ROLLS = 5;
  var BASE_ROLLS = 3;
  var FULL_HOUSE_BONUS = 10;
  var SAFETY_NET_SCORE = 10;
  var BIG_INSURANCE_SCORE = 20;
  var STEAL_PERCENT = 30;
  var UPPER = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];
  var INSURANCE = ['safetyNet', 'bigInsurance'];
  // Upper-section bonus (augment mode only). Computed from current scores, so it
  // disappears if a steal/swap drops the upper sum below the hurdle.
  var UPPER_BONUS_HURDLE = 63;
  var UPPER_BONUS = 35;
  var PICK_TIME_MS = 90000; // augment pick time limit
  var JACKPOT_SCORE = 90;
  var COIN_WIN = 2, COIN_LOSE = 0.5;
  var SHORTCUT_HURDLE = 55;
  var STREAK_MIN = 12, STREAK_STEP = 6, STREAK_MAX_LEVEL = 4;  // bonus = STEP * min(streak, MAX_LEVEL)
  var CALL_BONUS = 25;
  var CALL_CATS = ['fourOfAKind', 'fullHouse', 'smallStraight', 'largeStraight'];
  var ALLIN_MIN = 18;
  var LAST_STAND_RECORDS = 2;
  var LOTTERY_MIN = 4, LOTTERY_SCORE = 40;
  var SPRINT_BONUS = 5;

  function idsOfTier(tier) {
    var out = [];
    for (var id in DEFS) {
      if (DEFS.hasOwnProperty(id) && DEFS[id].tier === tier) out.push(id);
    }
    return out;
  }

  // rand(n) -> integer in [0, n)
  function drawOffers(tier, rand) {
    var pool = idsOfTier(tier);
    var out = [];
    while (out.length < OFFER_SIZE && pool.length > 0) {
      var i = rand(pool.length);
      out.push(pool[i]);
      pool.splice(i, 1);
    }
    return out;
  }

  function owns(aug, id) {
    var owned = (aug && aug.owned) || [];
    for (var i = 0; i < owned.length; i++) if (owned[i] === id) return true;
    return false;
  }

  function charge(aug, pool) {
    return (aug && aug.charges && aug.charges[pool]) || 0;
  }

  function longestRun(dice) {
    var seen = {};
    for (var i = 0; i < dice.length; i++) seen[dice[i]] = true;
    var best = 0, cur = 0;
    for (var v = 1; v <= 6; v++) {
      cur = seen[v] ? cur + 1 : 0;
      if (cur > best) best = cur;
    }
    return best;
  }

  // Category score including passive scoring augments (before seal/double/insurance).
  function baseScore(dice, category, aug) {
    var s = Scoring.calculate(dice, category, 'yacht');
    if (category === 'smallStraight' && s === 0 && owns(aug, 'straightRelax') && longestRun(dice) >= 4) {
      s = 30;
    }
    if (category === 'fullHouse' && s > 0 && owns(aug, 'fullHouseBonus')) {
      s += FULL_HOUSE_BONUS;
    }
    if (category === 'yacht' && s === 50 && owns(aug, 'jackpot')) s = JACKPOT_SCORE;
    return s;
  }

  // Full scoring pipeline (fixed order):
  //   base -> seal -> callShot +25 -> double x2 -> all-in (>= 18 x2, else 0) -> coin (x2 / x1/2)
  //   -> last stand x2 -> final sprint +5 -> insurance (0 -> 10/20)
  // (the hot-streak bonus is added afterwards by the rules engine, it depends on the record history)
  // ctx: { aug, sealed (category sealed on this player), useDouble, useInsurance ('safetyNet'|'bigInsurance'|null),
  //        called (category declared with callShot this turn), allIn (bool), coin ('win'|'lose'|null),
  //        isLastStand (bool: one of this player's last LAST_STAND_RECORDS records) }
  // Insurance only applies when the player armed it AND the score would be 0; otherwise it is kept.
  // coin === 'preview' shows the score without resolving the flip.
  // Returns { score, effects: [..], consume: { pool: n } } without mutating anything.
  function finalScore(dice, category, ctx) {
    var aug = ctx.aug;
    var effects = [];
    var consume = {};
    var s = baseScore(dice, category, aug);
    var raw = Scoring.calculate(dice, category, 'yacht');
    if (s !== raw) effects.push(category === 'fullHouse' ? 'fullHouseBonus' : category === 'yacht' ? 'jackpot' : 'straightRelax');

    if (ctx.sealed && ctx.sealed === category) {
      return { score: 0, effects: ['sealed'], consume: consume };
    }
    if (ctx.called && ctx.called === category && s > 0) {
      s += CALL_BONUS;
      effects.push('callShot');
    }
    if (ctx.useDouble) {
      s = s * 2;
      consume.double = 1;
      effects.push('double');
    }
    if (ctx.allIn) {
      s = s >= ALLIN_MIN ? s * 2 : 0;
      effects.push(s > 0 ? 'allInWin' : 'allInLose');
    }
    if (ctx.coin === 'win' || ctx.coin === 'lose') {
      s = ctx.coin === 'win' ? s * COIN_WIN : Math.floor(s * COIN_LOSE);
      consume.coin = 1;
      effects.push(ctx.coin === 'win' ? 'coinWin' : 'coinLose');
    }
    if (ctx.isLastStand && owns(aug, 'lastStand') && s > 0) {
      s = s * 2;
      effects.push('lastStand');
    }
    if (owns(aug, 'finalSprint') && s > 0) {
      s += SPRINT_BONUS;
      effects.push('finalSprint');
    }
    var ins = ctx.useInsurance;
    if (s === 0 && ins && INSURANCE.indexOf(ins) !== -1 && charge(aug, ins) > 0) {
      s = ins === 'bigInsurance' ? BIG_INSURANCE_SCORE : SAFETY_NET_SCORE;
      consume[ins] = 1;
      effects.push(ins);
    }
    return { score: s, effects: effects, consume: consume };
  }

  // Roll cap for a turn, fixed at the first roll of the turn.
  function rollCap(aug, myTotal, oppTotal) {
    var cap = BASE_ROLLS;
    if (owns(aug, 'fourthRoll')) cap += 1;
    if (owns(aug, 'comeback') && myTotal < oppTotal) cap += 2;
    return Math.min(cap, MAX_ROLLS);
  }

  function upperSum(scores) {
    var s = 0;
    for (var i = 0; i < UPPER.length; i++) {
      var v = scores && scores[UPPER[i]];
      if (v !== null && v !== undefined) s += v;
    }
    return s;
  }

  // Upper-bonus hurdle for a player (shortcut lowers it).
  function bonusHurdle(aug) {
    return owns(aug, 'shortcut') ? SHORTCUT_HURDLE : UPPER_BONUS_HURDLE;
  }

  function upperBonus(scores, aug) {
    return upperSum(scores) >= bonusHurdle(aug) ? UPPER_BONUS : 0;
  }

  // Hot-streak bonus for a record of `score` given the player's current streak.
  // Returns { bonus, streak } (the streak after this record).
  function streakStep(aug, streak, score) {
    if (!owns(aug, 'hotStreak')) return { bonus: 0, streak: 0 };
    streak = streak || 0;
    if (score < STREAK_MIN) return { bonus: 0, streak: 0 };
    return { bonus: STREAK_STEP * Math.min(streak, STREAK_MAX_LEVEL), streak: streak + 1 };
  }

  // Total score in augment mode (Yacht categories + upper-section bonus + lottery prize).
  // aug: the player's augments (shortcut changes the bonus hurdle).
  function totalScore(scores, aug) {
    scores = scores || {};
    return Scoring.totalScore(scores, 'yacht') + upperBonus(scores, aug) + (scores.lottery || 0);
  }

  // Steal amount this player takes from the opponent at game end (pre-steal scores).
  function stealTarget(oppScores, categories) {
    var best = null;
    for (var i = 0; i < categories.length; i++) {
      var c = categories[i];
      if (c === 'yacht') continue;
      var v = oppScores[c] || 0;
      if (best === null || v > best.value) best = { category: c, value: v };
    }
    if (!best || best.value <= 0) return null;
    return { category: best.category, amount: Math.floor(best.value * STEAL_PERCENT / 100) };
  }

  return {
    DEFS: DEFS,
    TIER_ROUNDS: TIER_ROUNDS,
    MAX_ROLLS: MAX_ROLLS,
    BASE_ROLLS: BASE_ROLLS,
    UPPER: UPPER,
    INSURANCE: INSURANCE,
    UPPER_BONUS_HURDLE: UPPER_BONUS_HURDLE,
    UPPER_BONUS: UPPER_BONUS,
    PICK_TIME_MS: PICK_TIME_MS,
    JACKPOT_SCORE: JACKPOT_SCORE,
    SHORTCUT_HURDLE: SHORTCUT_HURDLE,
    STREAK_MIN: STREAK_MIN,
    STREAK_STEP: STREAK_STEP,
    STREAK_MAX_LEVEL: STREAK_MAX_LEVEL,
    CALL_BONUS: CALL_BONUS,
    CALL_CATS: CALL_CATS,
    ALLIN_MIN: ALLIN_MIN,
    LAST_STAND_RECORDS: LAST_STAND_RECORDS,
    LOTTERY_MIN: LOTTERY_MIN,
    LOTTERY_SCORE: LOTTERY_SCORE,
    SPRINT_BONUS: SPRINT_BONUS,
    bonusHurdle: bonusHurdle,
    streakStep: streakStep,
    upperSum: upperSum,
    upperBonus: upperBonus,
    totalScore: totalScore,
    idsOfTier: idsOfTier,
    drawOffers: drawOffers,
    owns: owns,
    charge: charge,
    baseScore: baseScore,
    finalScore: finalScore,
    rollCap: rollCap,
    stealTarget: stealTarget
  };
});
