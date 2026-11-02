'use strict';

const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const crypto = require("crypto");
const Scoring = require("./scoring");
const Rules = require("./game-rules");
const Aug = require("./augments");
const { ServerValue } = require("firebase-admin/database");

admin.initializeApp();
const db = admin.database();

// ─── Helpers ───

function requireAppCheck(context) {
  if (context.app === undefined) {
    throw new functions.https.HttpsError("failed-precondition", "App Check verification failed.");
  }
}

function requireAuth(context) {
  if (!context.auth || !context.auth.uid) {
    throw new functions.https.HttpsError("unauthenticated", "Authentication required.");
  }
  return context.auth.uid;
}

function findPlayerKey(players, uid) {
  if (players.player1 && players.player1.uid === uid) return "player1";
  if (players.player2 && players.player2.uid === uid) return "player2";
  return null;
}

function opponentOf(key) {
  return key === "player1" ? "player2" : "player1";
}

function sanitizePlayerName(name) {
  if (!name || typeof name !== "string") return null;
  // Trim whitespace and collapse internal spaces
  name = name.trim().replace(/\s+/g, " ");
  if (name.length === 0) return null;
  if (name.length > 20) name = name.substring(0, 20);
  return name;
}

function generateRoomCode() {
  var chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  var code = "";
  for (var i = 0; i < 6; i++) {
    code += chars.charAt(crypto.randomInt(0, chars.length));
  }
  return code;
}

function buildEmptyScores(gameMode) {
  var scores = { _init: true };
  if (gameMode === "yahtzee") {
    scores.yahtzeeBonus = 0;
  }
  return scores;
}

function randomDie() {
  return crypto.randomInt(1, 7);
}

// ─── Rate Limiting ───

const RATE_LIMITS = {
  createRoom: { windowMs: 10000, maxRequests: 3 },
  joinRoom: { windowMs: 10000, maxRequests: 5 }
  // rollDice / selectCategory are intentionally not rate-limited: the extra DB
  // transaction per call roughly doubled their latency, and turn order is
  // already enforced inside each function's room transaction.
};

async function checkRateLimit(uid, action) {
  const limit = RATE_LIMITS[action];
  if (!limit) return;

  const now = Date.now();
  const rateLimitRef = db.ref("rateLimits/" + uid + "/" + action);

  const result = await rateLimitRef.transaction((current) => {
    if (!current || (now - current.windowStart) >= limit.windowMs) {
      return { windowStart: now, count: 1 };
    }
    if (current.count >= limit.maxRequests) {
      return;
    }
    return { windowStart: current.windowStart, count: current.count + 1 };
  });

  if (!result.committed) {
    throw new functions.https.HttpsError("resource-exhausted", "Too many requests. Please wait.");
  }
}

const ROOM_CODE_MAX_RETRIES = 5;

// Same region as the RTDB instance (asia-southeast1) so every DB round trip stays
// in-region. Callables previously ran in asia-northeast3 and paid Seoul<->Singapore
// latency on each transaction.
const regionFn = functions.region("asia-southeast1");

// ─── createRoom ───

exports.createRoom = regionFn.https.onCall(async (data, context) => {
  requireAppCheck(context);
  const uid = requireAuth(context);
  await checkRateLimit(uid, "createRoom");
  const { gameMode, diceSkin } = data;
  let playerName = data.playerName;
  const nicknameKo = (typeof data.nicknameKo === "string") ? data.nicknameKo.substring(0, 20) : null;
  const nicknameEn = (typeof data.nicknameEn === "string") ? data.nicknameEn.substring(0, 20) : null;

  if (gameMode !== "yacht" && gameMode !== "yahtzee") {
    throw new functions.https.HttpsError("invalid-argument", "Invalid game mode.");
  }
  playerName = sanitizePlayerName(playerName);
  if (!playerName) {
    throw new functions.https.HttpsError("invalid-argument", "Invalid player name.");
  }

  let code, exists;
  for (let attempt = 0; attempt < ROOM_CODE_MAX_RETRIES; attempt++) {
    code = generateRoomCode();
    const snap = await db.ref("rooms/" + code).once("value");
    if (!snap.exists()) { exists = false; break; }
    exists = true;
  }
  if (exists) {
    throw new functions.https.HttpsError("unavailable", "Could not generate room code. Try again.");
  }

  const player1Data = {
    name: playerName,
    uid: uid,
    connected: true,
    scores: buildEmptyScores(gameMode),
    diceSkin: diceSkin || "classic"
  };
  if (nicknameKo) player1Data.nicknameKo = nicknameKo;
  if (nicknameEn) player1Data.nicknameEn = nicknameEn;

  const roomData = {
    type: "private",
    gameMode: gameMode,
    // Augment mode is Yacht-only (v1) and only for private rooms.
    augmentMode: gameMode === "yacht" && data.augmentMode === true,
    status: "waiting",
    createdAt: ServerValue.TIMESTAMP,
    lastActivityAt: ServerValue.TIMESTAMP,
    currentTurn: "player1",
    rollCount: 0,
    dice: {
      0: { value: 0, held: false },
      1: { value: 0, held: false },
      2: { value: 0, held: false },
      3: { value: 0, held: false },
      4: { value: 0, held: false }
    },
    players: {
      player1: player1Data
    },
    winner: ""
  };

  await db.ref("rooms/" + code).set(roomData);
  return { roomCode: code, playerKey: "player1" };
});

// ─── joinRoom ───

exports.joinRoom = regionFn.https.onCall(async (data, context) => {
  requireAppCheck(context);
  const uid = requireAuth(context);
  await checkRateLimit(uid, "joinRoom");
  const { roomCode, diceSkin } = data;
  let playerName = data.playerName;
  const nicknameKo = (typeof data.nicknameKo === "string") ? data.nicknameKo.substring(0, 20) : null;
  const nicknameEn = (typeof data.nicknameEn === "string") ? data.nicknameEn.substring(0, 20) : null;

  playerName = sanitizePlayerName(playerName);
  if (!playerName) {
    throw new functions.https.HttpsError("invalid-argument", "Invalid player name.");
  }

  if (!roomCode || typeof roomCode !== "string") {
    throw new functions.https.HttpsError("invalid-argument", "Room code required.");
  }
  const targetCode = roomCode.toUpperCase().trim();

  const roomRef = db.ref("rooms/" + targetCode);

  const result = await roomRef.transaction((room) => {
    if (!room) return room;
    if (room.status !== "waiting") return;
    if (room.players && room.players.player2) return;
    if (room.players && room.players.player1 && room.players.player1.uid === uid) return;

    const p2 = {
      name: playerName,
      uid: uid,
      connected: true,
      scores: buildEmptyScores(room.gameMode),
      diceSkin: diceSkin || "classic"
    };
    if (nicknameKo) p2.nicknameKo = nicknameKo;
    if (nicknameEn) p2.nicknameEn = nicknameEn;

    room.players.player2 = p2;
    room.status = "playing";
    room.lastActivityAt = { ".sv": "timestamp" };
    Rules.startGame(room, cryptoRand, Date.now());
    return room;
  });

  if (!result.committed || !result.snapshot.exists()) {
    // Determine specific error reason
    const snap = await roomRef.once("value");
    if (!snap.exists()) throw new functions.https.HttpsError("not-found", "Room not found.");
    const room = snap.val();
    if (room.status !== "waiting") throw new functions.https.HttpsError("failed-precondition", "Room is already in a game.");
    if (room.players && room.players.player2) throw new functions.https.HttpsError("failed-precondition", "Room is full.");
    if (room.players && room.players.player1 && room.players.player1.uid === uid) throw new functions.https.HttpsError("failed-precondition", "Cannot join your own room.");
    throw new functions.https.HttpsError("aborted", "Could not join room. Try again.");
  }

  const finalRoom = result.snapshot.val();
  return { roomCode: targetCode, playerKey: "player2", gameMode: finalRoom.gameMode, augmentMode: finalRoom.augmentMode === true };
});

// ─── findOrCreateRandomRoom ───

exports.findOrCreateRandomRoom = regionFn.https.onCall(async (data, context) => {
  requireAppCheck(context);
  const uid = requireAuth(context);
  await checkRateLimit(uid, "joinRoom");
  const { diceSkin } = data;
  let playerName = data.playerName;
  let gameMode = data.gameMode;
  const nicknameKo = (typeof data.nicknameKo === "string") ? data.nicknameKo.substring(0, 20) : null;
  const nicknameEn = (typeof data.nicknameEn === "string") ? data.nicknameEn.substring(0, 20) : null;

  const isAny = gameMode === "any";
  if (!isAny && gameMode !== "yacht" && gameMode !== "yahtzee") {
    gameMode = "yahtzee";
  }
  playerName = sanitizePlayerName(playerName);
  if (!playerName) {
    throw new functions.https.HttpsError("invalid-argument", "Invalid player name.");
  }

  // Search for existing random waiting rooms
  // No limit: stale rooms are purged by cleanupStaleRooms, and a fixed limit
  // let old abandoned rooms crowd out fresh random rooms.
  const snap = await db.ref("rooms").orderByChild("status").equalTo("waiting").once("value");
  const now = Date.now();
  const available = [];
  if (snap.exists()) {
    snap.forEach((child) => {
      const room = child.val();
      if (room.type !== "random") return;
      if (!room.players || room.players.player2) return;
      if (room.players.player1 && room.players.player1.uid === uid) return;
      if (room.players.player1 && room.players.player1.connected === false) return;
      if (room.createdAt && (now - room.createdAt > 10 * 60 * 1000)) return;
      // gameMode filtering: "any" matches all, otherwise must match room or room is "any"
      if (!isAny && room.gameMode !== gameMode && room.requestedMode !== "any") return;
      available.push(child.key);
    });
  }

  // Try to join an available random room using transaction
  for (let i = 0; i < available.length; i++) {
    const targetCode = available[crypto.randomInt(0, available.length)];
    const roomRef = db.ref("rooms/" + targetCode);

    const result = await roomRef.transaction((room) => {
      if (!room) return room;
      if (room.status !== "waiting" || room.type !== "random") return;
      if (room.players && room.players.player2) return;
      if (room.players && room.players.player1 && room.players.player1.uid === uid) return;

      // If room creator chose "any", joiner's specific mode wins (or yahtzee if both "any")
      if (room.requestedMode === "any" && !isAny) {
        room.gameMode = gameMode;
        if (room.players && room.players.player1) {
          room.players.player1.scores = buildEmptyScores(gameMode);
        }
      }

      const p2 = {
        name: playerName,
        uid: uid,
        connected: true,
        scores: buildEmptyScores(room.gameMode),
        diceSkin: diceSkin || "classic"
      };
      if (nicknameKo) p2.nicknameKo = nicknameKo;
      if (nicknameEn) p2.nicknameEn = nicknameEn;

      room.players.player2 = p2;
      room.status = "playing";
      room.lastActivityAt = { ".sv": "timestamp" };
      return room;
    });

    if (result.committed && result.snapshot.val() && result.snapshot.val().status === "playing") {
      return { roomCode: targetCode, playerKey: "player2", gameMode: result.snapshot.val().gameMode, matched: true };
    }
    // Transaction failed (room was taken), try next
    available.splice(available.indexOf(targetCode), 1);
  }

  // No available room found — create a new random room
  let code, exists;
  for (let attempt = 0; attempt < ROOM_CODE_MAX_RETRIES; attempt++) {
    code = generateRoomCode();
    const codeSnap = await db.ref("rooms/" + code).once("value");
    if (!codeSnap.exists()) { exists = false; break; }
    exists = true;
  }
  if (exists) {
    throw new functions.https.HttpsError("unavailable", "Could not generate room code. Try again.");
  }

  // "any" mode: store as yahtzee by default, but track requestedMode for matching
  const actualGameMode = isAny ? "yahtzee" : gameMode;

  const player1Data = {
    name: playerName,
    uid: uid,
    connected: true,
    scores: buildEmptyScores(actualGameMode),
    diceSkin: diceSkin || "classic"
  };
  if (nicknameKo) player1Data.nicknameKo = nicknameKo;
  if (nicknameEn) player1Data.nicknameEn = nicknameEn;

  const roomData = {
    type: "random",
    gameMode: actualGameMode,
    requestedMode: isAny ? "any" : gameMode,
    status: "waiting",
    createdAt: ServerValue.TIMESTAMP,
    lastActivityAt: ServerValue.TIMESTAMP,
    currentTurn: "player1",
    rollCount: 0,
    dice: {
      0: { value: 0, held: false },
      1: { value: 0, held: false },
      2: { value: 0, held: false },
      3: { value: 0, held: false },
      4: { value: 0, held: false }
    },
    players: {
      player1: player1Data
    },
    winner: ""
  };

  await db.ref("rooms/" + code).set(roomData);
  return { roomCode: code, playerKey: "player1", gameMode: gameMode, matched: false };
});

// ─── updateGameMode ───

exports.updateGameMode = regionFn.https.onCall(async (data, context) => {
  requireAppCheck(context);
  const uid = requireAuth(context);
  const { roomCode, gameMode } = data;

  if (gameMode !== "yacht" && gameMode !== "yahtzee") {
    throw new functions.https.HttpsError("invalid-argument", "Invalid game mode.");
  }
  if (!roomCode) {
    throw new functions.https.HttpsError("invalid-argument", "Room code required.");
  }

  const roomRef = db.ref("rooms/" + roomCode);
  const snap = await roomRef.once("value");
  if (!snap.exists()) throw new functions.https.HttpsError("not-found", "Room not found.");

  const room = snap.val();
  if (room.status !== "waiting") {
    throw new functions.https.HttpsError("failed-precondition", "Game already started.");
  }
  if (room.type === "random") {
    throw new functions.https.HttpsError("failed-precondition", "Cannot change mode for random match.");
  }
  if (!room.players || !room.players.player1 || room.players.player1.uid !== uid) {
    throw new functions.https.HttpsError("permission-denied", "Only the host can change mode.");
  }

  // augmentMode: optional boolean; omitted = keep current. Always off for Yahtzee.
  const wantAugment = typeof data.augmentMode === "boolean" ? data.augmentMode : room.augmentMode === true;
  const updates = {
    gameMode: gameMode,
    augmentMode: gameMode === "yacht" && wantAugment,
    "players/player1/scores": buildEmptyScores(gameMode)
  };
  await roomRef.update(updates);
  return { success: true };
});

// ─── Rule-engine helpers ───

function throwRule(code) {
  const e = Rules.ERRORS[code] || ["aborted", "Could not update game state. Try again."];
  throw new functions.https.HttpsError(e[0], e[1]);
}

const cryptoRand = (n) => crypto.randomInt(0, n);

// Runs a Rules reducer inside a room transaction. reducer(room) returns
// { error } to abort or a result object to commit.
async function runRoomTransaction(roomCode, reducer) {
  const roomRef = db.ref("rooms/" + roomCode);
  let ruleError = null;
  let out = null;
  const result = await roomRef.transaction((room) => {
    ruleError = null;
    out = null;
    if (!room) return room;
    const r = reducer(room);
    if (r.error) { ruleError = r.error; return; }
    out = r;
    return room;
  });
  if (!result.committed) {
    if (ruleError) throwRule(ruleError);
    throw new functions.https.HttpsError("aborted", "Could not update game state. Try again.");
  }
  if (!result.snapshot.exists() || !out) throw new functions.https.HttpsError("not-found", "Room not found.");
  return { out: out, room: result.snapshot.val() };
}

function requireRoomCode(data) {
  if (!data || !data.roomCode || typeof data.roomCode !== "string") {
    throw new functions.https.HttpsError("invalid-argument", "Room code required.");
  }
  return data.roomCode;
}

// ─── rollDice ───

exports.rollDice = regionFn.https.onCall(async (data, context) => {
  requireAppCheck(context);
  const uid = requireAuth(context);
  const roomCode = requireRoomCode(data);

  // Pre-generate dice values (transaction callback must be pure/deterministic)
  const randomValues = [];
  for (let i = 0; i < 5; i++) randomValues.push(randomDie());

  const { out } = await runRoomTransaction(roomCode, (room) => Rules.applyRoll(room, uid, randomValues));
  return { dice: out.dice, rollCount: out.rollCount, extraUsed: out.extraUsed };
});

// ─── selectCategory ───

exports.selectCategory = regionFn.https.onCall(async (data, context) => {
  requireAppCheck(context);
  const uid = requireAuth(context);
  const roomCode = requireRoomCode(data);
  const { category } = data;
  if (!category || typeof category !== "string") {
    throw new functions.https.HttpsError("invalid-argument", "Category required.");
  }
  const useDouble = data.useDouble === true;
  const useInsurance = (data.useInsurance === "safetyNet" || data.useInsurance === "bigInsurance") ? data.useInsurance : null;

  const { out, room } = await runRoomTransaction(roomCode, (r) =>
    Rules.applySelect(r, uid, category, { useDouble: useDouble, useInsurance: useInsurance, rand: cryptoRand, now: Date.now() }));

  const winner = room.winner || null;
  return {
    score: out.score,
    effects: out.effects,
    yahtzeeBonus: out.yahtzeeBonus,
    steals: out.steals,
    gameOver: !!winner && room.status === "finished",
    winner: winner
  };
});

const PICK_TIMEOUT_GRACE_MS = 3000;

// ─── pickAugment (augment mode) ───
// Picks are hidden until both players choose: each pick is first written to
// augmentPicks/{room}/{tier} (no client read access), and only the second
// picker's call reveals both picks in the room.

exports.pickAugment = regionFn.https.onCall(async (data, context) => {
  requireAppCheck(context);
  const uid = requireAuth(context);
  const roomCode = requireRoomCode(data);
  const claimTimeout = data.claimTimeout === true;
  const augmentId = data.augmentId;
  if (!claimTimeout && typeof augmentId !== "string") throw new functions.https.HttpsError("invalid-argument", "Augment required.");

  const roomRef = db.ref("rooms/" + roomCode);
  const snap = await roomRef.once("value");
  if (!snap.exists()) throw new functions.https.HttpsError("not-found", "Room not found.");
  const roomNow = snap.val();
  let pk, tier;
  if (claimTimeout) {
    // Either player may resolve an expired pick: missing picks become random offers.
    pk = Rules.findPlayerKey(roomNow.players || {}, uid);
    if (!pk) throwRule("NOT_PLAYER");
    const phase = roomNow.augmentPhase;
    if (!phase) return { success: true, revealed: false };
    if (Date.now() < (phase.deadline || 0) + PICK_TIMEOUT_GRACE_MS) {
      throw new functions.https.HttpsError("failed-precondition", "Pick time has not expired.");
    }
    tier = phase.tier;
  } else {
    const v = Rules.validatePick(roomNow, uid, augmentId);
    if (v.error) throwRule(v.error);
    pk = v.playerKey;
    tier = v.tier;
  }

  const pickRef = db.ref("augmentPicks/" + roomCode + "/" + tier);
  const pr = await pickRef.transaction((cur) => {
    cur = cur || {};
    if (claimTimeout) return Rules.fillMissingPicks(roomNow, cur, cryptoRand);
    if (cur[pk]) return; // already picked this tier
    cur[pk] = augmentId;
    return cur;
  });
  if (!pr.committed) throw new functions.https.HttpsError("failed-precondition", "Augment already picked.");
  const picks = pr.snapshot.val() || {};
  const both = !!(picks.player1 && picks.player2);

  let ruleError = null;
  await roomRef.transaction((room) => {
    ruleError = null;
    if (!room) return room;
    const r = both
      ? Rules.applyPicks(room, picks, tier, { ".sv": "timestamp" })
      : Rules.markReady(room, pk, tier);
    if (r.error) { ruleError = r.error; return; }
    if (r.stale) return; // phase already resolved by the other call
    return room;
  });
  if (ruleError) throwRule(ruleError);
  if (both) await pickRef.remove();
  return { success: true, revealed: both };
});

// ─── useAugment (augment mode, active augments) ───

exports.useAugment = regionFn.https.onCall(async (data, context) => {
  requireAppCheck(context);
  const uid = requireAuth(context);
  const roomCode = requireRoomCode(data);
  const a = data.action || {};
  // Whitelist fields; the rule engine validates types and ranges.
  const action = { type: a.type, die: a.die, from: a.from, delta: a.delta, value: a.value, category: a.category };

  const { out } = await runRoomTransaction(roomCode, (room) => Rules.applyAction(room, uid, action));
  return out;
});

// ─── leaveGame ───

exports.leaveGame = regionFn.https.onCall(async (data, context) => {
  requireAppCheck(context);
  const uid = requireAuth(context);
  const { roomCode } = data;

  if (!roomCode) throw new functions.https.HttpsError("invalid-argument", "Room code required.");

  const roomRef = db.ref("rooms/" + roomCode);

  const result = await roomRef.transaction((room) => {
    if (!room) return room;
    const playerKey = findPlayerKey(room.players || {}, uid);
    if (!playerKey) return;

    if (room.status === "playing") {
      room.status = "finished";
      room.winner = opponentOf(playerKey);
    }
    return room;
  });

  if (!result.committed) {
    const snap = await roomRef.once("value");
    if (!snap.exists()) throw new functions.https.HttpsError("not-found", "Room not found.");
    const room = snap.val();
    if (!findPlayerKey(room.players || {}, uid)) throw new functions.https.HttpsError("permission-denied", "Not a player in this room.");
    throw new functions.https.HttpsError("aborted", "Could not leave game. Try again.");
  }

  return { success: true };
});

// ─── cancelRoom ───

exports.cancelRoom = regionFn.https.onCall(async (data, context) => {
  requireAppCheck(context);
  const uid = requireAuth(context);
  const { roomCode } = data;

  if (!roomCode) throw new functions.https.HttpsError("invalid-argument", "Room code required.");

  const roomRef = db.ref("rooms/" + roomCode);
  const snap = await roomRef.once("value");
  if (!snap.exists()) return { success: true };

  const room = snap.val();
  if (room.status !== "waiting") {
    throw new functions.https.HttpsError("failed-precondition", "Cannot cancel a started game.");
  }
  if (!room.players || !room.players.player1 || room.players.player1.uid !== uid) {
    throw new functions.https.HttpsError("permission-denied", "Only the host can cancel.");
  }

  await roomRef.remove();
  return { success: true };
});

// ─── proposeDraw ───

exports.proposeDraw = regionFn.https.onCall(async (data, context) => {
  requireAppCheck(context);
  const uid = requireAuth(context);
  const { roomCode } = data;

  if (!roomCode) throw new functions.https.HttpsError("invalid-argument", "Room code required.");

  const roomRef = db.ref("rooms/" + roomCode);

  const result = await roomRef.transaction((room) => {
    if (!room) return room;
    const playerKey = findPlayerKey(room.players || {}, uid);
    if (!playerKey) return;
    if (room.status !== "playing") return;
    if (room.drawProposal) return;

    room.drawProposal = {
      proposedBy: playerKey,
      timestamp: { ".sv": "timestamp" }
    };
    return room;
  });

  if (!result.committed) {
    const snap = await roomRef.once("value");
    if (!snap.exists()) throw new functions.https.HttpsError("not-found", "Room not found.");
    const room = snap.val();
    if (!findPlayerKey(room.players || {}, uid)) throw new functions.https.HttpsError("permission-denied", "Not a player in this room.");
    if (room.status !== "playing") throw new functions.https.HttpsError("failed-precondition", "Game is not in progress.");
    if (room.drawProposal) throw new functions.https.HttpsError("failed-precondition", "A draw proposal is already pending.");
    throw new functions.https.HttpsError("aborted", "Could not propose draw. Try again.");
  }

  return { success: true };
});

// ─── respondToDraw ───

exports.respondToDraw = regionFn.https.onCall(async (data, context) => {
  requireAppCheck(context);
  const uid = requireAuth(context);
  const { roomCode, accept } = data;

  if (!roomCode) throw new functions.https.HttpsError("invalid-argument", "Room code required.");

  const roomRef = db.ref("rooms/" + roomCode);

  const result = await roomRef.transaction((room) => {
    if (!room) return room;
    const playerKey = findPlayerKey(room.players || {}, uid);
    if (!playerKey) return;
    if (room.status !== "playing") return;
    if (!room.drawProposal) return;
    if (room.drawProposal.proposedBy === playerKey) return;

    if (accept) {
      room.status = "finished";
      room.winner = "tie";
      room.drawProposal = null;
    } else {
      room.drawProposal = null;
    }
    return room;
  });

  if (!result.committed) {
    const snap = await roomRef.once("value");
    if (!snap.exists()) throw new functions.https.HttpsError("not-found", "Room not found.");
    const room = snap.val();
    if (!findPlayerKey(room.players || {}, uid)) throw new functions.https.HttpsError("permission-denied", "Not a player in this room.");
    if (room.status !== "playing") throw new functions.https.HttpsError("failed-precondition", "Game is not in progress.");
    if (!room.drawProposal) throw new functions.https.HttpsError("failed-precondition", "No draw proposal pending.");
    if (room.drawProposal.proposedBy === findPlayerKey(room.players || {}, uid)) throw new functions.https.HttpsError("failed-precondition", "Cannot respond to own proposal.");
    throw new functions.https.HttpsError("aborted", "Could not respond to draw. Try again.");
  }

  return { success: true };
});

// ─── claimDisconnectWin ───

exports.claimDisconnectWin = regionFn.https.onCall(async (data, context) => {
  requireAppCheck(context);
  const uid = requireAuth(context);
  const { roomCode } = data;

  if (!roomCode) throw new functions.https.HttpsError("invalid-argument", "Room code required.");

  const roomRef = db.ref("rooms/" + roomCode);

  const result = await roomRef.transaction((room) => {
    if (!room) return room;
    if (room.status !== "playing") return;

    const playerKey = findPlayerKey(room.players, uid);
    if (!playerKey) return;

    const oppKey = opponentOf(playerKey);
    if (room.players[oppKey] && room.players[oppKey].connected === false) {
      room.status = "finished";
      room.winner = playerKey;
      return room;
    }

    return;
  });

  if (!result.committed) {
    throw new functions.https.HttpsError("failed-precondition", "Cannot claim win: opponent may have reconnected.");
  }

  return { success: true };
});

// ─── saveBotGameResult ───

// ─── Minimum score thresholds for valid games ───

const MIN_VALID_SCORE = { yacht: 50, yahtzee: 100 };
const MIN_GAME_DURATION_MS = 120000; // 2 minutes

function isValidGame(gameMode, myScore, oppScore, durationMs) {
  const threshold = MIN_VALID_SCORE[gameMode] || 0;
  if (myScore < threshold || oppScore < threshold) return false;
  if (durationMs !== undefined && durationMs < MIN_GAME_DURATION_MS) return false;
  return true;
}

// ─── Shared bot result save helper ───

async function saveBotResult(uid, gameMode, botDifficulty, myScore, oppScore, result, nicknameKo, nicknameEn, scoredYacht) {
  if (gameMode !== "yacht" && gameMode !== "yahtzee") {
    throw new Error("Invalid game mode.");
  }
  if (botDifficulty !== "basic" && botDifficulty !== "gambler" && botDifficulty !== "wave") {
    throw new Error("Invalid bot difficulty.");
  }
  if (typeof myScore !== "number" || typeof oppScore !== "number") {
    throw new Error("Invalid scores.");
  }
  if (result !== "win" && result !== "loss" && result !== "tie") {
    throw new Error("Invalid result.");
  }

  // Determine result: forfeit (loss) is always respected, otherwise use scores
  let actualResult;
  if (result === "loss") {
    // Forfeit or tab close — always a loss regardless of scores
    actualResult = "loss";
  } else if (myScore > oppScore) actualResult = "win";
  else if (myScore < oppScore) actualResult = "loss";
  else actualResult = "tie";

  // Score range validation
  const maxScore = gameMode === "yacht" ? 305 : 1575;
  if (myScore < 0 || myScore > maxScore || oppScore < 0 || oppScore > maxScore) {
    throw new Error("Score out of range.");
  }

  const userRef = db.ref("users/" + uid);

  // Rate limiting: min 30s between bot game saves
  const lastGameSnap = await userRef.child("lastBotGame").once("value");
  const lastGame = lastGameSnap.val() || 0;
  if (Date.now() - lastGame < 30000) {
    throw new Error("Too many requests. Please wait.");
  }
  await userRef.child("lastBotGame").set(ServerValue.TIMESTAMP);

  const userSnap = await userRef.once("value");
  const userData = userSnap.val() || {};
  if (!userData.displayName) return false;

  // Backfill nicknames if missing
  const nickUpdates = {};
  if (!userData.nickname_ko && nicknameKo) nickUpdates.nickname_ko = nicknameKo;
  if (!userData.nickname_en && nicknameEn) nickUpdates.nickname_en = nicknameEn;
  if (Object.keys(nickUpdates).length > 0) {
    await userRef.update(nickUpdates);
  }

  // Override result to "invalid" if scores below threshold
  const valid = isValidGame(gameMode, myScore, oppScore);
  const finalResult = valid ? actualResult : "invalid";

  const botName = botDifficulty === "wave" ? "Wave Bot" : (botDifficulty === "gambler" ? "Gambler Bot" : "Basic Bot");

  await userRef.child("history").push({
    date: ServerValue.TIMESTAMP,
    mode: gameMode,
    opponentName: botName,
    myScore: myScore,
    oppScore: oppScore,
    result: finalResult,
    roomCode: "BOT"
  });

  if (valid) {
    await userRef.child("stats").transaction((stats) => {
      if (!stats) stats = { totalGames: 0, wins: 0, losses: 0, ties: 0 };
      stats.totalGames = (stats.totalGames || 0) + 1;
      if (actualResult === "win") {
        stats.wins = (stats.wins || 0) + 1;
        if (!stats.botWins) stats.botWins = {};
        stats.botWins[botDifficulty] = (stats.botWins[botDifficulty] || 0) + 1;
        stats.currentStreak = (stats.currentStreak || 0) + 1;
        if (stats.currentStreak > (stats.maxStreak || 0)) {
          stats.maxStreak = stats.currentStreak;
        }
      } else {
        if (actualResult === "loss") stats.losses = (stats.losses || 0) + 1;
        else stats.ties = (stats.ties || 0) + 1;
        stats.currentStreak = 0;
      }
      // Score-based achievements
      if (!stats.achievements) stats.achievements = {};
      if (myScore === 256) {
        stats.achievements.score256 = true;
      }
      // Yacht/Yahtzee streak achievement
      if (scoredYacht) {
        stats.consecutiveYachtStreak = (stats.consecutiveYachtStreak || 0) + 1;
      } else {
        stats.consecutiveYachtStreak = 0;
      }
      if ((stats.consecutiveYachtStreak || 0) >= 3) {
        stats.achievements.yachtStreak3 = true;
      }
      return stats;
    });
  }

  return true;
}

exports.saveBotGameResult = regionFn.https.onCall(async (data, context) => {
  requireAppCheck(context);
  const uid = requireAuth(context);
  try {
    const nKo = (typeof data.nicknameKo === "string") ? data.nicknameKo.substring(0, 20) : null;
    const nEn = (typeof data.nicknameEn === "string") ? data.nicknameEn.substring(0, 20) : null;
    const scoredYacht = data.scoredYacht === true;
    const ok = await saveBotResult(uid, data.gameMode, data.botDifficulty, data.myScore, data.oppScore, data.result, nKo, nEn, scoredYacht);
    return { success: ok };
  } catch (e) {
    throw new functions.https.HttpsError("invalid-argument", e.message);
  }
});

// ─── saveBotGameResultBeacon (HTTP endpoint for sendBeacon) ───

exports.saveBotGameResultBeacon = regionFn.https.onRequest(async (req, res) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    res.status(204).send("");
    return;
  }
  res.set("Access-Control-Allow-Origin", "*");

  if (req.method !== "POST") { res.status(405).send("Method not allowed"); return; }

  // sendBeacon sends text/plain to avoid CORS preflight, so parse manually
  let body = req.body || {};
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (_) { res.status(400).json({ error: "Invalid JSON" }); return; }
  }
  const { idToken, appCheckToken, gameMode, botDifficulty, myScore, oppScore, result, scoredYacht, nicknameKo, nicknameEn } = body;
  if (!idToken) { res.status(401).json({ error: "No token" }); return; }

  // App Check verification
  if (!appCheckToken) {
    console.warn("saveBotGameResultBeacon: missing App Check token");
    res.status(403).json({ error: "App Check token required" }); return;
  }
  try {
    await admin.appCheck().verifyToken(appCheckToken);
  } catch (e) {
    console.warn("saveBotGameResultBeacon: invalid App Check token:", e.code || e.message);
    res.status(403).json({ error: "Invalid App Check token" }); return;
  }

  const nKo = (typeof nicknameKo === "string") ? nicknameKo.substring(0, 20) : null;
  const nEn = (typeof nicknameEn === "string") ? nicknameEn.substring(0, 20) : null;

  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    await saveBotResult(decoded.uid, gameMode, botDifficulty, myScore, oppScore, result, nKo, nEn, scoredYacht === true);
    res.status(200).json({ success: true });
  } catch (e) {
    console.warn("saveBotGameResultBeacon failed:", e.code || "", e.message);
    res.status(400).json({ error: e.message });
  }
});

// ─── onGameFinished (DB trigger) ───

exports.onGameFinished = functions.region("asia-southeast1")
  .database.instance("yacht-ff0c8-default-rtdb")
  .ref("/rooms/{roomCode}/status")
  .onUpdate(async (change, context) => {
    const before = change.before.val();
    const after = change.after.val();

    if (before === "finished" || after !== "finished") return;

    const roomCode = context.params.roomCode;
    const roomSnap = await db.ref("rooms/" + roomCode).once("value");
    if (!roomSnap.exists()) return;

    const room = roomSnap.val();
    if (!room.players) return;

    const gameMode = room.gameMode;
    const winner = room.winner;

    const playerUpdates = ["player1", "player2"].map(async (playerKey) => {
      const player = room.players[playerKey];
      if (!player || !player.uid) return;

      const oppKey = opponentOf(playerKey);
      const opponent = room.players[oppKey];
      if (!opponent) return;

      const myScores = player.scores || {};
      const oppScores = opponent.scores || {};
      const isAug = room.augmentMode === true;
      const myTotal = isAug ? Aug.totalScore(myScores) : Scoring.totalScore(myScores, gameMode, myScores.yahtzeeBonus);
      const oppTotal = isAug ? Aug.totalScore(oppScores) : Scoring.totalScore(oppScores, gameMode, oppScores.yahtzeeBonus);

      let result;
      if (winner === playerKey) result = "win";
      else if (winner === "tie") result = "tie";
      else result = "loss";

      // Override to "invalid" if scores below threshold or game too short
      const durationMs = room.createdAt ? (Date.now() - room.createdAt) : undefined;
      const valid = isValidGame(gameMode, myTotal, oppTotal, durationMs);
      const finalResult = valid ? result : "invalid";

      const userRef = db.ref("users/" + player.uid);
      const userSnap = await userRef.once("value");
      const userData = userSnap.val();
      if (!userData || !userData.displayName) return;

      // Backfill player's own nicknames if missing in users/ table
      const nickUpdates = {};
      if (!userData.nickname_ko && player.nicknameKo) {
        nickUpdates.nickname_ko = player.nicknameKo;
      }
      if (!userData.nickname_en && player.nicknameEn) {
        nickUpdates.nickname_en = player.nicknameEn;
      }
      if (Object.keys(nickUpdates).length > 0) {
        await userRef.update(nickUpdates);
      }

      // Read opponent user data, falling back to room-level nicknames
      let oppDisplayName = opponent.name;
      let oppNicknameKo = opponent.nicknameKo || null;
      let oppNicknameEn = opponent.nicknameEn || null;
      if (opponent.uid) {
        const oppSnap = await db.ref("users/" + opponent.uid).once("value");
        if (oppSnap.exists()) {
          const oppUser = oppSnap.val();
          if (oppUser.nickname_ko) oppNicknameKo = oppUser.nickname_ko;
          if (oppUser.nickname_en) oppNicknameEn = oppUser.nickname_en;
          if (oppUser.displayName) oppDisplayName = oppUser.displayName;
        }
      }

      const historyEntry = {
        date: ServerValue.TIMESTAMP,
        mode: gameMode,
        opponentName: oppDisplayName,
        myScore: myTotal,
        oppScore: oppTotal,
        result: finalResult,
        roomCode: roomCode
      };
      if (oppNicknameKo) historyEntry.oppNicknameKo = oppNicknameKo;
      if (oppNicknameEn) historyEntry.oppNicknameEn = oppNicknameEn;
      // Augment games are shown in history but excluded from stats (win rate,
      // streaks, skin unlocks), since augments change the scoring baseline.
      const isAugmentGame = room.augmentMode === true;
      if (isAugmentGame) historyEntry.augment = true;

      await userRef.child("history").push(historyEntry);

      if (valid && !isAugmentGame) {
        await userRef.child("stats").transaction((stats) => {
          if (!stats) stats = { totalGames: 0, wins: 0, losses: 0, ties: 0 };
          stats.totalGames = (stats.totalGames || 0) + 1;
          if (result === "win") {
            stats.wins = (stats.wins || 0) + 1;
            stats.currentStreak = (stats.currentStreak || 0) + 1;
            if (stats.currentStreak > (stats.maxStreak || 0)) {
              stats.maxStreak = stats.currentStreak;
            }
          } else {
            if (result === "loss") stats.losses = (stats.losses || 0) + 1;
            else stats.ties = (stats.ties || 0) + 1;
            stats.currentStreak = 0;
          }
          // Score-based achievements
          if (!stats.achievements) stats.achievements = {};
          if (myTotal === 256) {
            stats.achievements.score256 = true;
          }
          // Yacht/Yahtzee streak achievement
          var scoredYacht = (myScores.yacht === 50) || (myScores.yahtzee === 50);
          if (scoredYacht) {
            stats.consecutiveYachtStreak = (stats.consecutiveYachtStreak || 0) + 1;
          } else {
            stats.consecutiveYachtStreak = 0;
          }
          if ((stats.consecutiveYachtStreak || 0) >= 3) {
            stats.achievements.yachtStreak3 = true;
          }
          return stats;
        });
      }
    });

    await Promise.all(playerUpdates);

    // Room removal is handled by cleanupStaleRooms (FINISHED_ROOM_TTL_MS).
    // A detached setTimeout here was unreliable: Gen1 instances are throttled
    // after the function returns, so finished rooms were often never removed.
  });

// ─── cleanupStaleRooms (scheduled) ───

const WAITING_ROOM_TTL_MS = 2 * 60 * 60 * 1000; // private/random rooms nobody joined
const PLAYING_ROOM_TTL_MS = 24 * 60 * 60 * 1000; // abandoned games (no activity)
const FINISHED_ROOM_TTL_MS = 10 * 60 * 1000; // results already saved by onGameFinished

function staleReason(room, now) {
  if (!room || typeof room !== "object") return "empty";
  // Nodes without status are orphans re-created by a late onDisconnect write
  // (players/{key}/connected=false) after the room was removed.
  if (!room.status) return "orphan";
  const last = (typeof room.lastActivityAt === "number" ? room.lastActivityAt : 0) ||
    (typeof room.createdAt === "number" ? room.createdAt : 0);
  const age = now - last;
  if (room.status === "waiting" && age > WAITING_ROOM_TTL_MS) return "waiting";
  if (room.status === "playing" && age > PLAYING_ROOM_TTL_MS) return "playing";
  if (room.status === "finished" && age > FINISHED_ROOM_TTL_MS) return "finished";
  return null;
}

// Cloud Scheduler job: firebase-schedule-cleanupStaleRooms-asia-southeast1 (us-central1).
// The CI deploy service account needs roles/cloudscheduler.admin to manage it.
exports.cleanupStaleRooms = regionFn.pubsub.schedule("every 30 minutes")
  .timeZone("Asia/Seoul")
  .onRun(async () => {
    const snap = await db.ref("rooms").once("value");
    if (!snap.exists()) return null;
    const now = Date.now();
    const updates = {};
    const counts = {};
    snap.forEach((child) => {
      const reason = staleReason(child.val(), now);
      if (!reason) return;
      updates[child.key] = null;
      counts[reason] = (counts[reason] || 0) + 1;
    });
    const n = Object.keys(updates).length;
    if (n > 0) await db.ref("rooms").update(updates);

    // Hidden augment picks whose room no longer exists (abandoned mid-pick).
    const picksSnap = await db.ref("augmentPicks").once("value");
    if (picksSnap.exists()) {
      const orphanPicks = {};
      picksSnap.forEach((child) => {
        if (!snap.child(child.key).exists() || updates[child.key] === null) orphanPicks[child.key] = null;
      });
      if (Object.keys(orphanPicks).length) await db.ref("augmentPicks").update(orphanPicks);
    }
    console.log("cleanupStaleRooms removed", n, JSON.stringify(counts));
    return null;
  });
