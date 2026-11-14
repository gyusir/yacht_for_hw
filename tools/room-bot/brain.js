// Room bot — rule-based part: dice holds, stop/roll, category choice and the
// candidate lists Claude chooses from. Pure functions over the room object, using
// the same augment/scoring code as Cloud Functions.
'use strict';

const Rules = require("../../functions/game-rules");
const Aug = require("../../functions/augments");
const Scoring = require("../../functions/scoring");

const CATS = Scoring.getCategories("yacht");
// Typical score per category (from tools/augment_sim.js): utility = score - PAR.
const PAR = { ones: 2, twos: 5, threes: 8, fours: 12, fives: 15, sixes: 19, choice: 22,
  fourOfAKind: 14, fullHouse: 16, smallStraight: 9, largeStraight: 9, yacht: 12 };
const EDIT_TYPES = ["nudge", "adjust", "copy", "wild"];
const EDIT_THRESHOLD = { nudge: 6, adjust: 6, copy: 8, wild: 15 };
const EXTRA_ROLL_GAIN = 5;

function diceOf(room) { return [0, 1, 2, 3, 4].map((i) => (room.dice && room.dice[i] && room.dice[i].value) || 0); }
function isFilled(scores, c) { return scores && scores[c] !== null && scores[c] !== undefined; }
function emptyCats(scores) { return CATS.filter((c) => !isFilled(scores, c)); }
function filledCount(scores) { return CATS.length - emptyCats(scores).length; }

// Utility of recording `sc` in category c: score above par, plus upper-bonus pace and
// hot-streak shaping (same idea as the augment simulator's heuristic player).
function utility(c, sc, me) {
  let u = sc - PAR[c];
  const upSum = Aug.upperSum(me.scores || {});
  const hurdle = Aug.bonusHurdle(me.aug);
  const face = Aug.UPPER.indexOf(c) + 1;
  if (face > 0 && upSum < hurdle) u += 0.8 * (sc - face * 3 * hurdle / 63);
  if (Aug.owns(me.aug, "hotStreak")) {
    const lvl = Math.min((me.streak || 0) + 1, Aug.STREAK_MAX_LEVEL);
    u += sc >= Aug.STREAK_MIN ? 0.6 * Aug.STREAK_STEP * lvl : -0.6 * Aug.STREAK_STEP * Math.min(me.streak || 0, Aug.STREAK_MAX_LEVEL);
  }
  return u;
}

// Score of recording dice in c this turn, without active toggles (seal, call, all-in,
// last stand and final sprint included).
function plainScore(d, c, me, flags) {
  const isLast = filledCount(me.scores) >= CATS.length - Aug.LAST_STAND_RECORDS;
  return Aug.finalScore(d, c, { aug: me.aug, sealed: me.sealed, called: flags.called || null,
    allIn: flags.allIn === true, isLastStand: isLast }).score;
}

function bestChoice(d, me, flags, banYacht) {
  let b = null;
  for (const c of emptyCats(me.scores)) {
    if (banYacht && c === "yacht") continue;
    const sc = plainScore(d, c, me, flags);
    const u = utility(c, sc, me);
    if (!b || u > b.u) b = { c: c, sc: sc, u: u };
  }
  return b;
}

// ── Hold search: exact expectation over dice multisets ──
const FACT = [1, 1, 2, 6, 24, 120];
const OUTCOMES = []; // OUTCOMES[k] = [{ vals, p }] for k rerolled dice
for (let k = 0; k <= 5; k++) {
  const out = [];
  (function rec(start, acc) {
    if (acc.length === k) {
      const cnt = {}; acc.forEach((v) => { cnt[v] = (cnt[v] || 0) + 1; });
      let ways = FACT[k]; Object.keys(cnt).forEach((v) => { ways /= FACT[cnt[v]]; });
      out.push({ vals: acc.slice(), p: ways / Math.pow(6, k) });
      return;
    }
    for (let v = start; v <= 6; v++) { acc.push(v); rec(v, acc); acc.pop(); }
  })(1, []);
  OUTCOMES.push(out);
}

function keepSets(sorted) {
  const seen = new Set(); const out = [];
  for (let m = 0; m < 32; m++) {
    const keep = sorted.filter((_, i) => m & (1 << i));
    const key = keep.join("");
    if (!seen.has(key)) { seen.add(key); out.push(keep); }
  }
  return out;
}

// planner(me, flags, banYacht) -> { value(dice, rollsLeft), bestKeep(dice, rollsLeft) }
function planner(me, flags, banYacht) {
  const memo = new Map();
  function value(sorted, rolls) {
    const key = sorted.join("") + "|" + rolls;
    if (memo.has(key)) return memo.get(key);
    let v = bestChoice(sorted, me, flags, banYacht).u;
    if (rolls > 0) {
      for (const keep of keepSets(sorted)) {
        if (keep.length === 5) continue;
        let ev = 0;
        for (const o of OUTCOMES[5 - keep.length]) ev += o.p * value(keep.concat(o.vals).sort(), rolls - 1);
        if (ev > v) v = ev;
      }
    }
    memo.set(key, v);
    return v;
  }
  function bestKeep(d, rolls) {
    const sorted = d.slice().sort();
    let best = { keep: sorted.slice(), ev: bestChoice(sorted, me, flags, banYacht).u };
    for (const keep of keepSets(sorted)) {
      if (keep.length === 5) continue;
      let ev = 0;
      for (const o of OUTCOMES[5 - keep.length]) ev += o.p * value(keep.concat(o.vals).sort(), rolls - 1);
      if (ev > best.ev + 1e-9) best = { keep: keep, ev: ev };
    }
    return best;
  }
  return { value: value, bestKeep: bestKeep };
}

// Map a kept multiset back to die indices.
function keepIndices(d, keep) {
  const left = keep.slice(); const idx = [];
  d.forEach((v, i) => { const j = left.indexOf(v); if (j !== -1) { left.splice(j, 1); idx.push(i); } });
  return idx;
}

// Decide the next dice move on the bot's turn after at least one roll.
// Returns { roll: true, hold: [indices], extra: bool } or { roll: false }.
function diceMove(room, pk) {
  const me = room.players[pk];
  Rules.ensureAug(me);
  const flags = room.turnFlags || {};
  if (flags.locked) return { roll: false };
  const d = diceOf(room);
  const cap = flags.rollCap || Aug.BASE_ROLLS;
  const rc = room.rollCount || 0;
  const plan = planner(me, flags, !!flags.noYacht);
  const now = bestChoice(d, me, flags, !!flags.noYacht).u;
  if (rc < cap) {
    const b = plan.bestKeep(d, cap - rc);
    if (b.keep.length === 5) return { roll: false };
    return { roll: true, hold: keepIndices(d, b.keep), extra: false };
  }
  if (rc < Aug.MAX_ROLLS && Aug.charge(me.aug, "extraRoll") > 0) {
    const b = plan.bestKeep(d, 1);
    if (b.keep.length < 5 && b.ev - now >= EXTRA_ROLL_GAIN) return { roll: true, hold: keepIndices(d, b.keep), extra: true };
  }
  return { roll: false };
}

// ── Candidates for Claude ──

// Pre-roll options (seal / swap / declarations), each with a short fact sheet.
function preRollOptions(room, pk) {
  const me = room.players[pk];
  const opp = room.players[Rules.opponentOf(pk)];
  Rules.ensureAug(me); Rules.ensureAug(opp);
  const flags = room.turnFlags || {};
  const out = { seal: [], swap: [], call: [], allIn: false };
  if (Aug.charge(me.aug, "seal") > 0 && !opp.sealed) {
    out.seal = emptyCats(opp.scores).map((c) => ({ category: c, typical: PAR[c] }));
  }
  if (Aug.charge(me.aug, "swap") > 0) {
    const margin = (ms, os) => Aug.totalScore(ms, me.aug) - Aug.totalScore(os, opp.aug);
    const base = margin(me.scores, opp.scores);
    for (const c of Aug.UPPER) {
      if (!isFilled(me.scores, c) || !isFilled(opp.scores, c) || me.scores[c] === opp.scores[c]) continue;
      const ms = Object.assign({}, me.scores, { [c]: opp.scores[c] });
      const os = Object.assign({}, opp.scores, { [c]: me.scores[c] });
      out.swap.push({ category: c, mine: me.scores[c], theirs: opp.scores[c], marginGain: margin(ms, os) - base });
    }
  }
  if ((room.rollCount || 0) === 0 && !flags.called && !flags.allIn) {
    if (Aug.charge(me.aug, "call") > 0) {
      out.call = Aug.CALL_CATS.filter((c) => !isFilled(me.scores, c) && me.sealed !== c);
    }
    out.allIn = Aug.charge(me.aug, "allIn") > 0;
  }
  return out;
}

function hasPreRollChoice(o) {
  return o.seal.length > 0 || o.swap.length > 0 || o.call.length > 0 || o.allIn;
}

// Rule-based default for the pre-roll decision (what the simulator does).
function defaultPreRoll(room, pk, o) {
  const me = room.players[pk];
  const avail = emptyCats(me.scores);
  const plan = { seal: null, swap: null, declare: null };
  if (o.seal.length) plan.seal = o.seal.reduce((a, b) => (b.typical > a.typical ? b : a)).category;
  if (o.swap.length && avail.length === 1) {
    const best = o.swap.reduce((a, b) => (b.marginGain > a.marginGain ? b : a));
    if (best.marginGain > 0) plan.swap = best.category;
  }
  const order = ["smallStraight", "fullHouse", "largeStraight", "fourOfAKind"];
  const call = order.find((c) => o.call.indexOf(c) !== -1);
  if (call) plan.declare = { type: "call", category: call };
  else if (o.allIn) {
    const big = ["choice", "largeStraight", "smallStraight", "fullHouse", "fourOfAKind"].filter((c) => avail.indexOf(c) !== -1).length;
    if (big >= 2 || avail.length <= 2) plan.declare = { type: "allIn" };
  }
  return plan;
}

function editActions(room, me) {
  const flags = room.turnFlags || {};
  if (flags.dieEdited || (room.rollCount || 0) < 1) return [];
  const d = diceOf(room);
  const nonYachtOpen = emptyCats(me.scores).some((c) => c !== "yacht");
  const out = [];
  for (const type of EDIT_TYPES) {
    if (Aug.charge(me.aug, type) < 1) continue;
    if ((type === "copy" || type === "wild") && !nonYachtOpen) continue;
    for (let i = 0; i < 5; i++) {
      const vals = type === "copy" ? d.map((v, j) => (j === i ? null : v)) : (type === "wild" ? [1, 2, 3, 4, 5, 6] : [d[i] - 1, d[i] + 1]);
      const seen = new Set();
      vals.forEach((v, j) => {
        if (v === null || v < 1 || v > 6 || v === d[i] || seen.has(v)) return;
        seen.add(v);
        const dd = d.slice(); dd[i] = v;
        const action = type === "copy" ? { type: type, die: i, from: j }
          : type === "wild" ? { type: type, die: i, value: v } : { type: type, die: i, delta: v - d[i] };
        out.push({ action: action, dice: dd, banYacht: type === "copy" || type === "wild" });
      });
    }
  }
  return out;
}

// Final options for the turn: [{ edit, category, useDouble, useCoin, useInsurance, score, u, note }]
// sorted by utility. `score` is the recorded score (coin: expected value).
function finalOptions(room, pk) {
  const me = room.players[pk];
  Rules.ensureAug(me);
  const flags = room.turnFlags || {};
  const isLast = filledCount(me.scores) >= CATS.length - Aug.LAST_STAND_RECORDS;
  const variants = [{ edit: null, dice: diceOf(room), banYacht: !!flags.noYacht }].concat(editActions(room, me));
  const toggles = [{}];
  if (!flags.allIn && Aug.charge(me.aug, "double") > 0) toggles.push({ useDouble: true });
  if (!flags.allIn && Aug.charge(me.aug, "coin") > 0) toggles.push({ useCoin: true });
  const out = [];
  for (const v of variants) {
    for (const c of emptyCats(me.scores)) {
      if ((v.banYacht || flags.noYacht) && c === "yacht") continue;
      for (const t of toggles) {
        if (c === "yacht" && (t.useDouble || t.useCoin)) continue;
        const ctx = { aug: me.aug, sealed: me.sealed, called: flags.called || null, allIn: flags.allIn === true,
          isLastStand: isLast, useDouble: !!t.useDouble };
        let sc;
        if (t.useCoin) {
          const w = Aug.finalScore(v.dice, c, Object.assign({}, ctx, { coin: "win" })).score;
          const l = Aug.finalScore(v.dice, c, Object.assign({}, ctx, { coin: "lose" })).score;
          sc = (w + l) / 2;
        } else sc = Aug.finalScore(v.dice, c, ctx).score;
        let ins = null;
        if (sc === 0 && me.sealed !== c) {
          ins = Aug.charge(me.aug, "safetyNet") > 0 ? "safetyNet" : Aug.charge(me.aug, "bigInsurance") > 0 ? "bigInsurance" : null;
          if (ins) sc = ins === "bigInsurance" ? Aug.BIG_INSURANCE_SCORE : Aug.SAFETY_NET_SCORE;
        }
        out.push({ edit: v.edit || v.action || null, dice: v.dice, category: c, useDouble: !!t.useDouble,
          useCoin: !!t.useCoin, useInsurance: ins, score: sc, u: utility(c, sc, me) });
      }
    }
  }
  out.sort((a, b) => b.u - a.u);
  return out;
}

function usesCharge(o) { return !!(o.edit || o.useDouble || o.useCoin || o.useInsurance); }

// Rule-based default: best plain record, upgraded with a charge only when it clearly pays.
function defaultFinal(room, pk, opts) {
  const me = room.players[pk];
  const avail = emptyCats(me.scores);
  const plain = opts.filter((o) => !usesCharge(o))[0] || opts[0];
  let pick = plain;
  for (const o of opts) {
    if (!usesCharge(o) || o.u <= pick.u) continue;
    let need = 0;
    if (o.edit) need += EDIT_THRESHOLD[o.edit.type];
    if (o.useDouble) need += avail.length === 1 ? 0 : Math.max(0, 30 - o.score / 2);
    if (o.useCoin) need += avail.length <= Aug.charge(me.aug, "coin") ? 0 : 10;
    if (o.useInsurance) need += 0;
    if (o.u - plain.u >= need) pick = o;
  }
  return pick;
}

module.exports = {
  CATS, PAR, diceOf, emptyCats, filledCount, isFilled, bestChoice, diceMove,
  preRollOptions, hasPreRollChoice, defaultPreRoll, finalOptions, defaultFinal, usesCharge
};
