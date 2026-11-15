// Situational one-liners for the room bot, same idea as the in-browser bots (js/bot-game.js EMOTE_TRIGGERS):
// watch the room, and on records / score gaps / idling say a line from the matching pool with some probability.
// Probabilities follow the gambler bot. Augment-specific lines (charges, edits) stay in bot.js.
'use strict';

const Aug = require("../../functions/augments");
const { YACHT_CATEGORIES } = require("../../functions/scoring");

const TRIGGERS = {
  game_start:        { p: 0.90, pool: ["🧊 쿨하게~", "🎯 계획대로", "👊 한판 붙자", "😏 봐드림", "🎲 주사위의 신"] },
  bot_yacht:         { p: 0.95, pool: ["🔥 실화냐?", "👑 왕 납신다", "💥 완벽!", "🏆 이게 실력", "😎 너무 쉬움"] },
  bot_high:          { p: 0.60, pool: ["😎 쉽네요", "🎯 계획대로", "💪 기본이지", "🧠 천재?", "📈 쭉쭉"] },
  bot_zero:          { p: 0.50, pool: ["🤦 말도 안돼", "😭 봐줘요", "💨 잠깐 실수", "😒 다음엔.."] },
  player_yacht:      { p: 0.70, pool: ["😱 헐 대박", "🍀 운이지~", "🙄 치트 아님?", "🤔 또 나올까", "😒 좀 치네"] },
  player_zero:       { p: 0.55, pool: ["😎 쉽네요", "❓ 그게 최선?", "🤣 ㅋㅋㅋㅋ", "💩 실력?", "😢 슬프다"] },
  player_low:        { p: 0.40, pool: ["❓ 그게 최선?", "🤔 Hmm..", "🧐 전략이..?", "😕 에이~", "🥱 하품~"] },
  bot_leading:       { p: 0.30, pool: ["😎 쉽네요", "👑 왕 납신다", "🏃 따라와~", "💪 격차 벌림", "👋 항복?"] },
  bot_losing:        { p: 0.35, pool: ["😭 봐줘요", "🧊 쿨하게~", "😒 아직이야", "🔥 역전 간다"] },
  player_slow:       { p: 0.25, pool: ["🐢 좀 빨리~", "🥱 하품~", "⏰ 시간 간다", "😴 Zzz..", "💤 자는 거?"] },
  game_end_win:      { p: 0.85, pool: ["😎 쉽네요", "👑 왕 납신다", "👋 GG~", "🏆 GG", "😏 배웠지?"] },
  game_end_lose:     { p: 0.75, pool: ["🤦 말도 안돼", "🍀 운이지~", "😒 다음엔..", "😠 리매치!"] },
  bot_comeback:      { p: 0.70, pool: ["🔥 역전이다!", "😏 떨리지?", "💪 다시 간다", "🎯 계획대로", "😈 흔들리지?"] },
  player_wasted:     { p: 0.70, pool: ["😬 아까워~", "🤣 0점?!", "💩 감사~", "🤭 아닌데..", "😢 울겠다"] },
  bot_streak:        { p: 0.60, pool: ["🔥 불붙었다!", "💪 연속!", "😎 못 멈춰", "🚀 폭주 중~"] },
  player_streak_bad: { p: 0.55, pool: ["😬 연속?!", "🤔 실력? 운?", "📉 추락 중~", "😢 눈물.."] },
  mid_game_taunt:    { p: 0.25, pool: ["😏 이 격차?", "👑 이미 끝남", "👋 항복?", "🎯 예정된 승리"] }
};
const HIGH_VALUE = { yacht: 1, fullHouse: 1, largeStraight: 1 };
const COOLDOWN_MS = 4000;
const SLOW_FIRST_MS = 10000, SLOW_AGAIN_MS = 15000;

function filled(scores) {
  const out = {};
  YACHT_CATEGORIES.forEach((c) => { if (scores && typeof scores[c] === "number") out[c] = scores[c]; });
  return out;
}
function total(p) { return p ? Aug.totalScore(p.scores || {}, p.aug) : 0; }

// say(msg) sends the bubble; rand(n) -> 0..n-1; me/opp are the player keys;
// lastSaid() -> time of the bot's latest bubble, so a taunt never covers a decision line right away.
function create({ say, rand, me, opp, log, lastSaid }) {
  let s = null, lastTaunt = 0, lastLine = "";
  const reset = () => {
    s = { primed: false, started: false, ended: false, seen: { [me]: {}, [opp]: {} }, prevGap: 0,
          botHigh: 0, oppLow: 0, slowAt: 0, slowCount: 0, oppTurnKey: "" };
  };
  reset();

  function tryEmote(event, gap, force) {
    const now = Date.now();
    if (!force && now - lastTaunt < COOLDOWN_MS) return false;
    const t = TRIGGERS[event];
    let p = t.p;
    if (gap > 50) p = Math.min(p * 1.3, 1);
    if (rand(1000) >= p * 1000) return false;
    lastTaunt = now;
    const pool = t.pool.filter((l) => l !== lastLine);  // no same line twice in a row
    const line = pool[rand(pool.length)];
    lastLine = line;
    if (log) log("taunt " + event + ": " + line);
    const free = lastSaid ? lastSaid() + 2500 - now : 0;
    setTimeout(() => { say(line); }, Math.max(300 + rand(500), free));
    return true;
  }

  // Called on the bot's first roll of the game.
  function gameStart() {
    if (s.started) return;
    s.started = true;
    tryEmote("game_start", 0);
  }

  // Called every loop tick with the latest room.
  function observe(room) {
    if (!room || room.status === "waiting") { if (s.primed) reset(); return; }
    if (!room.players || !room.players[opp]) return;
    const P = room.players;
    const gap = total(P[me]) - total(P[opp]);

    // First look at a game already in progress (bot restart): remember it, say nothing.
    if (!s.primed) {
      s.primed = true;
      s.started = Object.keys(filled(P[me].scores)).length > 0;
      s.ended = room.status === "finished";
      [me, opp].forEach((k) => { s.seen[k] = filled(P[k].scores); });
      s.prevGap = gap;
      return;
    }

    // New records since the last tick (a swap moves existing records, so only brand-new keys count).
    let recorded = false;
    [me, opp].forEach((k) => {
      const now = filled(P[k].scores), was = s.seen[k];
      Object.keys(now).forEach((c) => {
        if (c in was) return;
        recorded = true;
        onRecord(k, c, now[c], gap);
      });
      s.seen[k] = now;
    });

    if (room.status === "finished") {
      if (!s.ended) {
        s.ended = true;
        // The last word skips the cooldown: a record line often lands just before the game ends.
        if (room.winner === me) tryEmote("game_end_win", gap, true);
        else if (room.winner === opp) tryEmote("game_end_lose", gap, true);
      }
      return;
    }
    if (room.status !== "playing") return;

    if (recorded) {
      if (gap >= 30) tryEmote("bot_leading", gap);
      else if (gap <= -30) tryEmote("bot_losing", gap);
      if (s.prevGap <= -30 && gap > -15) tryEmote("bot_comeback", gap);
      if (Object.keys(s.seen[me]).length >= 6 && gap > 0) tryEmote("mid_game_taunt", gap);
      s.prevGap = gap;
    }

    // Opponent idling on their turn (not during an augment pick).
    if (room.currentTurn === opp && !room.augmentPhase && typeof room.lastActivityAt === "number") {
      const key = String(room.lastActivityAt);
      if (key !== s.oppTurnKey) { s.oppTurnKey = key; s.slowCount = 0; }
      const idle = Date.now() - room.lastActivityAt;
      if ((s.slowCount === 0 && idle > SLOW_FIRST_MS) || (s.slowCount === 1 && idle > SLOW_FIRST_MS + SLOW_AGAIN_MS)) {
        s.slowCount++;
        tryEmote("player_slow", gap);
      }
    }
  }

  // Most specific line first: the cooldown lets only one through per record.
  function onRecord(k, c, score, gap) {
    if (k === opp) {
      const low = score <= 5;
      s.oppLow = low ? s.oppLow + 1 : 0;
      s.botHigh = 0;
      if (c === "yacht" && score >= 50) tryEmote("player_yacht", gap);
      if (score === 0 && HIGH_VALUE[c]) tryEmote("player_wasted", gap);
      if (s.oppLow >= 2) tryEmote("player_streak_bad", gap);
      if (score === 0) tryEmote("player_zero", gap);
      else if (low) tryEmote("player_low", gap);
    } else {
      s.botHigh = score >= 20 ? s.botHigh + 1 : 0;
      s.oppLow = 0;
      if (c === "yacht" && score >= 50) tryEmote("bot_yacht", gap);
      if (s.botHigh >= 2) tryEmote("bot_streak", gap);
      if (score === 0) tryEmote("bot_zero", gap);
      else if (score >= 25) tryEmote("bot_high", gap);
    }
  }

  return { observe, gameStart, TRIGGERS };
}

module.exports = { create, TRIGGERS };
