#!/usr/bin/env node
// Scenario tests for augment rules (runs on the same reducers the Cloud Functions use).
//   node tools/augment_rules_test.js
'use strict';

const assert = require("assert");
const Rules = require("../functions/game-rules");
const Aug = require("../functions/augments");
const Scoring = require("../functions/scoring");

const CATS = Scoring.getCategories("yacht");
let passed = 0;
function test(name, fn) {
  try { fn(); passed++; } catch (e) { console.error("FAIL " + name + "\n  " + e.message); process.exitCode = 1; }
}

// Room in mid-game: both players own `own1` / `own2`, player1 to move.
function room(own1, own2, scores1, scores2) {
  const charges = (ids) => {
    const c = {};
    ids.forEach((id) => { const d = Aug.DEFS[id]; if (d.pool) c[d.pool] = (c[d.pool] || 0) + d.charges; });
    return c;
  };
  const p = (uid, own, sc) => ({ uid: uid, name: uid, connected: true, scores: Object.assign({ _init: true }, sc || {}),
    aug: { owned: own.slice(), charges: charges(own) } });
  return {
    type: "private", gameMode: "yacht", augmentMode: true, status: "playing", currentTurn: "player1", rollCount: 0,
    dice: { 0: { value: 0 }, 1: { value: 0 }, 2: { value: 0 }, 3: { value: 0 }, 4: { value: 0 } },
    players: { player1: p("u1", own1, scores1), player2: p("u2", own2, scores2) }, winner: ""
  };
}
const rand0 = () => 0;
function roll(r, uid, dice) { const x = Rules.applyRoll(r, uid, dice); assert(!x.error, "roll: " + x.error); return x; }
function select(r, uid, cat, opts) { return Rules.applySelect(r, uid, cat, Object.assign({ rand: rand0 }, opts || {})); }
function filledExcept(keep) { const s = {}; CATS.forEach((c) => { if (keep.indexOf(c) === -1) s[c] = 1; }); return s; }

// ── Tier 1 ──
test("jackpot: Yacht scores 90", () => {
  const r = room(["jackpot"], ["extraRoll"]);
  roll(r, "u1", [6, 6, 6, 6, 6]);
  const x = select(r, "u1", "yacht");
  assert.strictEqual(x.score, 90);
  assert.deepStrictEqual(x.effects, ["jackpot"]);
});
test("jackpot: non-Yacht unchanged, failed Yacht still 0", () => {
  const r = room(["jackpot"], ["extraRoll"]);
  roll(r, "u1", [6, 6, 6, 6, 5]);
  assert.strictEqual(select(r, "u1", "yacht").score, 0);
});
test("coin: win doubles, lose halves (floor), charge consumed", () => {
  let r = room(["coin"], ["extraRoll"]);
  roll(r, "u1", [6, 6, 6, 5, 4]);
  let x = select(r, "u1", "choice", { useCoin: true, coinFlip: 0 });
  assert.strictEqual(x.score, 54); assert.strictEqual(r.players.player1.aug.charges.coin, 1);
  r = room(["coin"], ["extraRoll"]);
  roll(r, "u1", [6, 6, 6, 5, 4]);
  x = select(r, "u1", "choice", { useCoin: true, coinFlip: 1 });
  assert.strictEqual(x.score, 13);
});
test("coin: not on Yacht, not with Double, needs charge", () => {
  const r = room(["coin", "double"], ["extraRoll"]);
  roll(r, "u1", [6, 6, 6, 6, 6]);
  assert.strictEqual(select(r, "u1", "yacht", { useCoin: true, coinFlip: 0 }).error, "DOUBLE_YACHT");
  assert.strictEqual(select(r, "u1", "choice", { useCoin: true, useDouble: true, coinFlip: 0 }).error, "MULTIPLIER_CONFLICT");
  r.players.player1.aug.charges.coin = 0;
  assert.strictEqual(select(r, "u1", "choice", { useCoin: true, coinFlip: 0 }).error, "NO_CHARGE");
});
test("shortcut: upper bonus at 55", () => {
  const up = { ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 12 }; // 57
  assert.strictEqual(Aug.totalScore(up, { owned: ["shortcut"] }), 57 + 35);
  assert.strictEqual(Aug.totalScore(up, { owned: ["extraRoll"] }), 57);
  assert.strictEqual(Aug.bonusHurdle({ owned: ["shortcut"] }), 55);
});

// ── Tier 2 ──
test("hotStreak: 12+ in a row gives +0, +6, +12, ... capped at +24; < 12 resets", () => {
  const r = room(["hotStreak"], ["extraRoll"]);
  const seq = [["choice", [6, 6, 5, 5, 4], 26], ["fours", [4, 4, 4, 1, 2], 12 + 6], ["sixes", [6, 6, 6, 1, 2], 18 + 12],
    ["fives", [5, 5, 5, 1, 2], 15 + 18], ["threes", [3, 3, 3, 3, 1], 12 + 24], ["fourOfAKind", [6, 6, 6, 6, 1], 24 + 24],
    ["ones", [1, 1, 2, 3, 4], 2], ["twos", [2, 2, 2, 2, 2], 10]];
  for (const [cat, dice, want] of seq) {
    r.currentTurn = "player1"; r.rollCount = 0;
    roll(r, "u1", dice);
    const x = select(r, "u1", cat);
    assert.strictEqual(x.score, want, cat + " got " + x.score);
  }
  assert.strictEqual(r.players.player1.streak, 0);
});
test("callShot: declare before first roll, +25 when recorded > 0", () => {
  const r = room(["callShot"], ["extraRoll"]);
  assert(!Rules.applyAction(r, "u1", { type: "call", category: "largeStraight" }).error);
  assert.strictEqual(Rules.applyAction(r, "u1", { type: "allIn" }).error, "NO_CHARGE"); // doesn't own all-in
  roll(r, "u1", [2, 3, 4, 5, 6]);
  assert.strictEqual(r.turnFlags.called, "largeStraight", "declaration survives the first roll");
  assert.strictEqual(Rules.applyAction(r, "u1", { type: "call", category: "fullHouse" }).error, "DECLARE_AFTER_ROLL");
  const x = select(r, "u1", "largeStraight");
  assert.strictEqual(x.score, 55);
  assert.strictEqual(r.players.player1.aug.charges.call, 3);
});
test("callShot: other category / zero gets nothing; invalid targets rejected", () => {
  const r = room(["callShot"], ["extraRoll"], { fullHouse: 25 });
  assert.strictEqual(Rules.applyAction(r, "u1", { type: "call", category: "yacht" }).error, "INVALID_TARGET");
  assert.strictEqual(Rules.applyAction(r, "u1", { type: "call", category: "fullHouse" }).error, "INVALID_TARGET");
  assert(!Rules.applyAction(r, "u1", { type: "call", category: "smallStraight" }).error);
  assert.strictEqual(Rules.applyAction(r, "u1", { type: "call", category: "largeStraight" }).error, "ALREADY_DECLARED");
  roll(r, "u1", [1, 1, 2, 2, 6]);
  assert.strictEqual(select(r, "u1", "smallStraight").score, 0);
});
test("allIn: >= 18 doubles, < 18 becomes 0, insurance still applies, no double/coin", () => {
  let r = room(["allIn", "coin"], ["extraRoll"]);
  assert(!Rules.applyAction(r, "u1", { type: "allIn" }).error);
  roll(r, "u1", [6, 6, 6, 1, 2]);
  assert.strictEqual(select(r, "u1", "choice", { useCoin: true, coinFlip: 0 }).error, "MULTIPLIER_CONFLICT");
  assert.strictEqual(select(r, "u1", "sixes").score, 36);
  r = room(["allIn"], ["extraRoll"]);
  Rules.applyAction(r, "u1", { type: "allIn" });
  roll(r, "u1", [1, 1, 2, 3, 5]);
  assert.strictEqual(select(r, "u1", "choice").score, 0);
  r = room(["safetyNet", "allIn"], ["extraRoll"]);
  Rules.applyAction(r, "u1", { type: "allIn" });
  roll(r, "u1", [1, 1, 2, 3, 5]);
  assert.strictEqual(select(r, "u1", "choice", { useInsurance: "safetyNet" }).score, 10);
});
test("declarations: only own turn, need charge, flags cleared next turn", () => {
  const r = room(["allIn"], ["allIn"]);
  assert.strictEqual(Rules.applyAction(r, "u2", { type: "allIn" }).error, "NOT_YOUR_TURN");
  Rules.applyAction(r, "u1", { type: "allIn" });
  roll(r, "u1", [6, 6, 6, 6, 1]);
  select(r, "u1", "choice");
  assert.strictEqual(r.turnFlags, null);
  r.players.player2.aug.charges.allIn = 0;
  assert.strictEqual(Rules.applyAction(r, "u2", { type: "allIn" }).error, "NO_CHARGE");
});

// ── Tier 3 ──
test("lastStand: only the last two records are doubled", () => {
  let r = room(["lastStand"], ["extraRoll"], filledExcept(["choice", "sixes", "fives"]));
  roll(r, "u1", [6, 6, 6, 1, 2]);
  assert.strictEqual(select(r, "u1", "sixes").score, 18, "3rd-to-last not doubled");
  r.currentTurn = "player1";
  roll(r, "u1", [5, 5, 5, 1, 2]);
  assert.strictEqual(select(r, "u1", "fives").score, 30);
  r.currentTurn = "player1";
  roll(r, "u1", [6, 6, 5, 5, 4]);
  assert.strictEqual(select(r, "u1", "choice").score, 52);
});
test("lottery: rolled once at game end, prize counted in the total", () => {
  const r = room(["lottery"], ["steal"], filledExcept(["choice"]), filledExcept(["choice"]));
  roll(r, "u1", [6, 6, 6, 6, 6]); select(r, "u1", "choice");
  assert.strictEqual(r.players.player1.scores.lottery, undefined);
  roll(r, "u2", [1, 1, 1, 1, 2]);
  const x = select(r, "u2", "choice", { lotteryDice: { player1: 4, player2: 1 } });
  assert(!x.error, x.error);
  assert.strictEqual(r.status, "finished");
  assert.strictEqual(r.players.player1.scores.lottery, 40);
  assert.strictEqual(r.players.player2.scores.lottery, undefined, "only owners roll");
  assert.deepStrictEqual(r.lotteryLog, [{ by: "player1", die: 4, prize: 40 }]);
  assert.strictEqual(Rules.total(r.players.player1, "yacht", true), Aug.totalScore(r.players.player1.scores, r.players.player1.aug));
  assert.strictEqual(r.winner, "player1");
  const r2 = room(["lottery"], ["extraRoll"], filledExcept(["choice"]), filledExcept(["choice"]));
  roll(r2, "u1", [6, 6, 6, 6, 6]); select(r2, "u1", "choice");
  roll(r2, "u2", [1, 1, 1, 1, 2]); select(r2, "u2", "choice", { lotteryDice: { player1: 3, player2: 6 } });
  assert.strictEqual(r2.players.player1.scores.lottery, 0);
});
test("finalSprint: +5 on non-zero records only", () => {
  const r = room(["finalSprint"], ["extraRoll"]);
  roll(r, "u1", [6, 6, 6, 1, 2]);
  assert.strictEqual(select(r, "u1", "sixes").score, 23);
  r.currentTurn = "player1";
  roll(r, "u1", [1, 2, 3, 4, 6]);
  assert.strictEqual(select(r, "u1", "yacht").score, 0);
});

// ── Pipeline / stacking ──
test("pipeline order: callShot +25 then double, lastStand, sprint, streak", () => {
  const aug = { owned: ["callShot", "double", "lastStand", "finalSprint"], charges: { double: 1 } };
  const f = Aug.finalScore([2, 3, 4, 5, 6], "largeStraight", { aug: aug, called: "largeStraight", useDouble: true, isLastStand: true });
  assert.strictEqual(f.score, ((30 + 25) * 2) * 2 + 5);
  assert.deepStrictEqual(f.effects, ["callShot", "double", "lastStand", "finalSprint"]);
});
test("seal beats everything", () => {
  const aug = { owned: ["jackpot", "finalSprint"], charges: {} };
  assert.strictEqual(Aug.finalScore([6, 6, 6, 6, 6], "yacht", { aug: aug, sealed: "yacht" }).score, 0);
});
test("steal ignores the lottery prize", () => {
  const t = Aug.stealTarget({ choice: 20, lottery: 40 }, CATS);
  assert.strictEqual(t.category, "choice");
});

console.log(passed + " passed" + (process.exitCode ? ", some FAILED" : ""));
