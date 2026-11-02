#!/usr/bin/env node
// Augment mode simulator — runs on the same reducers the Cloud Functions use.
//   node tools/augment_sim.js --conflict 50000   # random-action fuzzing + invariant checks
//   node tools/augment_sim.js --balance [N]      # per-augment value (mean score margin)
'use strict';

const fs = require("fs");
const path = require("path");
const Rules = require("../functions/game-rules");
const Aug = require("../functions/augments");
const Scoring = require("../functions/scoring");

const CATS = Scoring.getCategories("yacht");
const PAR = { ones: 2, twos: 5, threes: 8, fours: 12, fives: 15, sixes: 19, choice: 22,
  fourOfAKind: 14, fullHouse: 16, smallStraight: 9, largeStraight: 9, yacht: 12 };
const UIDS = { player1: "u1", player2: "u2" };

// ── deterministic RNG ──
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function randInt(rng, n) { return Math.floor(rng() * n); }
function clone(o) { return JSON.parse(JSON.stringify(o)); }

function newRoom(augmentMode) {
  const p = (uid) => ({ uid: uid, name: uid, connected: true, scores: { _init: true } });
  const room = {
    type: "private", gameMode: "yacht", augmentMode: augmentMode, status: "playing",
    currentTurn: "player1", rollCount: 0,
    dice: { 0: { value: 0, held: false }, 1: { value: 0, held: false }, 2: { value: 0, held: false },
      3: { value: 0, held: false }, 4: { value: 0, held: false } },
    players: { player1: p("u1"), player2: p("u2") }, winner: ""
  };
  return room;
}

function diceOf(room) { return [0, 1, 2, 3, 4].map((i) => room.dice[i].value); }
function empty(scores) { return CATS.filter((c) => scores[c] === null || scores[c] === undefined); }

// ════════════════════ (a) conflict fuzzing ════════════════════

function checkInvariants(room, ctx) {
  const errs = [];
  for (const pk of ["player1", "player2"]) {
    const p = room.players[pk];
    for (const c of CATS) {
      const v = p.scores[c];
      if (v !== undefined && v !== null && !(Number.isInteger(v) && v >= 0)) errs.push(pk + "." + c + "=" + v);
    }
    const aug = p.aug || { owned: [], charges: {} };
    for (const k of Object.keys(aug.charges || {})) {
      if (!(Number.isInteger(aug.charges[k]) && aug.charges[k] >= 0)) errs.push(pk + " charge " + k + "=" + aug.charges[k]);
    }
    const owned = aug.owned || [];
    owned.forEach((id, i) => {
      if (!Aug.DEFS[id] || Aug.DEFS[id].tier !== i + 1) errs.push(pk + " owned[" + i + "]=" + id);
    });
    if (p.sealed && CATS.indexOf(p.sealed) === -1) errs.push(pk + " sealed=" + p.sealed);
  }
  const cap = room.augmentMode ? Aug.MAX_ROLLS : Aug.BASE_ROLLS;
  if ((room.rollCount || 0) > cap) errs.push("rollCount=" + room.rollCount);
  if (room.turnFlags && room.turnFlags.rollCap > Aug.MAX_ROLLS) errs.push("rollCap=" + room.turnFlags.rollCap);
  for (let i = 0; i < 5; i++) {
    const v = room.dice[i].value;
    if (!(Number.isInteger(v) && v >= 0 && v <= 6)) errs.push("die" + i + "=" + v);
  }
  if (room.augmentPhase) {
    const n1 = Rules.filledCount(room.players.player1.scores, "yacht");
    const n2 = Rules.filledCount(room.players.player2.scores, "yacht");
    if (n1 !== n2 || Aug.TIER_ROUNDS[room.augmentPhase.tier] !== n1) errs.push("phase at " + n1 + "/" + n2);
    if ((room.players.player1.aug.owned || []).length !== room.augmentPhase.tier - 1) errs.push("phase tier vs owned");
  }
  if (room.status === "finished") {
    for (const pk of ["player1", "player2"]) {
      if (!Scoring.allFilled(room.players[pk].scores, "yacht")) errs.push("finished but " + pk + " not filled");
    }
    const t1 = Rules.total(room.players.player1, "yacht", room.augmentMode);
    const t2 = Rules.total(room.players.player2, "yacht", room.augmentMode);
    const w = t1 > t2 ? "player1" : t2 > t1 ? "player2" : "tie";
    if (room.winner !== w) errs.push("winner " + room.winner + " vs " + w);
    if (room.augmentMode && (room.players.player1.aug.owned || []).length !== 3) errs.push("finished with " + room.players.player1.aug.owned.length + " augments");
  }
  if (errs.length) {
    const e = new Error("invariant: " + errs.join("; "));
    e.ctx = ctx;
    throw e;
  }
}

function randomStep(room, rng) {
  // returns [description, fn(room) -> result]
  if (room.augmentPhase) {
    const phase = room.augmentPhase;
    const picks = {};
    for (const pk of ["player1", "player2"]) {
      const offers = phase.offers[pk];
      // 5% invalid pick attempt (must be rejected)
      picks[pk] = rng() < 0.05 ? "fourthRoll_bogus" : offers[randInt(rng, offers.length)];
    }
    return ["pick " + picks.player1 + "/" + picks.player2, (r) => {
      for (const pk of ["player1", "player2"]) {
        const v = Rules.validatePick(r, UIDS[pk], picks[pk]);
        if (v.error) return v;
      }
      Rules.markReady(r, "player1", phase.tier);
      return Rules.applyPicks(r, picks, phase.tier, 0);
    }];
  }
  const pk = rng() < 0.9 ? room.currentTurn : Rules.opponentOf(room.currentTurn); // 10% out-of-turn
  const uid = UIDS[pk];
  const x = rng();
  const die = randInt(rng, 6) - (rng() < 0.1 ? 1 : 0); // occasionally invalid (-1 / 5)
  if (x < 0.40) {
    const vals = [1, 2, 3, 4, 5].map(() => 1 + randInt(rng, 6));
    if (rng() < 0.5) {
      room.heldDice = {};
      for (let i = 0; i < 5; i++) if (rng() < 0.4) room.heldDice[i] = true;
    }
    return ["roll " + pk, (r) => Rules.applyRoll(r, uid, vals)];
  }
  if (x < 0.62) {
    const types = ["copy", "adjust", "nudge", "wild", "seal", "swap", "bogus"];
    const type = types[randInt(rng, types.length)];
    const action = { type: type, die: die, from: randInt(rng, 5), delta: rng() < 0.5 ? 1 : -1,
      value: 1 + randInt(rng, 6), category: CATS[randInt(rng, CATS.length)] };
    return ["action " + pk + " " + JSON.stringify(action), (r) => Rules.applyAction(r, uid, action)];
  }
  const sc = room.players[pk].scores;
  const cands = rng() < 0.9 ? empty(sc) : CATS;
  const cat = cands.length ? cands[randInt(rng, cands.length)] : CATS[0];
  const useDouble = rng() < 0.2;
  const insOpts = [null, null, "safetyNet", "bigInsurance", "bogus"];
  const useInsurance = insOpts[randInt(rng, insOpts.length)];
  return ["select " + pk + " " + cat + (useDouble ? " x2" : "") + (useInsurance ? " +" + useInsurance : ""),
    (r) => Rules.applySelect(r, uid, cat, { useDouble: useDouble, useInsurance: useInsurance, rand: (n) => randInt(rng, n) })];
}

function runConflict(games) {
  const stats = { games: 0, steps: 0, ok: 0, rejected: 0, errors: {}, finished: 0, augUses: {} };
  for (let g = 0; g < games; g++) {
    const rng = mulberry32(g + 1);
    const augmentMode = g % 10 !== 0; // 10% normal-mode games as regression
    const room = newRoom(augmentMode);
    Rules.startGame(room, (n) => randInt(rng, n));
    let steps = 0;
    while (room.status === "playing") {
      if (++steps > 5000) throw new Error("game " + g + " did not terminate");
      const [desc, fn] = randomStep(room, rng);
      const before = clone(room);
      const res = fn(room);
      stats.steps++;
      if (res.error) {
        stats.rejected++;
        stats.errors[res.error] = (stats.errors[res.error] || 0) + 1;
        // heldDice is client-written; everything else must be untouched on rejection
        const a = clone(room); const b = before; delete a.heldDice; delete b.heldDice;
        if (JSON.stringify(a) !== JSON.stringify(b)) {
          throw new Error("partial mutation on rejected step (game " + g + "): " + desc + " -> " + res.error);
        }
        if (!Rules.ERRORS[res.error]) throw new Error("unknown error code " + res.error);
      } else {
        stats.ok++;
        if (desc.startsWith("action")) {
          const t = JSON.parse(desc.slice(desc.indexOf("{"))).type;
          stats.augUses[t] = (stats.augUses[t] || 0) + 1;
        }
      }
      checkInvariants(room, { game: g, step: steps, desc: desc });
    }
    stats.games++;
    if (room.status === "finished") stats.finished++;
  }
  return stats;
}

// ════════════════════ (b) balance ════════════════════

// Heuristic player driving the real reducers.
function holdsFor(d, avail) {
  const set = new Set(d);
  for (const [run, cat] of [[[1, 2, 3, 4, 5], "smallStraight"], [[2, 3, 4, 5, 6], "largeStraight"]]) {
    if (avail.indexOf(cat) !== -1 && run.filter((v) => set.has(v)).length >= 4) {
      const used = new Set(); const keep = [];
      d.forEach((v, i) => { if (run.indexOf(v) !== -1 && !used.has(v)) { used.add(v); keep.push(i); } });
      return keep;
    }
  }
  const cnt = {}; d.forEach((v) => { cnt[v] = (cnt[v] || 0) + 1; });
  let best = null;
  for (const v of Object.keys(cnt)) if (!best || cnt[v] > cnt[best] || (cnt[v] === cnt[best] && +v > +best)) best = v;
  const keep = []; d.forEach((v, i) => { if (v === +best) keep.push(i); });
  return keep;
}

// Bonus-aware: while the upper sum is below the hurdle, reward upper records at or
// above the per-face pace (3 of a kind for a 63 hurdle).
function bestChoice(d, avail, me, ban) {
  let b = null;
  const upSum = Aug.upperSum(me.scores || {});
  for (const c of avail) {
    let sc, u;
    if (ban && c === "yacht") continue;
    if (me.sealed === c) { sc = 0; u = -1; }
    else {
      sc = Aug.baseScore(d, c, me.aug); u = sc - PAR[c];
      const face = Aug.UPPER.indexOf(c) + 1;
      if (face > 0 && upSum < Aug.UPPER_BONUS_HURDLE) u += 0.8 * (sc - face * 3 * Aug.UPPER_BONUS_HURDLE / 63);
    }
    if (!b || u > b.u) b = { u: u, c: c, sc: sc };
  }
  return b;
}

function tryEdit(room, uid, me, avail) {
  const pools = [["nudge", 6], ["adjust", 6], ["copy", 8], ["wild", 15]];
  const d = diceOf(room);
  const base = bestChoice(d, avail, me, room.turnFlags && room.turnFlags.noYacht).u;
  let pick = null;
  for (const [type, thr] of pools) {
    if (Aug.charge(me.aug, type) < 1) continue;
    const ban = type === "copy" || type === "wild";
    if (ban && !avail.some((c) => c !== "yacht")) continue; // EDIT_BLOCKED
    for (let i = 0; i < 5; i++) {
      const vals = (type === "nudge" || type === "adjust") ? [d[i] - 1, d[i] + 1] : type === "copy" ? d.filter((_, j) => j !== i) : [1, 2, 3, 4, 5, 6];
      for (const v of vals) {
        if (v < 1 || v > 6 || v === d[i]) continue;
        const dd = d.slice(); dd[i] = v;
        const u = bestChoice(dd, avail, me, ban).u;
        if ((u - base >= thr || avail.length <= 1) && u > base && (!pick || u > pick.u)) {
          pick = { u: u, action: type === "copy" ? { type: type, die: i, from: d.indexOf(v) === i ? d.lastIndexOf(v) : d.indexOf(v) }
            : type === "adjust" ? { type: type, die: i, delta: v - d[i] }
            : type === "nudge" ? { type: type, die: i, delta: v - d[i] } : { type: type, die: i, value: v } };
        }
      }
    }
  }
  if (pick) {
    const r = Rules.applyAction(room, uid, pick.action);
    if (r.error) throw new Error("heuristic edit rejected: " + r.error + " " + JSON.stringify(pick.action));
  }
}

function playTurn(room, rng, pk) {
  const uid = UIDS[pk];
  const me = room.players[pk];
  const opp = room.players[Rules.opponentOf(pk)];
  Rules.ensureAug(me);
  const avail = empty(me.scores);
  const dice5 = () => [0, 1, 2, 3, 4].map(() => 1 + randInt(rng, 6));

  // seal: opponent's highest-par empty category, as early as possible
  if (Aug.charge(me.aug, "seal") > 0) {
    const left = empty(opp.scores);
    if (left.length && !opp.sealed) {
      const c = left.reduce((a, b) => (PAR[b] > PAR[a] ? b : a));
      Rules.applyAction(room, uid, { type: "seal", category: c });
    }
  }
  // swap: on my last turn, the upper swap that most improves (my total - opp total), bonus included
  if (Aug.charge(me.aug, "swap") > 0 && avail.length === 1) {
    const margin = (ms, os) => Aug.totalScore(ms) - Aug.totalScore(os);
    const now = margin(me.scores, opp.scores);
    let best = null;
    for (const c of Aug.UPPER) {
      const a = me.scores[c], b = opp.scores[c];
      if (a === undefined || b === undefined || a === null || b === null || a === b) continue;
      const ms = Object.assign({}, me.scores, { [c]: b });
      const os = Object.assign({}, opp.scores, { [c]: a });
      const gain = margin(ms, os) - now;
      if (gain > 0 && (!best || gain > best.d)) best = { c: c, d: gain };
    }
    if (best) Rules.applyAction(room, uid, { type: "swap", category: best.c });
  }

  room.heldDice = null;
  let r = Rules.applyRoll(room, uid, dice5());
  if (r.error) throw new Error("first roll rejected: " + r.error);
  for (;;) {
    const d = diceOf(room);
    const b = bestChoice(d, avail, me, false);
    const cap = room.turnFlags ? room.turnFlags.rollCap : Aug.BASE_ROLLS;
    const atCap = room.rollCount >= cap;
    if (b.sc >= 30) break;
    if (atCap && !(b.u < 0 && Aug.charge(me.aug, "extraRoll") > 0)) break;
    const keep = holdsFor(d, avail);
    room.heldDice = {}; keep.forEach((i) => { room.heldDice[i] = true; });
    r = Rules.applyRoll(room, uid, dice5());
    if (r.error) break;
  }
  if (room.augmentMode) tryEdit(room, uid, me, avail);
  const ch = bestChoice(diceOf(room), avail, me, room.turnFlags && room.turnFlags.noYacht);
  const useDouble = Aug.charge(me.aug, "double") > 0 && ch.c !== "yacht" && (ch.sc >= 30 || avail.length === 1);
  // Insurance is armed by the player: turn it on only when this record would be 0 (not sealed).
  let useInsurance = null;
  const pre = Aug.finalScore(diceOf(room), ch.c, { aug: me.aug, sealed: me.sealed, useDouble: useDouble });
  if (pre.score === 0 && me.sealed !== ch.c) {
    useInsurance = Aug.charge(me.aug, "bigInsurance") > 0 ? "bigInsurance" : Aug.charge(me.aug, "safetyNet") > 0 ? "safetyNet" : null;
  }
  r = Rules.applySelect(room, uid, ch.c, { useDouble: useDouble, useInsurance: useInsurance, rand: (n) => randInt(rng, n) });
  if (r.error) throw new Error("select rejected: " + r.error + " " + ch.c);
}

// give: augment id handed to player1 at its tier (player2 gets nothing); null = baseline.
function balanceGame(seed, give) {
  const rng = mulberry32(seed);
  const room = newRoom(true);
  Rules.startGame(room, (n) => randInt(rng, n));
  while (room.status === "playing") {
    if (room.augmentPhase) {
      if (give && Aug.DEFS[give].tier === room.augmentPhase.tier) {
        const aug = room.players.player1.aug;
        aug.owned.push(give);
        const def = Aug.DEFS[give];
        if (def.pool) aug.charges[def.pool] = (aug.charges[def.pool] || 0) + def.charges;
      }
      room.augmentPhase = null;
      continue;
    }
    playTurn(room, rng, room.currentTurn);
  }
  return Rules.total(room.players.player1, "yacht", true) - Rules.total(room.players.player2, "yacht", true);
}

// Upper-bonus analysis with real augment picks (both players pick a random offer each tier).
function bonusGame(seed) {
  const rng = mulberry32(seed);
  const room = newRoom(true);
  Rules.startGame(room, (n) => randInt(rng, n));
  while (room.status === "playing") {
    if (room.augmentPhase) {
      const picks = Rules.fillMissingPicks(room, {}, (n) => randInt(rng, n));
      Rules.applyPicks(room, picks, room.augmentPhase.tier, 0);
      continue;
    }
    playTurn(room, rng, room.currentTurn);
  }
  return ["player1", "player2"].map((pk) => Aug.upperSum(room.players[pk].scores));
}

function runBonus(n) {
  const sums = [];
  for (let i = 0; i < n; i++) sums.push.apply(sums, bonusGame(5000 + i));
  sums.sort((a, b) => a - b);
  const q = (p) => sums[Math.floor(p * sums.length)];
  const rate = (h) => (100 * sums.filter((x) => x >= h).length / sums.length).toFixed(1) + "%";
  return { mean: sums.reduce((a, b) => a + b, 0) / sums.length, p50: q(0.5), p75: q(0.75), p90: q(0.9),
    rates: [55, 58, 60, 63, 66, 70].map((h) => h + ":" + rate(h)).join(" ") };
}

function runBalance(n) {
  const mean = (give) => { let s = 0; for (let i = 0; i < n; i++) s += balanceGame(1000 + i, give); return s / n; };
  const base = mean(null);
  const out = { baseline: base, tiers: {} };
  for (const tier of [1, 2, 3]) {
    out.tiers[tier] = Aug.idsOfTier(tier).map((id) => ({ id: id, value: mean(id) - base }));
  }
  return out;
}

// ════════════════════ main ════════════════════

function checkClientCopy() {
  const a = fs.readFileSync(path.join(__dirname, "../functions/augments.js"), "utf8");
  const b = fs.readFileSync(path.join(__dirname, "../js/augments.js"), "utf8");
  if (a !== b) throw new Error("js/augments.js differs from functions/augments.js — copy it over");
}

const args = process.argv.slice(2);
if (args[0] === "--conflict") {
  checkClientCopy();
  const n = parseInt(args[1] || "50000", 10);
  const t0 = Date.now();
  const s = runConflict(n);
  console.log("conflict fuzz: " + s.games + " games, " + s.finished + " finished, " + s.steps + " steps (" + s.ok + " ok / " + s.rejected + " rejected) in " + ((Date.now() - t0) / 1000).toFixed(1) + "s");
  console.log("rejections by code:", JSON.stringify(s.errors));
  console.log("successful augment actions:", JSON.stringify(s.augUses));
  console.log("invariant violations: 0");
} else if (args[0] === "--balance") {
  const n = parseInt(args[1] || "12000", 10);
  const r = runBalance(n);
  console.log("baseline margin " + r.baseline.toFixed(2) + " (N=" + n + ")");
  for (const tier of [1, 2, 3]) {
    const vals = r.tiers[tier];
    const avg = vals.reduce((a, v) => a + v.value, 0) / vals.length;
    console.log("tier " + tier + " (mean +" + avg.toFixed(1) + "): " + vals.map((v) => {
      const off = v.value - avg;
      return v.id + " +" + v.value.toFixed(1) + (Math.abs(off) > 3 ? " (!" + (off > 0 ? "+" : "") + off.toFixed(1) + ")" : "");
    }).join(" | "));
  }
} else if (args[0] === "--bonus") {
  const n = parseInt(args[1] || "10000", 10);
  const r = runBonus(n);
  console.log("upper sum with augments (N=" + n + " games, hurdle " + Aug.UPPER_BONUS_HURDLE + "): mean " + r.mean.toFixed(1) +
    " p50 " + r.p50 + " p75 " + r.p75 + " p90 " + r.p90);
  console.log("bonus hit rate by hurdle: " + r.rates);
} else {
  console.log("usage: node tools/augment_sim.js --conflict [games] | --balance [games] | --bonus [games]");
  process.exit(1);
}
