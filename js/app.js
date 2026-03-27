// App entry point: wires all modules together
(function () {
  'use strict';

  var UI = window.YachtGame.UI;
  var Lobby = window.YachtGame.Lobby;
  var Game = window.YachtGame.Game;
  var Dice = window.YachtGame.Dice;
  var Auth = window.YachtGame.Auth;
  var History = window.YachtGame.History;
  var DiceSkins = window.YachtGame.DiceSkins;

  // Initialize theme
  UI.initTheme();

  // Initialize dice skin from cache
  DiceSkins.loadSkin();

  // --- Warn before closing tab during active game ---
  window.addEventListener('beforeunload', function (e) {
    if (document.body.classList.contains('in-game')) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // --- DOM Elements ---
  var themeToggle = document.getElementById('theme-toggle');
  var btnGoogleSignin = document.getElementById('btn-google-signin');
  var nameInput = document.getElementById('player-name');
  var btnGuest = document.getElementById('btn-guest');
  var signedInProfile = document.getElementById('signed-in-profile');
  var userAvatar = document.getElementById('user-avatar');
  var userDisplayName = document.getElementById('user-display-name');
  var btnSignout = document.getElementById('btn-signout');
  var btnContinueSigned = document.getElementById('btn-continue-signed');
  var btnCreate = document.getElementById('btn-create');
  var roomCodeInput = document.getElementById('room-code-input');
  var btnJoin = document.getElementById('btn-join');
  var lobbyError = document.getElementById('lobby-error');
  var displayRoomCode = document.getElementById('display-room-code');
  var btnCopyCode = document.getElementById('btn-copy-code');
  var btnRoll = document.getElementById('btn-roll');
  var btnNewGame = document.getElementById('btn-new-game');
  var modeRadios = document.querySelectorAll('input[name="mode"]');
  var btnRule = document.getElementById('btn-rule');
  var btnLeave = document.getElementById('btn-leave');
  var btnMyStats = document.getElementById('btn-my-stats');
  var btnBackLobby = document.getElementById('btn-back-lobby');
  var btnBackLogin = document.getElementById('btn-back-login');
  var btnBackLobbyWaiting = document.getElementById('btn-back-lobby-waiting');
  var btnRandomJoin = document.getElementById('btn-random-join');

  var playerName = '';
  var currentWaitingRoomCode = null;

  // --- Theme Toggle ---
  themeToggle.addEventListener('click', function () {
    UI.toggleTheme();
  });

  // --- Auth: show/hide login UI based on auth state ---
  function showLoginScreen(user) {
    if (user) {
      // User is signed in
      btnGoogleSignin.hidden = true;
      document.querySelector('.guest-section').hidden = true;
      document.querySelector('#screen-login .divider').hidden = true;
      signedInProfile.hidden = false;
      userDisplayName.textContent = user.displayName || 'Player';
      if (user.photoURL) {
        userAvatar.src = user.photoURL;
        userAvatar.hidden = false;
      } else {
        userAvatar.hidden = true;
      }
    } else {
      // Not signed in
      btnGoogleSignin.hidden = false;
      document.querySelector('.guest-section').hidden = false;
      document.querySelector('#screen-login .divider').hidden = false;
      signedInProfile.hidden = true;
    }
  }

  var skinSelector = document.getElementById('skin-selector');
  var skinOptions = document.getElementById('skin-options');

  function refreshSkinSelector() {
    if (!Auth.isSignedIn()) {
      if (skinSelector) skinSelector.hidden = true;
      return;
    }
    var uid = Auth.getPlayerUid();
    History.loadStats(uid, function (stats) {
      var totalGames = (stats && stats.totalGames) || 0;
      if (skinSelector) skinSelector.hidden = false;
      DiceSkins.renderSkinSelector(skinOptions, totalGames);
    });
  }

  // Listen for auth state changes
  Auth.onAuthStateChanged(function (user) {
    showLoginScreen(user);
    // Show My Stats button in lobby if signed in
    if (btnMyStats) {
      btnMyStats.hidden = !user;
    }
    if (user) {
      DiceSkins.loadSkin();
      refreshSkinSelector();
    } else {
      if (skinSelector) skinSelector.hidden = true;
      DiceSkins.applySkin('classic');
    }
  });

  // Google Sign-In
  btnGoogleSignin.addEventListener('click', function () {
    btnGoogleSignin.disabled = true;
    Auth.signInWithGoogle(function (error, user) {
      btnGoogleSignin.disabled = false;
      if (error) {
        UI.showToast('Sign-in failed: ' + (error.message || 'Unknown error'));
      }
    });
  });

  // Sign Out
  btnSignout.addEventListener('click', function () {
    Auth.signOut(function () {
      UI.showScreen('screen-login');
      UI.showToast('Signed out');
    });
  });

  // Continue (signed in)
  btnContinueSigned.addEventListener('click', function () {
    playerName = Auth.getPlayerName();
    UI.showScreen('screen-lobby');
    refreshSkinSelector();
    Lobby.cleanupStaleRooms();
  });

  // --- Guest Flow ---
  nameInput.addEventListener('input', function () {
    btnGuest.disabled = nameInput.value.trim().length === 0;
  });

  nameInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && nameInput.value.trim().length > 0) {
      btnGuest.click();
    }
  });

  btnGuest.addEventListener('click', function () {
    playerName = nameInput.value.trim();
    if (!playerName) return;
    Auth.setGuest(playerName);
    DiceSkins.applySkin('classic');
    UI.showScreen('screen-lobby');
    Lobby.cleanupStaleRooms();
  });

  // --- Lobby Screen ---
  // Mode radio listeners (registered once, use currentWaitingRoomCode)
  for (var i = 0; i < modeRadios.length; i++) {
    modeRadios[i].addEventListener('change', function () {
      if (currentWaitingRoomCode) {
        Lobby.updateGameMode(currentWaitingRoomCode, this.value);
      }
    });
  }

  roomCodeInput.addEventListener('input', function () {
    btnJoin.disabled = roomCodeInput.value.trim().length < 6;
  });

  roomCodeInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && roomCodeInput.value.trim().length >= 6) {
      btnJoin.click();
    }
  });

  btnCreate.addEventListener('click', function () {
    btnCreate.disabled = true;
    lobbyError.hidden = true;

    var gameMode = 'yacht';
    for (var i = 0; i < modeRadios.length; i++) {
      if (modeRadios[i].checked) gameMode = modeRadios[i].value;
    }

    Lobby.createRoom(playerName, gameMode, function (result) {
      btnCreate.disabled = false;
      if (result.error) {
        lobbyError.textContent = result.error;
        lobbyError.hidden = false;
        return;
      }

      displayRoomCode.textContent = result.roomCode;
      currentWaitingRoomCode = result.roomCode;
      UI.showScreen('screen-waiting');

      // Wait for opponent
      Lobby.listenForOpponent(result.roomCode, function (player2) {
        UI.showToast(player2.name + ' joined!');
        Game.init(result.roomCode, result.playerKey);
      });
    });
  });

  btnJoin.addEventListener('click', function () {
    var code = roomCodeInput.value.trim();
    if (code.length < 6) return;

    btnJoin.disabled = true;
    lobbyError.hidden = true;

    Lobby.joinRoom(playerName, code, function (result) {
      btnJoin.disabled = false;
      if (result.error) {
        lobbyError.textContent = result.error;
        lobbyError.hidden = false;
        return;
      }

      UI.showToast('Joined room ' + result.roomCode);
      Game.init(result.roomCode, result.playerKey);
    });
  });

  // --- Quick Match (Random Join) ---
  btnRandomJoin.addEventListener('click', function () {
    btnRandomJoin.disabled = true;
    lobbyError.hidden = true;

    Lobby.findRandomRoom(playerName, function (result) {
      btnRandomJoin.disabled = false;
      if (result.error) {
        lobbyError.textContent = result.error;
        lobbyError.hidden = false;
        return;
      }
      UI.showToast('Joined room ' + result.roomCode);
      Game.init(result.roomCode, result.playerKey);
    });
  });

  // --- Copy Room Code ---
  btnCopyCode.addEventListener('click', function () {
    var code = displayRoomCode.textContent;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(code).then(function () {
        UI.showToast('Code copied!');
      });
    } else {
      var textArea = document.createElement('textarea');
      textArea.value = code;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      UI.showToast('Code copied!');
    }
  });

  // --- Rule & Leave Buttons ---
  btnRule.addEventListener('mouseenter', function () {
    var mode = Game.getGameMode();
    if (mode) UI.showRulesOverlay(mode);
  });

  btnRule.addEventListener('mouseleave', function () {
    UI.hideRulesOverlay();
  });

  btnLeave.addEventListener('click', function () {
    if (confirm('정말 나가시겠습니까? 상대방의 승리로 처리됩니다.')) {
      Game.leaveGame();
    }
  });

  // --- My Stats ---
  btnMyStats.addEventListener('click', function () {
    var uid = Auth.getPlayerUid();
    if (!uid) return;

    History.loadStats(uid, function (stats) {
      History.loadHistory(uid, 20, function (games) {
        UI.renderHistory(stats, games);
        UI.showScreen('screen-history');
      });
    });
  });

  btnBackLobby.addEventListener('click', function () {
    UI.showScreen('screen-lobby');
  });

  btnBackLogin.addEventListener('click', function () {
    UI.showScreen('screen-login');
  });

  btnBackLobbyWaiting.addEventListener('click', function () {
    var code = displayRoomCode.textContent;
    Lobby.cancelRoom(code);
    UI.showScreen('screen-lobby');
  });

  // --- Emote System ---
  var QUICK_EMOTES = [
    { emoji: '😎', msg: '😎 gg ez' },
    { emoji: '🤔', msg: '🤔 Hmm...' },
    { emoji: '😭', msg: '😭 봐줘요...' },
    { emoji: '😏', msg: '😏 그게 최선?' },
    { emoji: '👑', msg: '👑 왕이 납신다' },
    { emoji: '🐢', msg: '🐢 좀 빨리~' }
  ];

  var EMOTES = [
    '😎 gg ez',
    '🥱 하품 나온다~',
    '🔥 실화냐?',
    '😏 그게 최선?',
    '💀 RIP',
    '🤡 어이없네ㅋㅋ',
    '🍀 운 좋았을 뿐~',
    '😱 헐 대박',
    '🐢 좀 빨리~',
    '👋 Nice try!',
    '🎯 계획대로',
    '😭 봐줘요...',
    '🧊 쿨하게 가자',
    '💩 이게 뭐야',
    '👑 왕이 납신다',
    '🤔 Hmm...'
  ];

  var emoteToggle = document.getElementById('btn-emote-toggle');
  var emotePicker = document.getElementById('emote-picker');
  var emoteQuick = document.getElementById('emote-quick');
  var emoteCooldown = false;

  function sendEmoteWithCooldown(msg) {
    if (emoteCooldown) return;
    Game.sendEmote(msg);
    emotePicker.classList.add('hidden');
    emoteCooldown = true;
    setTimeout(function () { emoteCooldown = false; }, 2000);
  }

  // Build quick emote buttons
  for (var i = 0; i < QUICK_EMOTES.length; i++) {
    (function (item) {
      var btn = document.createElement('button');
      btn.className = 'emote-quick-btn';
      btn.textContent = item.emoji;
      btn.addEventListener('click', function () {
        sendEmoteWithCooldown(item.msg);
      });
      emoteQuick.appendChild(btn);
    })(QUICK_EMOTES[i]);
  }

  // Build full emote picker
  for (var i = 0; i < EMOTES.length; i++) {
    (function (msg) {
      var btn = document.createElement('button');
      btn.className = 'emote-btn';
      btn.textContent = msg;
      btn.addEventListener('click', function () {
        sendEmoteWithCooldown(msg);
      });
      emotePicker.appendChild(btn);
    })(EMOTES[i]);
  }

  emoteToggle.addEventListener('click', function () {
    emotePicker.classList.toggle('hidden');
  });

  // Close picker when clicking outside
  document.addEventListener('click', function (e) {
    if (!emoteToggle.contains(e.target) && !emotePicker.contains(e.target)) {
      emotePicker.classList.add('hidden');
    }
  });

  // --- Game Screen ---
  btnRoll.addEventListener('click', function () {
    Game.rollDice();
  });

  // Dice click handlers
  var dieEls = document.querySelectorAll('.die');
  for (var i = 0; i < dieEls.length; i++) {
    (function (index) {
      dieEls[index].addEventListener('click', function () {
        if (!this.classList.contains('disabled')) {
          Game.toggleHold(index);
        }
      });
    })(i);
  }

  // --- Game Over ---
  btnNewGame.addEventListener('click', function () {
    Game.destroy();
    Lobby.clearSession();
    UI.showScreen('screen-lobby');
    lobbyError.hidden = true;
    refreshSkinSelector();
    Lobby.cleanupStaleRooms();
  });

  // --- Reconnection on page load ---
  Lobby.tryReconnect(function (session) {
    if (session && session.status === 'playing') {
      playerName = Auth.isSignedIn() ? Auth.getPlayerName() : 'Reconnected';
      Game.init(session.roomCode, session.playerKey);
      UI.showToast('Reconnected to game!');
    } else if (session && session.status === 'waiting') {
      displayRoomCode.textContent = session.roomCode;
      UI.showScreen('screen-waiting');
      Lobby.listenForOpponent(session.roomCode, function (player2) {
        UI.showToast(player2.name + ' joined!');
        Game.init(session.roomCode, session.playerKey);
      });
    }
  });
})();
