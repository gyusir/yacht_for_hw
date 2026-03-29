// Lobby: room creation, joining, and presence management
(function () {
  'use strict';

  window.YachtGame = window.YachtGame || {};

  var db = null;
  var presenceRef = null;
  var presenceCallback = null;
  var lastCleanupTime = 0;

  // Cloud Functions references
  var createRoomFn = null;
  var joinRoomFn = null;
  var updateGameModeFn = null;
  var cancelRoomFn = null;

  function getFunctions() {
    if (!createRoomFn) {
      var fns = window.YachtGame.functions;
      createRoomFn = fns.httpsCallable('createRoom');
      joinRoomFn = fns.httpsCallable('joinRoom');
      updateGameModeFn = fns.httpsCallable('updateGameMode');
      cancelRoomFn = fns.httpsCallable('cancelRoom');
    }
  }

  var STALE_MS = {
    finished: 5 * 60 * 1000,
    waitingDisconnected: 2 * 60 * 1000,
    waitingStale: 30 * 60 * 1000,
    playingAbandoned: 60 * 60 * 1000
  };

  function getDb() {
    if (!db) db = window.YachtGame.db;
    return db;
  }

  function getOrCreateUid() {
    var Auth = window.YachtGame.Auth;
    if (Auth) {
      var firebaseUid = Auth.getPlayerUid();
      if (firebaseUid) {
        sessionStorage.setItem('yacht-uid', firebaseUid);
        return firebaseUid;
      }
    }
    // Guest fallback (should not happen with Anonymous Auth)
    var uid = sessionStorage.getItem('yacht-uid');
    if (!uid) {
      uid = 'uid-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
      sessionStorage.setItem('yacht-uid', uid);
    }
    return uid;
  }

  function createRoom(playerName, gameMode, callback) {
    getFunctions();
    var diceSkin = (window.YachtGame.DiceSkins && window.YachtGame.DiceSkins.getCurrentSkin()) || 'classic';

    createRoomFn({
      playerName: playerName,
      gameMode: gameMode,
      diceSkin: diceSkin
    }).then(function (result) {
      var data = result.data;
      var code = data.roomCode;
      var playerKey = data.playerKey;

      // Set up presence
      var uid = getOrCreateUid();
      setupPresence(code, playerKey, uid);

      // Save session info
      sessionStorage.setItem('yacht-room', code);
      sessionStorage.setItem('yacht-player', playerKey);

      callback({ roomCode: code, playerKey: playerKey });
    }).catch(function (error) {
      callback({ error: error.message || 'Failed to create room.' });
    });
  }

  function joinRoom(playerName, roomCode, callback) {
    getFunctions();
    roomCode = roomCode.toUpperCase().trim();
    var diceSkin = (window.YachtGame.DiceSkins && window.YachtGame.DiceSkins.getCurrentSkin()) || 'classic';

    joinRoomFn({
      roomCode: roomCode,
      playerName: playerName,
      diceSkin: diceSkin
    }).then(function (result) {
      var data = result.data;
      var code = data.roomCode;
      var playerKey = data.playerKey;

      var uid = getOrCreateUid();
      setupPresence(code, playerKey, uid);
      sessionStorage.setItem('yacht-room', code);
      sessionStorage.setItem('yacht-player', playerKey);

      callback({ roomCode: code, playerKey: playerKey, gameMode: data.gameMode });
    }).catch(function (error) {
      callback({ error: error.message || 'Failed to join room.' });
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

    return function cancel() { player2Ref.off(); };
  }

  function tryReconnect(callback) {
    var savedRoomCode = sessionStorage.getItem('yacht-room');
    var playerKey = sessionStorage.getItem('yacht-player');
    var uid = sessionStorage.getItem('yacht-uid');

    if (!savedRoomCode || !playerKey || !uid) {
      callback(null);
      return;
    }

    var database = getDb();
    var roomRef = database.ref('rooms/' + savedRoomCode);

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

      if (room.status === 'finished') {
        clearSession();
        callback(null);
        return;
      }

      // Reconnect: set connected flag
      var connRef = database.ref('rooms/' + savedRoomCode + '/players/' + playerKey + '/connected');
      connRef.set(true);
      setupPresence(savedRoomCode, playerKey, uid);

      callback({
        roomCode: savedRoomCode,
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
    var scores = { _init: true };
    if (gameMode === 'yahtzee') {
      scores.yahtzeeBonus = 0;
    }
    return scores;
  }

  function updateGameMode(roomCode, gameMode) {
    getFunctions();
    updateGameModeFn({ roomCode: roomCode, gameMode: gameMode }).catch(function (error) {
      console.error('updateGameMode error:', error);
    });
  }

  function cancelRoom(roomCode) {
    if (!roomCode) return;
    getFunctions();

    // Stop listening
    var database = getDb();
    database.ref('rooms/' + roomCode + '/players/player2').off();

    cancelRoomFn({ roomCode: roomCode }).catch(function (error) {
      console.error('cancelRoom error:', error);
    });

    cleanupPresence();
    clearSession();
  }

  function findRandomRoom(playerName, callback) {
    getFunctions();
    var diceSkin = (window.YachtGame.DiceSkins && window.YachtGame.DiceSkins.getCurrentSkin()) || 'classic';

    joinRoomFn({
      random: true,
      playerName: playerName,
      diceSkin: diceSkin
    }).then(function (result) {
      var data = result.data;
      var code = data.roomCode;
      var playerKey = data.playerKey;

      var uid = getOrCreateUid();
      setupPresence(code, playerKey, uid);
      sessionStorage.setItem('yacht-room', code);
      sessionStorage.setItem('yacht-player', playerKey);

      callback({ roomCode: code, playerKey: playerKey, gameMode: data.gameMode });
    }).catch(function (error) {
      callback({ error: error.message || 'No rooms available. Create one!' });
    });
  }

  function cleanupStaleRooms() {
    // Room cleanup is now handled by server-side onGameFinished trigger
    // This function is kept as a no-op for backward compatibility
  }

  window.YachtGame.Lobby = {
    getOrCreateUid: getOrCreateUid,
    createRoom: createRoom,
    joinRoom: joinRoom,
    findRandomRoom: findRandomRoom,
    cleanupStaleRooms: cleanupStaleRooms,
    listenForOpponent: listenForOpponent,
    tryReconnect: tryReconnect,
    clearSession: clearSession,
    cancelRoom: cancelRoom,
    buildEmptyScores: buildEmptyScores,
    updateGameMode: updateGameMode
  };
})();
