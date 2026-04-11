// App entry point: wires all modules together
(function () {
  'use strict';

  var DEFAULT_AVATAR = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="#a0b4f0"/><circle cx="32" cy="42" r="6" fill="#fff"/><circle cx="68" cy="42" r="6" fill="#fff"/><circle cx="32" cy="42" r="3" fill="#222"/><circle cx="68" cy="42" r="3" fill="#222"/><path d="M35 62 Q50 74 65 62" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="50" cy="18" r="4" fill="#fff" opacity="0.5"/><circle cx="82" cy="50" r="4" fill="#fff" opacity="0.5"/><circle cx="18" cy="50" r="4" fill="#fff" opacity="0.5"/></svg>');

  var UI = window.YachtGame.UI;
  var Lobby = window.YachtGame.Lobby;
  var Game = window.YachtGame.Game;
  var Dice = window.YachtGame.Dice;
  var Auth = window.YachtGame.Auth;
  var History = window.YachtGame.History;
  var DiceSkins = window.YachtGame.DiceSkins;

  var TIP_COUNT = 15;
  function showRandomTip() {
    var tipEl = document.getElementById('waiting-tip');
    if (!tipEl) return;
    var I18n = window.YachtGame.I18n;
    if (!I18n) return;
    var idx = tipEl.getAttribute('data-tip-idx');
    if (!idx) {
      idx = Math.floor(Math.random() * TIP_COUNT) + 1;
      tipEl.setAttribute('data-tip-idx', idx);
    }
    tipEl.textContent = I18n.t('tip_label') + ' ' + I18n.t('tip_' + idx);
  }
  function resetRandomTip() {
    var tipEl = document.getElementById('waiting-tip');
    if (tipEl) tipEl.removeAttribute('data-tip-idx');
    showRandomTip();
  }

  // Initialize theme
  UI.initTheme();

  // Initialize language
  var I18n = window.YachtGame.I18n;
  if (I18n) I18n.refreshStaticText();

  // Initialize dice skin from cache
  DiceSkins.loadSkin();

  // --- Detect duplicate tab sessions ---
  window.addEventListener('storage', function (e) {
    if (e.key === 'yacht-active-session' && e.newValue && document.body.classList.contains('in-game')) {
      UI.showToast(I18n ? I18n.t('toast_duplicate_tab') : 'New game started in another tab.');
      if (window.YachtGame.Game && window.YachtGame.Game.destroy) {
        window.YachtGame.Game.destroy();
      }
      Lobby.clearSession();
      UI.showScreen('screen-lobby');
    }
  });

  // --- Cache ID token for sendBeacon usage ---
  firebase.auth().onAuthStateChanged(function (user) {
    if (user) {
      user.getIdToken().then(function (token) {
        window.YachtGame._cachedIdToken = token;
      });
    } else {
      window.YachtGame._cachedIdToken = null;
    }
  });
  // Refresh token every 50 minutes (tokens expire after 1 hour)
  setInterval(function () {
    var user = firebase.auth().currentUser;
    if (user) {
      user.getIdToken(true).then(function (token) {
        window.YachtGame._cachedIdToken = token;
      });
    }
  }, 3000000);

  // --- Cache App Check token for sendBeacon usage ---
  if (!window.YachtGame.isEmulator) {
    firebase.appCheck().getToken(false).then(function (result) {
      window.YachtGame._cachedAppCheckToken = result.token;
    }).catch(function () {
      window.YachtGame._cachedAppCheckToken = null;
    });
    setInterval(function () {
      firebase.appCheck().getToken(true).then(function (result) {
        window.YachtGame._cachedAppCheckToken = result.token;
      }).catch(function () {});
    }, 3000000);
  }

  // --- Warn before closing tab during active game ---
  window.addEventListener('beforeunload', function (e) {
    if (document.body.classList.contains('in-game')) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // --- Save bot game result as loss when actually leaving ---
  window.addEventListener('pagehide', function () {
    if (document.body.classList.contains('in-game')) {
      if (window.YachtGame._isBotGame && window.YachtGame.BotGame && window.YachtGame.BotGame.saveResultBeacon) {
        window.YachtGame.BotGame.saveResultBeacon();
      }
      if (window.YachtGame.Game && window.YachtGame.Game.destroy) {
        window.YachtGame.Game.destroy();
      }
    }
  });

  // --- DOM Elements ---
  var themeToggle = document.getElementById('theme-toggle');
  var btnGoogleSignin = document.getElementById('btn-google-signin');
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
  var btnFastMode = document.getElementById('btn-fast-mode');
  var btnShortcut = document.getElementById('btn-shortcut');
  var btnRule = document.getElementById('btn-rule');
  var btnLeave = document.getElementById('btn-leave');
  var btnMyStats = document.getElementById('btn-my-stats');
  var btnBackLobby = document.getElementById('btn-back-lobby');
  var btnBackLogin = document.getElementById('btn-back-login');
  var btnBackLobbyWaiting = document.getElementById('btn-back-lobby-waiting');
  var btnRandomJoin = document.getElementById('btn-random-join');
  var btnBotPlay = document.getElementById('btn-bot-play');
  var btnBotStart = document.getElementById('btn-bot-start');
  var btnBackLobbyBot = document.getElementById('btn-back-lobby-bot');
  var btnDraw = document.getElementById('btn-draw');
  var btnAcceptDraw = document.getElementById('btn-accept-draw');
  var btnDeclineDraw = document.getElementById('btn-decline-draw');
  var btnTutorialLogin = document.getElementById('btn-tutorial-login');
  var btnTutorialLobby = document.getElementById('btn-tutorial-lobby');
  var tutorialNext = document.getElementById('tutorial-next');
  var tutorialSkip = document.getElementById('tutorial-skip');

  var playerName = '';
  var currentWaitingRoomCode = null;
  var lobbyNicknameEl = document.getElementById('lobby-nickname');
  var statsNicknameEl = document.getElementById('stats-nickname');

  function updateScreenNicknames() {
    var nick = Auth.getNickname();
    if (lobbyNicknameEl) {
      if (nick && I18n) {
        var b = document.createElement('strong');
        b.textContent = nick;
        if (I18n.getLang() === 'ko') {
          lobbyNicknameEl.textContent = '';
          lobbyNicknameEl.appendChild(b);
          lobbyNicknameEl.appendChild(document.createTextNode('\ub2d8, \uc548\ub155\ud558\uc138\uc694.'));
        } else {
          lobbyNicknameEl.textContent = 'Hello, ';
          lobbyNicknameEl.appendChild(b);
        }
      } else {
        lobbyNicknameEl.textContent = nick || '';
      }
    }
    if (statsNicknameEl) statsNicknameEl.textContent = nick || '';
  }
  var cancelOpponentListener = null;

  // --- Theme Toggle ---
  themeToggle.addEventListener('click', function () {
    UI.toggleTheme();
  });

  // --- Language Toggle ---
  var langToggle = document.getElementById('lang-toggle');
  function updateLangButton() {
    if (I18n) langToggle.textContent = I18n.getLang() === 'ko' ? 'KO' : 'EN';
  }
  updateLangButton();
  langToggle.addEventListener('click', function () {
    if (!I18n) return;
    var newLang = I18n.getLang() === 'ko' ? 'en' : 'ko';
    I18n.setLang(newLang);
    I18n.refreshStaticText();
    updateLangButton();
    // Update nickname display for new language
    if (Auth.getNickname()) {
      playerName = Auth.getPlayerName();
      if (Auth.isSignedIn()) {
        var user = window.YachtGame.auth.currentUser;
        var displayText = (user && user.displayName) || 'Player';
        displayText += ' (' + Auth.getNickname() + ')';
        userDisplayName.textContent = displayText;
      }
    }
    updateScreenNicknames();
    var gameScreen = document.getElementById('screen-game');
    var gameoverScreen = document.getElementById('screen-gameover');
    var isInGame = (gameScreen && gameScreen.classList.contains('active')) || (gameoverScreen && gameoverScreen.classList.contains('active'));
    if (isInGame && window.YachtGame.Game && window.YachtGame.Game.refreshUI) {
      window.YachtGame.Game.refreshUI();
    }
    // Re-render skin selector for new language
    refreshSkinSelector();
    // Re-render tutorial tooltip if active
    if (window.YachtGame.Tutorial && window.YachtGame.Tutorial.isActive() && window.YachtGame.Tutorial.refreshLang) {
      window.YachtGame.Tutorial.refreshLang();
    }
    // Re-render history page if stats screen is active
    var statsScreen = document.getElementById('screen-history');
    if (statsScreen && statsScreen.classList.contains('active') && window.YachtGame.UI && window.YachtGame.UI.refreshHistory) {
      window.YachtGame.UI.refreshHistory();
    }
    // Re-render waiting tip for new language
    showRandomTip();
  });

  // --- Auth: show/hide login UI based on auth state ---
  function showLoginScreen(user) {
    var isGoogle = user && !user.isAnonymous;
    var guestSection = document.querySelector('.guest-section');
    var divider = document.querySelector('#screen-login .divider');
    var googleDisclaimer = document.getElementById('google-signin-disclaimer');
    if (isGoogle) {
      // Google signed in — show profile, hide guest/google buttons
      btnGoogleSignin.classList.add('hidden-section');
      if (googleDisclaimer) googleDisclaimer.classList.add('hidden-section');
      guestSection.classList.add('hidden-section');
      divider.classList.add('hidden-section');
      signedInProfile.classList.add('visible');
      var displayText = user.displayName || 'Player';
      var nick = Auth.getNickname();
      if (nick) displayText += ' (' + nick + ')';
      userDisplayName.textContent = displayText;

      // Update display name and playerName when nicknames finish loading (non-blocking)
      window.YachtGame.onNicknameReady = function () {
        var updated = user.displayName || 'Player';
        var loadedNick = Auth.getNickname();
        if (loadedNick) updated += ' (' + loadedNick + ')';
        userDisplayName.textContent = updated;
        playerName = Auth.getPlayerName();
        updateScreenNicknames();
      };
      userAvatar.onerror = function () { userAvatar.onerror = null; userAvatar.src = DEFAULT_AVATAR; };
      userAvatar.src = user.photoURL || DEFAULT_AVATAR;
    } else {
      // Not signed in or anonymous — show guest + google login
      btnGoogleSignin.classList.remove('hidden-section');
      if (googleDisclaimer) googleDisclaimer.classList.remove('hidden-section');
      guestSection.classList.remove('hidden-section');
      divider.classList.remove('hidden-section');
      signedInProfile.classList.remove('visible');
    }
  }

  var skinSelector = document.getElementById('skin-selector');

  function refreshSkinSelector() {
    if (!Auth.isSignedIn()) {
      if (skinSelector) skinSelector.hidden = true;
      return;
    }
    var uid = Auth.getPlayerUid();
    History.loadStats(uid, function (stats) {
      var totalGames = (stats && stats.totalGames) || 0;
      var totalWins = (stats && stats.wins) || 0;
      var botWins = (stats && stats.botWins) || {};
      var maxStreak = (stats && stats.maxStreak) || 0;
      var currentStreak = (stats && stats.currentStreak) || 0;
      var achievements = (stats && stats.achievements) || {};
      if (skinSelector) skinSelector.hidden = false;
      DiceSkins.renderSkinSelector(skinSelector, totalGames, botWins, totalWins, maxStreak, currentStreak, achievements);
    });
  }

  // Listen for auth state changes
  Auth.onAuthStateChanged(function (user) {
    // Hide stats button for anonymous (guest) auth users
    if (user && user.isAnonymous) {
      if (btnMyStats) btnMyStats.style.display = 'none';
      return;
    }

    showLoginScreen(user);
    // Show My Stats button in lobby if signed in (non-anonymous)
    if (btnMyStats) {
      btnMyStats.style.display = (user && !user.isAnonymous) ? '' : 'none';
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
        UI.showToast((I18n ? I18n.t('toast_signin_failed') : 'Sign-in failed') + ': ' + (error.message || (I18n ? I18n.t('toast_unknown_error') : 'Unknown error')));
      }
    });
  });

  // Sign Out
  btnSignout.addEventListener('click', function () {
    Auth.signOut(function () {
      showLoginScreen(null);
      UI.showScreen('screen-login');
      var I18n = window.YachtGame.I18n;
      UI.showToast(I18n ? I18n.t('signed_out') : 'Signed out');
    });
  });

  // Continue (signed in)
  btnContinueSigned.addEventListener('click', function () {
    playerName = Auth.getPlayerName();
    updateScreenNicknames();
    UI.showScreen('screen-lobby');
    refreshSkinSelector();
    Lobby.cleanupStaleRooms();
  });

  // --- Guest Flow ---
  btnGuest.addEventListener('click', function () {
    btnGuest.disabled = true;
    Auth.setGuest(function (error) {
      btnGuest.disabled = false;
      if (error) return;
      playerName = Auth.getPlayerName();
      updateScreenNicknames();
      if (btnMyStats) btnMyStats.style.display = 'none';
      DiceSkins.applySkin('classic');
      UI.showScreen('screen-lobby');
      Lobby.cleanupStaleRooms();
    });
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
    var originalText = btnCreate.textContent;
    btnCreate.disabled = true;
    btnCreate.innerHTML = '<span class="btn-dice-spinner"></span>';

    var gameMode = 'yacht';
    for (var i = 0; i < modeRadios.length; i++) {
      if (modeRadios[i].checked) gameMode = modeRadios[i].value;
    }

    Lobby.createRoom(playerName, gameMode, function (result) {
      btnCreate.disabled = false;
      btnCreate.textContent = originalText;
      if (result.error) {
        UI.showToast(result.error);
        return;
      }

      displayRoomCode.textContent = result.roomCode;
      currentWaitingRoomCode = result.roomCode;
      document.getElementById('screen-waiting').setAttribute('data-wait-type', 'private');
      UI.showScreen('screen-waiting');

      // Wait for opponent
      cancelOpponentListener = Lobby.listenForOpponent(result.roomCode, function (player2) {
        cancelOpponentListener = null;
        var oppName = Game.resolvePlayerName(player2, player2.name);
        UI.showToast(oppName + ' ' + (I18n ? I18n.t('toast_player_joined') : 'joined!'));
        Game.init(result.roomCode, result.playerKey);
      });
    });
  });

  btnJoin.addEventListener('click', function () {
    var code = roomCodeInput.value.trim();
    if (code.length < 6) return;

    var originalJoinText = btnJoin.textContent;
    btnJoin.disabled = true;
    btnJoin.innerHTML = '<span class="btn-dice-spinner"></span>';

    Lobby.joinRoom(playerName, code, function (result) {
      btnJoin.disabled = false;
      btnJoin.textContent = originalJoinText;
      if (result.error) {
        UI.showToast(result.error);
        return;
      }

      UI.showToast((I18n ? I18n.t('toast_joined_room') : 'Joined room') + ' ' + result.roomCode);
      Game.init(result.roomCode, result.playerKey);
    });
  });

  // --- Quick Match (Random Join) ---
  var btnRandomStart = document.getElementById('btn-random-start');
  var btnBackLobbyRandom = document.getElementById('btn-back-lobby-random');

  btnRandomJoin.addEventListener('click', function () {
    if (!playerName) playerName = Auth.getPlayerName();
    if (!playerName) {
      UI.showToast(I18n ? I18n.t('toast_name_required') : 'Please set a name first.');
      return;
    }
    UI.showScreen('screen-random-setup');
  });

  btnBackLobbyRandom.addEventListener('click', function () {
    UI.showScreen('screen-lobby');
  });

  btnRandomStart.addEventListener('click', function () {
    var randomModeRadios = document.querySelectorAll('input[name="random-mode"]');
    var gameMode = 'yahtzee';
    for (var i = 0; i < randomModeRadios.length; i++) {
      if (randomModeRadios[i].checked) gameMode = randomModeRadios[i].value;
    }

    var originalText = btnRandomStart.textContent;
    btnRandomStart.disabled = true;
    btnRandomStart.innerHTML = '<span class="btn-dice-spinner"></span>';

    Lobby.findRandomRoom(playerName, gameMode, function (result) {
      btnRandomStart.disabled = false;
      btnRandomStart.textContent = originalText;
      if (result.error) {
        UI.showToast(result.error);
        return;
      }

      if (result.matched) {
        UI.showToast(I18n.t('random_matched'));
        Game.init(result.roomCode, result.playerKey);
      } else {
        currentWaitingRoomCode = result.roomCode;
        document.getElementById('screen-waiting').setAttribute('data-wait-type', 'random');
        UI.showScreen('screen-waiting');
        resetRandomTip();

        cancelOpponentListener = Lobby.listenForOpponent(result.roomCode, function (player2) {
          cancelOpponentListener = null;
          var oppName = Game.resolvePlayerName(player2, player2.name);
          UI.showToast(oppName + ' ' + (I18n ? I18n.t('toast_player_joined') : 'joined!'));
          Game.init(result.roomCode, result.playerKey);
        });
      }
    });
  });

  // --- Bot Play ---
  btnBotPlay.addEventListener('click', function () {
    if (!playerName) playerName = Auth.getPlayerName();
    if (!playerName) {
      UI.showToast(I18n ? I18n.t('toast_name_required') : 'Please set a name first.');
      return;
    }
    UI.showScreen('screen-bot-setup');
  });

  btnBotStart.addEventListener('click', function () {
    var botModeRadios = document.querySelectorAll('input[name="bot-mode"]');
    var gameMode = 'yahtzee';
    for (var i = 0; i < botModeRadios.length; i++) {
      if (botModeRadios[i].checked) gameMode = botModeRadios[i].value;
    }
    var diffRadios = document.querySelectorAll('input[name="bot-difficulty"]');
    var diff = 'basic';
    for (var i = 0; i < diffRadios.length; i++) {
      if (diffRadios[i].checked) diff = diffRadios[i].value;
    }

    window.YachtGame._onlineGame = window.YachtGame.Game;
    window.YachtGame.Game = window.YachtGame.BotGame;
    window.YachtGame.Game.init(gameMode, diff, playerName);
  });

  btnBackLobbyBot.addEventListener('click', function () {
    UI.showScreen('screen-lobby');
  });

  // --- Copy Room Code ---
  btnCopyCode.addEventListener('click', function () {
    var code = displayRoomCode.textContent;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(code).then(function () {
        UI.showToast(I18n ? I18n.t('toast_code_copied') : 'Code copied!');
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

  // --- Fast Mode Toggle ---
  btnFastMode.addEventListener('click', function () {
    if (window.YachtGame.BotGame) window.YachtGame.BotGame.toggleFastMode();
  });

  // --- Shortcut Button (hover overlay) ---
  btnShortcut.addEventListener('mouseenter', function () {
    UI.showShortcutOverlay();
  });

  btnShortcut.addEventListener('mouseleave', function () {
    UI.hideShortcutOverlay();
  });

  // --- Rule & Leave Buttons ---
  btnRule.addEventListener('mouseenter', function () {
    var mode = window.YachtGame.Game.getGameMode();
    if (mode) UI.showRulesOverlay(mode);
  });

  btnRule.addEventListener('mouseleave', function () {
    UI.hideRulesOverlay();
  });

  var leaveOverlay = document.getElementById('overlay-leave-confirm');
  var leaveMsg = document.getElementById('leave-confirm-msg');
  var btnLeaveYes = document.getElementById('btn-leave-yes');
  var btnLeaveNo = document.getElementById('btn-leave-no');

  btnLeave.addEventListener('click', function () {
    var I18n = window.YachtGame.I18n;
    var msg = window.YachtGame._isBotGame
      ? (I18n ? I18n.t('confirm_leave_bot') : 'Leave bot game? This counts as a loss.')
      : (I18n ? I18n.t('confirm_leave_online') : 'Really leave? Your opponent wins.');
    leaveMsg.textContent = msg;
    leaveOverlay.classList.remove('hidden');
  });

  btnLeaveYes.addEventListener('click', function () {
    leaveOverlay.classList.add('hidden');
    window.YachtGame.Game.leaveGame();
  });

  btnLeaveNo.addEventListener('click', function () {
    leaveOverlay.classList.add('hidden');
  });

  // --- Draw Proposal ---
  btnDraw.addEventListener('click', function () {
    var I18n = window.YachtGame.I18n;
    if (window.YachtGame._isBotGame) {
      UI.showToast(I18n ? I18n.t('bot_no_draw') : '로봇은 무승부를 모릅니다 🤖');
      return;
    }
    if (btnDraw.disabled) return;
    UI.showDrawPending(true);
    window.YachtGame.Game.proposeDraw();
  });

  btnAcceptDraw.addEventListener('click', function () {
    window.YachtGame.Game.respondToDraw(true);
  });

  btnDeclineDraw.addEventListener('click', function () {
    window.YachtGame.Game.respondToDraw(false);
  });

  // --- Tutorial ---
  btnTutorialLogin.addEventListener('click', function () {
    window.YachtGame.Tutorial.start();
  });
  btnTutorialLobby.addEventListener('click', function () {
    window.YachtGame.Tutorial.start();
  });
  tutorialNext.addEventListener('click', function () {
    var Tutorial = window.YachtGame.Tutorial;
    if (Tutorial && Tutorial.isActive()) Tutorial._advance();
  });
  tutorialSkip.addEventListener('click', function () {
    var Tutorial = window.YachtGame.Tutorial;
    if (Tutorial) Tutorial.cleanup();
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
    if (cancelOpponentListener) {
      cancelOpponentListener();
      cancelOpponentListener = null;
    }
    var code = currentWaitingRoomCode || displayRoomCode.textContent;
    Lobby.cancelRoom(code);
    currentWaitingRoomCode = null;
    UI.showScreen('screen-lobby');
  });

  // --- Emote System ---
  var QUICK_EMOTES = [
    { emoji: '🎯', msg: '🎯 계획대로' },
    { emoji: '👑', msg: '👑 왕이 납신다' },
    { emoji: '🤦', msg: '🤦 말도 안돼' },
    { emoji: '😭', msg: '😭 봐줘요...' },
    { emoji: '❓', msg: '❓ 그게 최선?' },
    { emoji: '🐢', msg: '🐢 좀 빨리~' }
  ];

  var EMOTES = [
    '😎 게임 쉽네요',
    '🥱 하품 나온다~',
    '🔥 실화냐?',
    '❓ 그게 최선?',
    '💀 RIP',
    '🤦 말도 안돼',
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
    window.YachtGame.Game.sendEmote(msg);
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
    window.YachtGame.Game.rollDice();
  });

  // Dice click handlers
  var dieEls = document.querySelectorAll('.die');
  for (var i = 0; i < dieEls.length; i++) {
    (function (index) {
      dieEls[index].addEventListener('click', function () {
        if (!this.classList.contains('disabled')) {
          window.YachtGame.Game.toggleHold(index);
        }
      });
    })(i);
  }

  // --- Game Over ---
  btnNewGame.addEventListener('click', function () {
    window.YachtGame.Game.destroy();
    // Restore online controller if in bot mode
    if (window.YachtGame._onlineGame) {
      window.YachtGame.Game = window.YachtGame._onlineGame;
      window.YachtGame._onlineGame = null;
    }
    window.YachtGame._isBotGame = false;
    Lobby.clearSession();
    UI.showScreen('screen-lobby');
    refreshSkinSelector();
    Lobby.cleanupStaleRooms();
  });

  // --- PC Keyboard Shortcuts ---
  var kbFocusIndex = -1;

  // Expose setter so UI click handlers can sync kb-focus index
  window.YachtGame._setKbFocusIndex = function (idx) { kbFocusIndex = idx; };

  function getKbFocusables() {
    var items = [];
    var previews = document.querySelectorAll('.score-cell.preview');
    for (var i = 0; i < previews.length; i++) {
      items.push(previews[i]);
    }
    if (!btnRoll.disabled) {
      items.push(btnRoll);
    }
    return items;
  }

  function clearKbFocus() {
    var old = document.querySelectorAll('.kb-focus');
    for (var i = 0; i < old.length; i++) {
      old[i].classList.remove('kb-focus');
    }
  }

  function applyKbFocus(items) {
    clearKbFocus();
    if (kbFocusIndex >= 0 && kbFocusIndex < items.length) {
      items[kbFocusIndex].classList.add('kb-focus');
      // Scroll into view if needed
      items[kbFocusIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  var EMOTE_CODES = ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY'];

  document.addEventListener('keydown', function (e) {
    // Only active during game screen
    if (!document.body.classList.contains('in-game')) return;

    // Ignore if typing in an input field
    var tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    var key = e.key;

    // 1~5: toggle dice hold
    if (key >= '1' && key <= '5') {
      var dieIndex = parseInt(key) - 1;
      var dieEl = dieEls[dieIndex];
      if (dieEl && !dieEl.classList.contains('disabled')) {
        window.YachtGame.Game.toggleHold(dieIndex);
      }
      return;
    }

    // Q/W/E/R/T/Y: quick emotes (use e.code for IME compatibility)
    var emoteIdx = EMOTE_CODES.indexOf(e.code);
    if (emoteIdx !== -1 && emoteIdx < QUICK_EMOTES.length) {
      sendEmoteWithCooldown(QUICK_EMOTES[emoteIdx].msg);
      return;
    }

    // Arrow Up/Down: cycle through preview cells + roll button
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      e.preventDefault();
      var items = getKbFocusables();
      if (items.length === 0) return;

      if (key === 'ArrowDown') {
        kbFocusIndex = (kbFocusIndex + 1) % items.length;
      } else {
        kbFocusIndex = kbFocusIndex <= 0 ? items.length - 1 : kbFocusIndex - 1;
      }
      applyKbFocus(items);
      return;
    }

    // Enter: click focused item, or roll if no focus
    if (key === 'Enter') {
      e.preventDefault();
      var items = getKbFocusables();
      if (kbFocusIndex >= 0 && kbFocusIndex < items.length) {
        items[kbFocusIndex].click();
      } else if (!btnRoll.disabled) {
        btnRoll.click();
      }
      return;
    }
  });

  // After scorecard re-render: set smart focus based on game state
  var origRenderScorecard = UI.renderScorecard;
  UI.renderScorecard = function () {
    origRenderScorecard.apply(this, arguments);
    var items = getKbFocusables();

    if (!btnRoll.disabled) {
      // Roll button is available → focus on it (last item)
      var rollIdx = items.indexOf(btnRoll);
      if (rollIdx !== -1) {
        kbFocusIndex = rollIdx;
      }
    } else {
      var pending = window.YachtGame.Game.getPendingCategory ? window.YachtGame.Game.getPendingCategory() : null;
      var previews = document.querySelectorAll('.score-cell.preview');
      if (pending) {
        // Pending category exists — preserve focus on that cell
        for (var i = 0; i < previews.length; i++) {
          if (previews[i].dataset.category === pending) {
            kbFocusIndex = i;
            break;
          }
        }
      } else {
        // Roll exhausted → auto-focus on highest-score preview cell
        var bestIdx = -1;
        var bestVal = -1;
        for (var i = 0; i < previews.length; i++) {
          var val = parseInt(previews[i].textContent, 10) || 0;
          if (val > bestVal) {
            bestVal = val;
            bestIdx = i;
          }
        }
        if (bestIdx !== -1) {
          kbFocusIndex = bestIdx;
        } else if (items.length > 0) {
          kbFocusIndex = 0;
        } else {
          kbFocusIndex = -1;
        }
      }
    }

    applyKbFocus(items);

    // Re-show pending hint if category is pending (survives DOM re-render)
    if (btnRoll.disabled) {
      var pending = window.YachtGame.Game.getPendingCategory ? window.YachtGame.Game.getPendingCategory() : null;
      if (pending) {
        UI.showScoreConfirmHint(pending);
      }
    }
  };

  // --- Reconnection on page load ---
  Lobby.tryReconnect(function (session) {
    if (session && session.status === 'playing') {
      playerName = Auth.getPlayerName() || 'Player';
      Game.init(session.roomCode, session.playerKey);
      UI.showToast(I18n ? I18n.t('toast_reconnected') : 'Reconnected to game!');
    } else if (session && session.status === 'waiting') {
      var waitType = session.roomType || 'private';
      document.getElementById('screen-waiting').setAttribute('data-wait-type', waitType);
      displayRoomCode.textContent = session.roomCode;
      currentWaitingRoomCode = session.roomCode;
      UI.showScreen('screen-waiting');
      if (waitType === 'random') showRandomTip();
      cancelOpponentListener = Lobby.listenForOpponent(session.roomCode, function (player2) {
        cancelOpponentListener = null;
        var oppName = Game.resolvePlayerName(player2, player2.name);
        UI.showToast(oppName + ' ' + (I18n ? I18n.t('toast_player_joined') : 'joined!'));
        Game.init(session.roomCode, session.playerKey);
      });
    }
  });
})();
