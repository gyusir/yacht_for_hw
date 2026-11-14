// Room bot — Claude part: augment picks and when/how to spend augment charges.
// Calls the local `claude` CLI in print mode (no tools) and expects one JSON object.
// Any failure (timeout, bad JSON, illegal choice) falls back to the rule-based default.
'use strict';

const { execFile } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Aug = require("../../functions/augments");
const Brain = require("./brain");

const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";
const MODEL = process.env.BOT_MODEL || "sonnet";
const TIMEOUT_MS = Number(process.env.BOT_CLAUDE_TIMEOUT_MS || 45000);
const DISABLED = process.env.BOT_NO_CLAUDE === "1";

// English augment descriptions, read from js/i18n.js (first = English block).
const DESC = (function () {
  const out = {};
  try {
    const src = fs.readFileSync(path.join(__dirname, "../../js/i18n.js"), "utf8");
    const re = /aug_desc_(\w+):\s*'((?:[^'\\]|\\.)*)'/g;
    let m;
    while ((m = re.exec(src))) if (!out[m[1]]) out[m[1]] = m[2].replace(/\\'/g, "'");
  } catch (e) { /* descriptions are optional */ }
  return out;
})();

const RULES = [
  "Game: Yacht dice, augment mode, 1:1. 12 categories: ones..sixes (sum of that face), choice (sum of all),",
  "fourOfAKind (sum of all dice if 4+ same), fullHouse (sum of all if 3+2), smallStraight (4 in a row: 15),",
  "largeStraight (5 in a row: 30), yacht (5 same: 50). Upper bonus: ones..sixes sum >= 63 gives +35.",
  "Each turn: up to 3 rolls (holding dice between rolls), then record one empty category. 12 turns each.",
  "Augments are picked before turns 1, 5 and 9 (tier 1/2/3), 2 random offers each; picks are hidden until both choose."
].join("\n");

let log = () => {};
function setLogger(fn) { log = fn; }

function callClaude(prompt) {
  if (DISABLED) return Promise.resolve(null);
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "yacht-bot-"));
  return new Promise((resolve) => {
    const started = Date.now();
    execFile(CLAUDE_BIN, ["-p", prompt, "--model", MODEL, "--tools", "", "--no-session-persistence",
      "--strict-mcp-config", "--setting-sources", ""],
    { cwd: cwd, timeout: TIMEOUT_MS, maxBuffer: 1 << 20, env: process.env }, (err, stdout) => {
      fs.rmSync(cwd, { recursive: true, force: true });
      const ms = Date.now() - started;
      if (err) { log("claude error (" + ms + "ms): " + err.message.split("\n")[0]); return resolve(null); }
      const m = String(stdout).match(/\{[\s\S]*\}/);
      if (!m) { log("claude: no JSON (" + ms + "ms): " + String(stdout).slice(0, 200)); return resolve(null); }
      try {
        const obj = JSON.parse(m[0]);
        log("claude (" + ms + "ms): " + JSON.stringify(obj));
        resolve(obj);
      } catch (e) { log("claude: bad JSON: " + m[0].slice(0, 200)); resolve(null); }
    });
  });
}

function say(r) { return typeof r.say === "string" ? r.say.trim().slice(0, 40) : ""; }

function playerSummary(p) {
  const aug = p.aug || {};
  const owned = Array.isArray(aug.owned) ? aug.owned : Object.values(aug.owned || {});
  const scores = {};
  Brain.CATS.forEach((c) => { scores[c] = Brain.isFilled(p.scores, c) ? p.scores[c] : null; });
  return {
    total: Aug.totalScore(p.scores || {}, p.aug),
    upperSum: Aug.upperSum(p.scores || {}),
    bonusHurdle: Aug.bonusHurdle(p.aug),
    scores: scores,
    augments: owned,
    charges: aug.charges || {},
    sealedCategory: p.sealed || null,
    hotStreak: p.streak || 0
  };
}

function context(room, pk) {
  const opp = pk === "player1" ? "player2" : "player1";
  const me = room.players[pk];
  return {
    turn: Brain.filledCount(me.scores) + 1,
    me: playerSummary(me),
    opponent: playerSummary(room.players[opp])
  };
}

function describe(ids) {
  return ids.map((id) => "- " + id + ": " + (DESC[id] || "(no description)")).join("\n");
}

function header(room, pk) {
  const ctx = context(room, pk);
  const owned = [].concat(ctx.me.augments, ctx.opponent.augments);
  return RULES + "\n\nAugments in play:\n" + describe(owned.filter((v, i) => owned.indexOf(v) === i)) +
    "\n\nState (you are 'me'):\n" + JSON.stringify(ctx);
}

// ── Augment pick ──
async function pickAugment(room, pk, offers) {
  const prompt = header(room, pk) + "\n\nPick ONE augment for tier " + room.augmentPhase.tier + ". Offers:\n" +
    describe(offers) + "\n\nThink about the score gap, which categories are still open, and synergy with augments you own." +
    "\nAnswer with only JSON: {\"pick\": \"<augment id>\", \"why\": \"<one short sentence>\", \"say\": \"<short in-game remark to your opponent in Korean, max 25 characters>\"}";
  const r = await callClaude(prompt);
  if (r && offers.indexOf(r.pick) !== -1) return { pick: r.pick, why: r.why || "", say: say(r), by: "claude" };
  return { pick: offers[0], why: "fallback", by: "rule" };
}

// ── Pre-roll: seal / swap / call / all-in ──
async function preRoll(room, pk, options, fallback) {
  const prompt = header(room, pk) + "\n\nIt is your turn, before the first roll. Legal options:\n" +
    JSON.stringify(options) +
    "\n(seal: make one opponent empty category score 0; typical = its usual value. swap: exchange an upper category you" +
    " both filled; marginGain = change of (my total - opponent total). call: declare a combo, +25 if you record it > 0" +
    " this turn. allIn: this turn's record >= 18 is doubled, else 0. call and allIn are exclusive.)" +
    "\nA rule-based player would do: " + JSON.stringify(fallback) +
    "\nCharges are limited; spending them early or saving them is your call." +
    "\nAnswer with only JSON: {\"seal\": <category or null>, \"swap\": <category or null>, " +
    "\"declare\": null | {\"type\":\"call\",\"category\":\"...\"} | {\"type\":\"allIn\"}, \"why\": \"<one short sentence>\", \"say\": \"<short in-game remark to your opponent in Korean, max 25 characters>\"}";
  const r = await callClaude(prompt);
  if (!r) return Object.assign({ by: "rule" }, fallback);
  const plan = { seal: null, swap: null, declare: null, why: r.why || "", say: say(r), by: "claude" };
  if (r.seal && options.seal.some((o) => o.category === r.seal)) plan.seal = r.seal;
  if (r.swap && options.swap.some((o) => o.category === r.swap)) plan.swap = r.swap;
  const d = r.declare;
  if (d && d.type === "call" && options.call.indexOf(d.category) !== -1) plan.declare = { type: "call", category: d.category };
  else if (d && d.type === "allIn" && options.allIn) plan.declare = { type: "allIn" };
  return plan;
}

// ── Final record: which category, and whether to spend a die edit / double / coin / insurance ──
async function finalChoice(room, pk, opts, fallback) {
  const list = [];
  const plainBest = opts.filter((o) => !Brain.usesCharge(o)).slice(0, 4);
  const charged = opts.filter((o) => Brain.usesCharge(o)).slice(0, 10);
  plainBest.concat(charged).forEach((o) => { if (list.indexOf(o) === -1) list.push(o); });
  if (list.indexOf(fallback) === -1) list.push(fallback);
  const rows = list.map((o, i) => ({ i: i, category: o.category, score: Math.round(o.score * 10) / 10,
    dice: o.dice, edit: o.edit, useDouble: o.useDouble || undefined, useCoin: o.useCoin || undefined,
    useInsurance: o.useInsurance || undefined }));
  const prompt = header(room, pk) + "\n\nYour dice now: " + JSON.stringify(Brain.diceOf(room)) +
    ". Rolling is over. Choose how to record. Options (score = points recorded now; coin rows show the expected" +
    " value of a 50/50 x2 or x1/2):\n" + JSON.stringify(rows) +
    "\nA rule-based player would pick i=" + list.indexOf(fallback) + ". Weigh keeping charges for later turns" +
    " against using them now, and keep the upper bonus and remaining categories in mind." +
    "\nAnswer with only JSON: {\"i\": <option index>, \"why\": \"<one short sentence>\", \"say\": \"<short in-game remark to your opponent in Korean, max 25 characters>\"}";
  const r = await callClaude(prompt);
  if (r && Number.isInteger(r.i) && list[r.i]) return Object.assign({ why: r.why || "", say: say(r), by: "claude" }, list[r.i]);
  return Object.assign({ by: "rule" }, fallback);
}

module.exports = { pickAugment, preRoll, finalChoice, setLogger };
