// Lobby: room creation, joining, and presence management
(function () {
  'use strict';

  window.YachtGame = window.YachtGame || {};

  var db = null;

  function getDb() {
    if (!db) db = window.YachtGame.db;
    return db;
  }

  function generateRoomCode() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1 to avoid confusion
    var code = '';
    for (var i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  function generateUid() {
    if (window.crypto && window.crypto.randomUUID) {
      return crypto.randomUUID();
    }
    // Fallback
    return 'uid-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }

  function getOrCreateUid() {
    var uid = sessionStorage.getItem('yacht-uid');
    if (!uid) {
      uid = generateUid();
      sessionStorage.setItem('yacht-uid', uid);
    }
    return uid;
  }

  function createRoom(playerName, gameMode, callback) {
    var database = getDb();
    var code = generateRoomCode();
    var roomRef = database.ref('rooms/' + code);

    // Check if room exists
    roomRef.once('value', function (snapshot) {
      if (snapshot.exists()) {
        // Rare collision, try again
        createRoom(playerName, gameMode, callback);
        return;
      }

      var uid = getOrCreateUid();
      var roomData = {
        gameMode: gameMode,
        status: 'waiting',
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        currentTurn: 'player1',
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
            scores: buildEmptyScores(gameMode)
          }
        },
        winner: null
      };

      roomRef.set(roomData, function (error) {
        if (error) {
          callback({ error: 'Failed to create room.' });
          return;
        }

        // Set up presence
        setupPresence(code, 'player1', uid);

        // Save session info
        sessionStorage.setItem('yacht-room', code);
        sessionStorage.setItem('yacht-player', 'player1');

        callback({ roomCode: code, playerKey: 'player1' });
      });
    });
  }

  function joinRoom(playerName, roomCode, callback) {
    var database = getDb();
    roomCode = roomCode.toUpperCase().trim();
    var roomRef = database.ref('rooms/' + roomCode);

    roomRef.once('value', function (snapshot) {
      if (!snapshot.exists()) {
        callback({ error: 'Room not found.' });
        return;
      }

      var room = snapshot.val();

      if (room.status !== 'waiting') {
        callback({ error: 'Room is already in a game.' });
        return;
      }

      if (room.players && room.players.player2) {
        callback({ error: 'Room is full.' });
        return;
      }

      var uid = getOrCreateUid();
      var gameMode = room.gameMode;

      var updates = {};
      updates['players/player2'] = {
        name: playerName,
        uid: uid,
        connected: true,
        scores: buildEmptyScores(gameMode)
      };
      updates['status'] = 'playing';

      roomRef.update(updates, function (error) {
        if (error) {
          callback({ error: 'Failed to join room.' });
          return;
        }

        setupPresence(roomCode, 'player2', uid);

        sessionStorage.setItem('yacht-room', roomCode);
        sessionStorage.setItem('yacht-player', 'player2');

        callback({ roomCode: roomCode, playerKey: 'player2', gameMode: gameMode });
      });
    });
  }

  function setupPresence(roomCode, playerKey, uid) {
    var database = getDb();
    var connRef = database.ref('rooms/' + roomCode + '/players/' + playerKey + '/connected');
    var connectedRef = database.ref('.info/connected');

    connectedRef.on('value', function (snap) {
      if (snap.val() === true) {
        connRef.onDisconnect().set(false);
        connRef.set(true);
      }
    });
  }

  function listenForOpponent(roomCode, callback) {
    var database = getDb();
    var player2Ref = database.ref('rooms/' + roomCode + '/players/player2');

    player2Ref.on('value', function (snapshot) {
      if (snapshot.exists()) {
        player2Ref.off();
        callback(snapshot.val());
      }
    });
  }

  function tryReconnect(callback) {
    var roomCode = sessionStorage.getItem('yacht-room');
    var playerKey = sessionStorage.getItem('yacht-player');
    var uid = sessionStorage.getItem('yacht-uid');

    if (!roomCode || !playerKey || !uid) {
      callback(null);
      return;
    }

    var database = getDb();
    var roomRef = database.ref('rooms/' + roomCode);

    roomRef.once('value', function (snapshot) {
      if (!snapshot.exists()) {
        clearSession();
        callback(null);
        return;
      }

      var room = snapshot.val();
      var player = room.players && room.players[playerKey];

      if (!player || player.uid !== uid) {
        clearSession();
        callback(null);
        return;
      }

      // Reconnect: set connected flag
      var connRef = database.ref('rooms/' + roomCode + '/players/' + playerKey + '/connected');
      connRef.set(true);
      setupPresence(roomCode, playerKey, uid);

      callback({
        roomCode: roomCode,
        playerKey: playerKey,
        gameMode: room.gameMode,
        status: room.status
      });
    });
  }

  function clearSession() {
    sessionStorage.removeItem('yacht-room');
    sessionStorage.removeItem('yacht-player');
  }

  function buildEmptyScores(gameMode) {
    var Scoring = window.YachtGame.Scoring;
    var categories = Scoring.getCategories(gameMode);
    var scores = {};
    for (var i = 0; i < categories.length; i++) {
      scores[categories[i]] = null;
    }
    if (gameMode === 'yahtzee') {
      scores.yahtzeeBonus = 0;
    }
    return scores;
  }

  function updateGameMode(roomCode, gameMode) {
    var database = getDb();
    database.ref('rooms/' + roomCode + '/gameMode').set(gameMode);
  }

  window.YachtGame.Lobby = {
    generateRoomCode: generateRoomCode,
    getOrCreateUid: getOrCreateUid,
    createRoom: createRoom,
    joinRoom: joinRoom,
    listenForOpponent: listenForOpponent,
    tryReconnect: tryReconnect,
    clearSession: clearSession,
    buildEmptyScores: buildEmptyScores,
    updateGameMode: updateGameMode
  };
})();
