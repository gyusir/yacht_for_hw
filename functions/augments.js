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
  //       toggle   = active, armed by the player and applied with selectCategory (double, insurance)
  // pool: charge pool the augment adds to (augments sharing a pool stack their charges)
  var DEFS = {
    // ── Tier 1 (picked before turn 1) ──
    extraRoll:      { tier: 1, kind: 'roll',    pool: 'extraRoll',   charges: 3 },
    safetyNet:      { tier: 1, kind: 'toggle',  pool: 'safetyNet',   charges: 1 },   // armed: a 0 becomes 10
    straightRelax:  { tier: 1, kind: 'passive' },
    fullHouseBonus: { tier: 1, kind: 'passive' },
    copy:           { tier: 1, kind: 'dieEdit', pool: 'copy',        charges: 1 },
    // ── Tier 2 (picked before turn 5) ──
    fourthRoll:     { tier: 2, kind: 'passive' },
    seal:           { tier: 2, kind: 'target',  pool: 'seal',        charges: 1 },
    double:         { tier: 2, kind: 'toggle',  pool: 'double',      charges: 1 },
    comeback:       { tier: 2, kind: 'passive' },
    nudge:          { tier: 2, kind: 'dieEdit', pool: 'nudge',       charges: 1 },   // +1 or -1, once
    // ── Tier 3 (picked before turn 9) ──
    swap:           { tier: 3, kind: 'target',  pool: 'swap',        charges: 1 },
    wild:           { tier: 3, kind: 'dieEdit', pool: 'wild',        charges: 1 },
    bigInsurance:   { tier: 3, kind: 'toggle',  pool: 'bigInsurance', charges: 1 },  // armed: a 0 becomes 20
    steal:          { tier: 3, kind: 'passive' },
    fineTune:       { tier: 3, kind: 'dieEdit', pool: 'adjust',      charges: 2 }    // +1 or -1
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
    return s;
  }

  // Full scoring pipeline (fixed order): base -> seal -> double -> insurance.
  // ctx: { aug, sealed (category sealed on this player), useDouble, useInsurance ('safetyNet'|'bigInsurance'|null) }
  // Insurance only applies when the player armed it AND the score would be 0; otherwise it is kept.
  // Returns { score, effects: [..], consume: { pool: n } } without mutating anything.
  function finalScore(dice, category, ctx) {
    var aug = ctx.aug;
    var effects = [];
    var consume = {};
    var s = baseScore(dice, category, aug);
    var raw = Scoring.calculate(dice, category, 'yacht');
    if (s !== raw) effects.push(category === 'fullHouse' ? 'fullHouseBonus' : 'straightRelax');

    if (ctx.sealed && ctx.sealed === category) {
      return { score: 0, effects: ['sealed'], consume: consume };
    }
    if (ctx.useDouble) {
      s = s * 2;
      consume.double = 1;
      effects.push('double');
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

  function upperBonus(scores) {
    return upperSum(scores) >= UPPER_BONUS_HURDLE ? UPPER_BONUS : 0;
  }

  // Total score in augment mode (Yacht categories + upper-section bonus).
  function totalScore(scores) {
    return Scoring.totalScore(scores || {}, 'yacht') + upperBonus(scores || {});
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
