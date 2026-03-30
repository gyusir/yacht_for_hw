'use strict';

const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const crypto = require("crypto");
const Scoring = require("./scoring");
const { ServerValue } = require("firebase-admin/database");

admin.initializeApp();
const db = admin.database();

// ─── Helpers ───

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
  if (name.length > 12) name = name.substring(0, 12);
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
  joinRoom: { windowMs: 10000, maxRequests: 5 },
  rollDice: { windowMs: 2000, maxRequests: 3 },
  selectCategory: { windowMs: 2000, maxRequests: 2 }
};

async function checkRateLimit(uid, action) {
  const limit = RATE_LIMITS[action];
  if (!limit) return;

  const now = Date.now();
  const rateLimitRef = db.ref("rateLimits/" + uid + "/" + action);
  const snap = await rateLimitRef.once("value");
  const data = snap.val();

  if (data && data.count >= limit.maxRequests && (now - data.windowStart) < limit.windowMs) {
    throw new functions.https.HttpsError("resource-exhausted", "Too many requests. Please wait.");
  }

  if (!data || (now - data.windowStart) >= limit.windowMs) {
    await rateLimitRef.set({ windowStart: now, count: 1 });
  } else {
    await rateLimitRef.update({ count: data.count + 1 });
  }
}

const ROOM_CODE_MAX_RETRIES = 5;

const regionFn = functions.region("asia-northeast3");

// ─── createRoom ───

exports.createRoom = regionFn.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  await checkRateLimit(uid, "createRoom");
  const { gameMode, diceSkin } = data;
  let playerName = data.playerName;

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

  const roomData = {
    gameMode: gameMode,
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
      player1: {
        name: playerName,
        uid: uid,
        connected: true,
        scores: buildEmptyScores(gameMode),
        diceSkin: diceSkin || "classic"
      }
    },
    winner: ""
  };

  await db.ref("rooms/" + code).set(roomData);
  return { roomCode: code, playerKey: "player1" };
});

// ─── joinRoom ───

exports.joinRoom = regionFn.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  await checkRateLimit(uid, "joinRoom");
  const { roomCode, diceSkin, random } = data;
  let playerName = data.playerName;

  playerName = sanitizePlayerName(playerName);
  if (!playerName) {
    throw new functions.https.HttpsError("invalid-argument", "Invalid player name.");
  }

  let targetCode = roomCode;

  if (random) {
    const snap = await db.ref("rooms").orderByChild("status").equalTo("waiting").limitToFirst(50).once("value");
    if (!snap.exists()) {
      throw new functions.https.HttpsError("not-found", "No rooms available. Create one!");
    }
    const now = Date.now();
    const available = [];
    snap.forEach((child) => {
      const room = child.val();
      if (!room.players || room.players.player2) return;
      if (room.players.player1 && room.players.player1.uid === uid) return;
      if (room.players.player1 && room.players.player1.connected === false) return;
      if (room.createdAt && (now - room.createdAt > 10 * 60 * 1000)) return;
      available.push(child.key);
    });
    if (available.length === 0) {
      throw new functions.https.HttpsError("not-found", "No rooms available. Create one!");
    }
    targetCode = available[crypto.randomInt(0, available.length)];
  }

  if (!targetCode || typeof targetCode !== "string") {
    throw new functions.https.HttpsError("invalid-argument", "Room code required.");
  }
  targetCode = targetCode.toUpperCase().trim();

  const roomRef = db.ref("rooms/" + targetCode);
  const snap = await roomRef.once("value");

  if (!snap.exists()) {
    throw new functions.https.HttpsError("not-found", "Room not found.");
  }

  const room = snap.val();
  if (room.status !== "waiting") {
    throw new functions.https.HttpsError("failed-precondition", "Room is already in a game.");
  }
  if (room.players && room.players.player2) {
    throw new functions.https.HttpsError("failed-precondition", "Room is full.");
  }

  const updates = {};
  updates["players/player2"] = {
    name: playerName,
    uid: uid,
    connected: true,
    scores: buildEmptyScores(room.gameMode),
    diceSkin: diceSkin || "classic"
  };
  updates["status"] = "playing";
  updates["lastActivityAt"] = ServerValue.TIMESTAMP;

  await roomRef.update(updates);
  return { roomCode: targetCode, playerKey: "player2", gameMode: room.gameMode };
});

// ─── updateGameMode ───

exports.updateGameMode = regionFn.https.onCall(async (data, context) => {
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
  if (!room.players || !room.players.player1 || room.players.player1.uid !== uid) {
    throw new functions.https.HttpsError("permission-denied", "Only the host can change mode.");
  }

  const updates = {
    gameMode: gameMode,
    "players/player1/scores": buildEmptyScores(gameMode)
  };
  await roomRef.update(updates);
  return { success: true };
});

// ─── rollDice ───

exports.rollDice = regionFn.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  await checkRateLimit(uid, "rollDice");
  const { roomCode } = data;

  if (!roomCode) throw new functions.https.HttpsError("invalid-argument", "Room code required.");

  const roomRef = db.ref("rooms/" + roomCode);
  const snap = await roomRef.once("value");
  if (!snap.exists()) throw new functions.https.HttpsError("not-found", "Room not found.");

  const room = snap.val();
  if (room.status !== "playing") {
    throw new functions.https.HttpsError("failed-precondition", "Game is not in progress.");
  }

  const playerKey = findPlayerKey(room.players, uid);
  if (!playerKey) throw new functions.https.HttpsError("permission-denied", "Not a player in this room.");
  if (room.currentTurn !== playerKey) {
    throw new functions.https.HttpsError("failed-precondition", "Not your turn.");
  }

  const rollCount = room.rollCount || 0;
  if (rollCount >= 3) {
    throw new functions.https.HttpsError("failed-precondition", "No rolls remaining.");
  }

  const heldSnap = await db.ref("rooms/" + roomCode + "/heldDice").once("value");
  const heldData = heldSnap.val() || {};

  const newDice = {};
  for (let i = 0; i < 5; i++) {
    const currentDie = room.dice && room.dice[i];
    const isHeld = rollCount > 0 && heldData[i] === true && currentDie && currentDie.value >= 1;

    if (isHeld) {
      newDice[i] = { value: currentDie.value, held: true };
    } else {
      newDice[i] = { value: randomDie(), held: false };
    }
  }

  const updates = {
    dice: newDice,
    rollCount: rollCount + 1,
    lastActivityAt: ServerValue.TIMESTAMP
  };

  await roomRef.update(updates);
  return { dice: newDice, rollCount: rollCount + 1 };
});

// ─── selectCategory ───

exports.selectCategory = regionFn.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  await checkRateLimit(uid, "selectCategory");
  const { roomCode, category } = data;

  if (!roomCode) throw new functions.https.HttpsError("invalid-argument", "Room code required.");
  if (!category || typeof category !== "string") {
    throw new functions.https.HttpsError("invalid-argument", "Category required.");
  }

  const roomRef = db.ref("rooms/" + roomCode);

  // Use transaction to prevent race conditions (duplicate category writes)
  const result = await roomRef.transaction((room) => {
    if (!room) return room;

    if (room.status !== "playing") return;
    const playerKey = findPlayerKey(room.players, uid);
    if (!playerKey) return;
    if (room.currentTurn !== playerKey) return;
    if ((room.rollCount || 0) < 1) return;

    const gameMode = room.gameMode;
    const validCategories = Scoring.getCategories(gameMode);
    if (validCategories.indexOf(category) === -1) return;

    const myScores = (room.players[playerKey] && room.players[playerKey].scores) || {};
    if (myScores[category] !== null && myScores[category] !== undefined) return;

    const diceValues = [];
    for (let i = 0; i < 5; i++) {
      const d = room.dice && room.dice[i];
      const v = (d && d.value) || 0;
      if (v < 1 || v > 6) return;
      diceValues.push(v);
    }

    const score = Scoring.calculate(diceValues, category, gameMode);
    const oppKey = opponentOf(playerKey);

    room.players[playerKey].scores[category] = score;
    room.players[playerKey].lastCategory = category;

    if ((category === "yacht" || category === "yahtzee") && score === 50) {
      room.celebration = { player: playerKey, ts: { ".sv": "timestamp" } };
    }

    let yahtzeeBonus = false;
    if (gameMode === "yahtzee") {
      let allSame = true;
      for (let i = 1; i < diceValues.length; i++) {
        if (diceValues[i] !== diceValues[0]) { allSame = false; break; }
      }
      if (allSame && myScores.yahtzee === 50 && category !== "yahtzee") {
        const currentBonus = myScores.yahtzeeBonus || 0;
        room.players[playerKey].scores.yahtzeeBonus = currentBonus + 100;
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

    const updatedScores = room.players[playerKey].scores;
    const oppScores = (room.players[oppKey] && room.players[oppKey].scores) || {};
    const myAllFilled = Scoring.allFilled(updatedScores, gameMode);
    const oppAllFilled = Scoring.allFilled(oppScores, gameMode);

    if (myAllFilled && oppAllFilled) {
      const myTotal = Scoring.totalScore(updatedScores, gameMode, updatedScores.yahtzeeBonus);
      const oppTotal = Scoring.totalScore(oppScores, gameMode, oppScores.yahtzeeBonus);

      if (myTotal > oppTotal) {
        room.winner = playerKey;
      } else if (oppTotal > myTotal) {
        room.winner = oppKey;
      } else {
        room.winner = "tie";
      }
      room.status = "finished";
    }

    // Store transient data for response
    room._transient = { score, yahtzeeBonus, playerKey };

    return room;
  });

  if (!result.committed) {
    throw new functions.https.HttpsError("failed-precondition", "Could not update game state. Try again.");
  }

  const room = result.snapshot.val();
  if (!room || !room._transient) {
    throw new functions.https.HttpsError("failed-precondition", "Invalid game state.");
  }

  const { score, yahtzeeBonus, playerKey } = room._transient;
  const winner = room.winner || null;

  // Clean up transient data
  await roomRef.child("_transient").remove();

  return { score, yahtzeeBonus, gameOver: !!winner && room.status === "finished", winner };
});

// ─── leaveGame ───

exports.leaveGame = regionFn.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  const { roomCode } = data;

  if (!roomCode) throw new functions.https.HttpsError("invalid-argument", "Room code required.");

  const roomRef = db.ref("rooms/" + roomCode);
  const snap = await roomRef.once("value");
  if (!snap.exists()) throw new functions.https.HttpsError("not-found", "Room not found.");

  const room = snap.val();
  const playerKey = findPlayerKey(room.players, uid);
  if (!playerKey) throw new functions.https.HttpsError("permission-denied", "Not a player in this room.");

  if (room.status === "playing") {
    const oppKey = opponentOf(playerKey);
    await roomRef.update({ status: "finished", winner: oppKey });
  }

  return { success: true };
});

// ─── cancelRoom ───

exports.cancelRoom = regionFn.https.onCall(async (data, context) => {
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
  const uid = requireAuth(context);
  const { roomCode } = data;

  if (!roomCode) throw new functions.https.HttpsError("invalid-argument", "Room code required.");

  const roomRef = db.ref("rooms/" + roomCode);
  const snap = await roomRef.once("value");
  if (!snap.exists()) throw new functions.https.HttpsError("not-found", "Room not found.");

  const room = snap.val();
  const playerKey = findPlayerKey(room.players, uid);
  if (!playerKey) throw new functions.https.HttpsError("permission-denied", "Not a player in this room.");
  if (room.status !== "playing") throw new functions.https.HttpsError("failed-precondition", "Game is not in progress.");
  if (room.drawProposal) throw new functions.https.HttpsError("failed-precondition", "A draw proposal is already pending.");

  await roomRef.child("drawProposal").set({
    proposedBy: playerKey,
    timestamp: ServerValue.TIMESTAMP
  });

  return { success: true };
});

// ─── respondToDraw ───

exports.respondToDraw = regionFn.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  const { roomCode, accept } = data;

  if (!roomCode) throw new functions.https.HttpsError("invalid-argument", "Room code required.");

  const roomRef = db.ref("rooms/" + roomCode);
  const snap = await roomRef.once("value");
  if (!snap.exists()) throw new functions.https.HttpsError("not-found", "Room not found.");

  const room = snap.val();
  const playerKey = findPlayerKey(room.players, uid);
  if (!playerKey) throw new functions.https.HttpsError("permission-denied", "Not a player in this room.");
  if (room.status !== "playing") throw new functions.https.HttpsError("failed-precondition", "Game is not in progress.");
  if (!room.drawProposal) throw new functions.https.HttpsError("failed-precondition", "No draw proposal pending.");
  if (room.drawProposal.proposedBy === playerKey) throw new functions.https.HttpsError("failed-precondition", "Cannot respond to own proposal.");

  if (accept) {
    await roomRef.update({ status: "finished", winner: "tie", drawProposal: null });
  } else {
    await roomRef.child("drawProposal").remove();
  }

  return { success: true };
});

// ─── claimDisconnectWin ───

exports.claimDisconnectWin = regionFn.https.onCall(async (data, context) => {
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

exports.saveBotGameResult = regionFn.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  const { gameMode, botDifficulty, myScore, oppScore, result } = data;

  if (gameMode !== "yacht" && gameMode !== "yahtzee") {
    throw new functions.https.HttpsError("invalid-argument", "Invalid game mode.");
  }
  if (botDifficulty !== "basic" && botDifficulty !== "gambler") {
    throw new functions.https.HttpsError("invalid-argument", "Invalid bot difficulty.");
  }
  if (typeof myScore !== "number" || typeof oppScore !== "number") {
    throw new functions.https.HttpsError("invalid-argument", "Invalid scores.");
  }
  if (result !== "win" && result !== "loss" && result !== "tie") {
    throw new functions.https.HttpsError("invalid-argument", "Invalid result.");
  }

  // Score-result consistency check
  if (result === "win" && myScore <= oppScore) {
    throw new functions.https.HttpsError("invalid-argument", "Score does not match result.");
  }
  if (result === "loss" && myScore >= oppScore) {
    throw new functions.https.HttpsError("invalid-argument", "Score does not match result.");
  }
  if (result === "tie" && myScore !== oppScore) {
    throw new functions.https.HttpsError("invalid-argument", "Score does not match result.");
  }

  // Score range validation
  const maxScore = gameMode === "yacht" ? 305 : 1575;
  if (myScore < 0 || myScore > maxScore || oppScore < 0 || oppScore > maxScore) {
    throw new functions.https.HttpsError("invalid-argument", "Score out of range.");
  }

  const userRef = db.ref("users/" + uid);

  // Rate limiting: min 30s between bot game saves
  const lastGameSnap = await userRef.child("lastBotGame").once("value");
  const lastGame = lastGameSnap.val() || 0;
  if (Date.now() - lastGame < 30000) {
    throw new functions.https.HttpsError("resource-exhausted", "Too many requests. Please wait.");
  }
  await userRef.child("lastBotGame").set(ServerValue.TIMESTAMP);

  const profileSnap = await userRef.child("displayName").once("value");
  if (!profileSnap.exists()) return { success: false };

  const botName = botDifficulty === "gambler" ? "Gambler Bot" : "Basic Bot";

  await userRef.child("history").push({
    date: ServerValue.TIMESTAMP,
    mode: gameMode,
    opponentName: botName,
    myScore: myScore,
    oppScore: oppScore,
    result: result,
    roomCode: "BOT"
  });

  await userRef.child("stats").transaction((stats) => {
    if (!stats) stats = { totalGames: 0, wins: 0, losses: 0, ties: 0 };
    stats.totalGames = (stats.totalGames || 0) + 1;
    if (result === "win") {
      stats.wins = (stats.wins || 0) + 1;
      if (!stats.botWins) stats.botWins = {};
      stats.botWins[botDifficulty] = (stats.botWins[botDifficulty] || 0) + 1;
    }
    else if (result === "loss") stats.losses = (stats.losses || 0) + 1;
    else stats.ties = (stats.ties || 0) + 1;
    return stats;
  });

  return { success: true };
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
      const myTotal = Scoring.totalScore(myScores, gameMode, myScores.yahtzeeBonus);
      const oppTotal = Scoring.totalScore(oppScores, gameMode, oppScores.yahtzeeBonus);

      let result;
      if (winner === playerKey) result = "win";
      else if (winner === "tie") result = "tie";
      else result = "loss";

      const userRef = db.ref("users/" + player.uid);
      const profileSnap = await userRef.child("displayName").once("value");
      if (!profileSnap.exists()) return;

      // Use verified displayName from opponent's profile when available
      let oppDisplayName = opponent.name;
      if (opponent.uid) {
        const oppProfileSnap = await db.ref("users/" + opponent.uid + "/displayName").once("value");
        if (oppProfileSnap.exists()) {
          oppDisplayName = oppProfileSnap.val();
        }
      }

      await userRef.child("history").push({
        date: ServerValue.TIMESTAMP,
        mode: gameMode,
        opponentName: oppDisplayName,
        myScore: myTotal,
        oppScore: oppTotal,
        result: result,
        roomCode: roomCode
      });

      await userRef.child("stats").transaction((stats) => {
        if (!stats) stats = { totalGames: 0, wins: 0, losses: 0, ties: 0 };
        stats.totalGames = (stats.totalGames || 0) + 1;
        if (result === "win") stats.wins = (stats.wins || 0) + 1;
        else if (result === "loss") stats.losses = (stats.losses || 0) + 1;
        else stats.ties = (stats.ties || 0) + 1;
        return stats;
      });
    });

    await Promise.all(playerUpdates);

    // Schedule room cleanup
    setTimeout(async () => {
      try {
        await db.ref("rooms/" + roomCode).remove();
      } catch (e) {
        console.error("Failed to cleanup room " + roomCode + ":", e);
      }
    }, 30000);
  });
