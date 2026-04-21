// Lobby: room creation, joining, and presence management
(function () {
  'use strict';

  window.YachtGame = window.YachtGame || {};

  var db = null;
  var presenceRef = null;

  // Map server error messages to i18n keys
  var ERROR_MAP = {
    'Room not found.': 'toast_room_not_found',
    'Room is full.': 'toast_room_full',
    'Room is already in a game.': 'toast_room_in_game',
    'Too many requests. Please wait.': 'toast_rate_limit'
  };

  function translateError(msg, fallbackKey) {
    var I18n = window.YachtGame.I18n;
    if (!I18n) return msg;
    var key = ERROR_MAP[msg];
    if (key) return I18n.t(key);
    if (fallbackKey) return I18n.t(fallbackKey);
    return msg;
  }
  var presenceCallback = null;
  var lastCleanupTime = 0;

  // Cloud Functions references
  var createRoomFn = null;
  var joinRoomFn = null;
  var findOrCreateRandomRoomFn = null;
  var updateGameModeFn = null;
  var cancelRoomFn = null;

  function getFunctions() {
    if (!createRoomFn) {
      var fns = window.YachtGame.functions;
      createRoomFn = fns.httpsCallable('createRoom');
      joinRoomFn = fns.httpsCallable('joinRoom');
      findOrCreateRandomRoomFn = fns.httpsCallable('findOrCreateRandomRoom');
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

    var nicks = (window.YachtGame.Auth && window.YachtGame.Auth.getNicknames()) || null;
    createRoomFn({
      playerName: playerName,
      gameMode: gameMode,
      diceSkin: diceSkin,
      nicknameKo: nicks ? nicks.ko : null,
      nicknameEn: nicks ? nicks.en : null
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
      localStorage.setItem('yacht-active-session', code + ':' + Date.now());

      callback({ roomCode: code, playerKey: playerKey });
    }).catch(function (error) {
      callback({ error: translateError(error.message, 'toast_create_failed') });
    });
  }

  function joinRoom(playerName, roomCode, callback) {
    getFunctions();
    roomCode = roomCode.toUpperCase().trim();
    var diceSkin = (window.YachtGame.DiceSkins && window.YachtGame.DiceSkins.getCurrentSkin()) || 'classic';

    var nicks = (window.YachtGame.Auth && window.YachtGame.Auth.getNicknames()) || null;
    joinRoomFn({
      roomCode: roomCode,
      playerName: playerName,
      diceSkin: diceSkin,
      nicknameKo: nicks ? nicks.ko : null,
      nicknameEn: nicks ? nicks.en : null
    }).then(function (result) {
      var data = result.data;
      var code = data.roomCode;
      var playerKey = data.playerKey;

      var uid = getOrCreateUid();
      setupPresence(code, playerKey, uid);
      sessionStorage.setItem('yacht-room', code);
      sessionStorage.setItem('yacht-player', playerKey);
      localStorage.setItem('yacht-active-session', code + ':' + Date.now());

      callback({ roomCode: code, playerKey: playerKey, gameMode: data.gameMode });
    }).catch(function (error) {
      callback({ error: translateError(error.message, 'toast_join_failed') });
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

    function onPlayer2Value(snapshot) {
      if (snapshot.exists()) {
        player2Ref.off('value', onPlayer2Value);
        callback(snapshot.val());
      }
    }

    player2Ref.on('value', onPlayer2Value);

    return function cancel() { player2Ref.off('value', onPlayer2Value); };
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
        status: room.status,
        roomType: room.type || 'private'
      });
    }, function (error) {
      console.error('tryReconnect error:', error);
      clearSession();
      callback(null);
    });
  }

  function clearSession() {
    cleanupPresence();
    sessionStorage.removeItem('yacht-room');
    sessionStorage.removeItem('yacht-player');
    localStorage.removeItem('yacht-active-session');
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
      var I18n = window.YachtGame.I18n;
      window.YachtGame.UI.showToast(I18n ? I18n.t('mode_change_failed') : 'Failed to change game mode.');
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
      var I18n = window.YachtGame.I18n;
      window.YachtGame.UI.showToast(I18n ? I18n.t('cancel_room_failed') : 'Failed to cancel room.');
    });

    cleanupPresence();
    clearSession();
  }

  function findRandomRoom(playerName, gameMode, callback) {
    getFunctions();
    var diceSkin = (window.YachtGame.DiceSkins && window.YachtGame.DiceSkins.getCurrentSkin()) || 'classic';

    var nicks = (window.YachtGame.Auth && window.YachtGame.Auth.getNicknames()) || null;
    findOrCreateRandomRoomFn({
      playerName: playerName,
      gameMode: gameMode || 'yahtzee',
      diceSkin: diceSkin,
      nicknameKo: nicks ? nicks.ko : null,
      nicknameEn: nicks ? nicks.en : null
    }).then(function (result) {
      var data = result.data;
      var code = data.roomCode;
      var playerKey = data.playerKey;

      var uid = getOrCreateUid();
      setupPresence(code, playerKey, uid);
      sessionStorage.setItem('yacht-room', code);
      sessionStorage.setItem('yacht-player', playerKey);
      localStorage.setItem('yacht-active-session', code + ':' + Date.now());

      callback({
        roomCode: code,
        playerKey: playerKey,
        gameMode: data.gameMode,
        matched: data.matched
      });
    }).catch(function (error) {
      callback({ error: translateError(error.message, 'toast_random_failed') });
    });
  }

  function cleanupStaleRooms() {
    // Room cleanup is now handled by server-side onGameFinished trigger
    // This function is kept as a no-op for backward compatibility
  }

  function buildShareLink(roomCode) {
    var loc = window.location;
    return loc.origin + loc.pathname + '?room=' + encodeURIComponent(roomCode);
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
    updateGameMode: updateGameMode,
    buildShareLink: buildShareLink
  };
})();
