// Lobby: room creation, joining, and presence management
(function () {
  'use strict';

  window.YachtGame = window.YachtGame || {};

  var db = null;
  var presenceRef = null;
  var presenceCallback = null;

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
    // Use Firebase Auth uid if signed in
    var Auth = window.YachtGame.Auth;
    if (Auth && Auth.isSignedIn()) {
      var firebaseUid = Auth.getPlayerUid();
      sessionStorage.setItem('yacht-uid', firebaseUid);
      return firebaseUid;
    }
    // Guest fallback
    var uid = sessionStorage.getItem('yacht-uid');
    if (!uid) {
      uid = generateUid();
      sessionStorage.setItem('yacht-uid', uid);
    }
    return uid;
  }

  function createRoom(playerName, gameMode, callback, _retries) {
    _retries = _retries || 0;
    if (_retries >= 3) {
      callback({ error: 'Failed to create room. Please try again.' });
      return;
    }

    var database = getDb();
    var code = generateRoomCode();
    var roomRef = database.ref('rooms/' + code);

    // Check if room exists
    roomRef.once('value', function (snapshot) {
      if (snapshot.exists()) {
        // Rare collision, retry with limit
        createRoom(playerName, gameMode, callback, _retries + 1);
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
            scores: buildEmptyScores(gameMode),
            diceSkin: (window.YachtGame.DiceSkins && window.YachtGame.DiceSkins.getCurrentSkin()) || 'classic'
          }
        },
        winner: ''
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
      var updates = {};
      updates['players/player2'] = {
        name: playerName,
        uid: uid,
        connected: true,
        scores: buildEmptyScores(room.gameMode),
        diceSkin: (window.YachtGame.DiceSkins && window.YachtGame.DiceSkins.getCurrentSkin()) || 'classic'
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
        callback({ roomCode: roomCode, playerKey: 'player2', gameMode: room.gameMode });
      });
    });
  }

  function setupPresence(roomCode, playerKey, uid) {
    cleanupPresence();

    var database = getDb();
    var connRef = database.ref('rooms/' + roomCode + '/players/' + playerKey + '/connected');
    presenceRef = database.ref('.info/connected');
    presenceCallback = presenceRef.on('value', function (snap) {
      if (snap.val() === true) {
        connRef.onDisconnect().set(false);
        connRef.set(true);
      }
    });
  }

  function cleanupPresence() {
    if (presenceRef && presenceCallback) {
      presenceRef.off('value', presenceCallback);
    }
    presenceRef = null;
    presenceCallback = null;
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
    cleanupPresence();
    sessionStorage.removeItem('yacht-room');
    sessionStorage.removeItem('yacht-player');
  }

  function buildEmptyScores(gameMode) {
    // Note: Firebase strips null values, so unfilled categories simply won't exist.
    // We use an _init flag to ensure the scores object itself persists in Firebase.
    var scores = { _init: true };
    if (gameMode === 'yahtzee') {
      scores.yahtzeeBonus = 0;
    }
    return scores;
  }

  function updateGameMode(roomCode, gameMode) {
    var database = getDb();
    database.ref('rooms/' + roomCode + '/gameMode').set(gameMode);
  }

  function cancelRoom(roomCode) {
    if (!roomCode) return;
    var database = getDb();
    // Remove the room and stop listening
    database.ref('rooms/' + roomCode + '/players/player2').off();
    database.ref('rooms/' + roomCode).remove();
    cleanupPresence();
    clearSession();
  }

  window.YachtGame.Lobby = {
    generateRoomCode: generateRoomCode,
    getOrCreateUid: getOrCreateUid,
    createRoom: createRoom,
    joinRoom: joinRoom,
    listenForOpponent: listenForOpponent,
    tryReconnect: tryReconnect,
    clearSession: clearSession,
    cancelRoom: cancelRoom,
    buildEmptyScores: buildEmptyScores,
    updateGameMode: updateGameMode
  };
})();
