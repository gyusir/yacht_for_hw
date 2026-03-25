// App entry point: wires all modules together
(function () {
  'use strict';

  var UI = window.YachtGame.UI;
  var Lobby = window.YachtGame.Lobby;
  var Game = window.YachtGame.Game;
  var Dice = window.YachtGame.Dice;

  // Initialize theme
  UI.initTheme();

  // --- DOM Elements ---
  var themeToggle = document.getElementById('theme-toggle');
  var nameInput = document.getElementById('player-name');
  var btnContinue = document.getElementById('btn-continue');
  var btnCreate = document.getElementById('btn-create');
  var roomCodeInput = document.getElementById('room-code-input');
  var btnJoin = document.getElementById('btn-join');
  var lobbyError = document.getElementById('lobby-error');
  var displayRoomCode = document.getElementById('display-room-code');
  var btnCopyCode = document.getElementById('btn-copy-code');
  var btnRoll = document.getElementById('btn-roll');
  var btnNewGame = document.getElementById('btn-new-game');
  var modeRadios = document.querySelectorAll('input[name="mode"]');

  var playerName = '';

  // --- Theme Toggle ---
  themeToggle.addEventListener('click', function () {
    UI.toggleTheme();
  });

  // --- Name Screen ---
  nameInput.addEventListener('input', function () {
    btnContinue.disabled = nameInput.value.trim().length === 0;
  });

  nameInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && nameInput.value.trim().length > 0) {
      btnContinue.click();
    }
  });

  btnContinue.addEventListener('click', function () {
    playerName = nameInput.value.trim();
    if (!playerName) return;
    UI.showScreen('screen-lobby');
  });

  // --- Lobby Screen ---
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
      UI.showScreen('screen-waiting');

      // Listen for mode changes while waiting
      for (var i = 0; i < modeRadios.length; i++) {
        modeRadios[i].addEventListener('change', function () {
          Lobby.updateGameMode(result.roomCode, this.value);
        });
      }

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

  // --- Copy Room Code ---
  btnCopyCode.addEventListener('click', function () {
    var code = displayRoomCode.textContent;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(code).then(function () {
        UI.showToast('Code copied!');
      });
    } else {
      // Fallback
      var textArea = document.createElement('textarea');
      textArea.value = code;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      UI.showToast('Code copied!');
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
  });

  // --- Reconnection on page load ---
  Lobby.tryReconnect(function (session) {
    if (session && session.status === 'playing') {
      playerName = 'Reconnected';
      Game.init(session.roomCode, session.playerKey);
      UI.showToast('Reconnected to game!');
    } else if (session && session.status === 'waiting') {
      // Reconnected to waiting room
      displayRoomCode.textContent = session.roomCode;
      UI.showScreen('screen-waiting');
      Lobby.listenForOpponent(session.roomCode, function (player2) {
        UI.showToast(player2.name + ' joined!');
        Game.init(session.roomCode, session.playerKey);
      });
    }
  });
})();
