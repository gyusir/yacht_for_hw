// Game controller: state machine, turn management, Firebase sync
(function () {
  'use strict';

  window.YachtGame = window.YachtGame || {};

  var roomRef = null;
  var roomCode = null;
  var localPlayerKey = null;
  var opponentKey = null;
  var gameMode = null;
  var roomListener = null;
  var lastRoomData = null;
  var isRolling = false;
  var isWriting = false;
  var pendingCategory = null;
  var lastTurn = null;
  var lastRollCount = null;
  var lastCelebrationTs = 0;
  var emoteListener = null;
  var lastSeenEmoteTs = 0;

  // Cloud Functions references
  var rollDiceFn = null;
  var selectCategoryFn = null;
  var leaveGameFn = null;

  function getFunctions() {
    if (!rollDiceFn) {
      var fns = window.YachtGame.functions;
      rollDiceFn = fns.httpsCallable('rollDice');
      selectCategoryFn = fns.httpsCallable('selectCategory');
      leaveGameFn = fns.httpsCallable('leaveGame');
    }
  }

  function init(code, playerKey) {
    roomCode = code;
    localPlayerKey = playerKey;
    opponentKey = playerKey === 'player1' ? 'player2' : 'player1';
    roomRef = window.YachtGame.db.ref('rooms/' + roomCode);
    getFunctions();

    // Show game screen immediately (don't wait for first Firebase callback)
    window.YachtGame.UI.showScreen('screen-game');

    // Listen for room changes
    roomListener = roomRef.on('value', onRoomUpdate);

    // Listen for opponent emotes
    var emoteRef = roomRef.child('emotes/' + opponentKey);
    emoteListener = emoteRef.on('value', function (snap) {
      if (!snap.exists()) return;
      var data = snap.val();
      if (data.ts && data.ts > lastSeenEmoteTs) {
        lastSeenEmoteTs = data.ts;
        window.YachtGame.UI.showEmoteBubble('opp', data.msg);
      }
    });
  }

  function onRoomUpdate(snapshot) {
    if (!snapshot.exists()) return;

    var room = snapshot.val();
    lastRoomData = room;
    gameMode = room.gameMode;

    var UI = window.YachtGame.UI;
    var Dice = window.YachtGame.Dice;
    var Scoring = window.YachtGame.Scoring;

    var myData = room.players ? room.players[localPlayerKey] : null;
    var oppData = room.players ? room.players[opponentKey] : null;

    // Wait until both players are present before rendering game
    if (!myData || !oppData) {
      return;
    }

    // Handle disconnection
    if (oppData.connected === false && room.status === 'playing') {
      UI.showDisconnectOverlay(true);
    } else {
      UI.showDisconnectOverlay(false);
    }

    // Game over check
    if (room.status === 'finished') {
      UI.showScreen('screen-gameover');
      var p1 = room.players.player1;
      var p2 = room.players.player2;
      UI.renderGameOver(
        p1.name, p2.name,
        p1.scores || {}, p2.scores || {},
        gameMode, room.winner, localPlayerKey
      );
      // History is now saved by server-side trigger (onGameFinished)
      return;
    }

    // Ensure we're on the game screen
    if (room.status === 'playing') {
      UI.showScreen('screen-game');
    }

    var isMyTurn = room.currentTurn === localPlayerKey;

    // Reset pending score selection only on turn change or dice re-roll
    if (room.currentTurn !== lastTurn || (room.rollCount || 0) !== lastRollCount) {
      pendingCategory = null;
    }
    lastTurn = room.currentTurn;
    lastRollCount = room.rollCount || 0;

    // Apply dice skin of the current turn's player (only after first roll)
    var DiceSkins = window.YachtGame.DiceSkins;
    if (DiceSkins) {
      if ((room.rollCount || 0) > 0) {
        var turnPlayer = room.currentTurn ? room.players[room.currentTurn] : null;
        var turnSkin = (turnPlayer && turnPlayer.diceSkin) || 'classic';
        DiceSkins.applySkin(turnSkin);
      } else {
        DiceSkins.applySkin('classic');
      }
    }

    // Update turn indicator
    UI.updateTurnIndicator(isMyTurn, oppData.name || 'Opponent');

    // Update roll counter
    UI.updateRollCounter(room.rollCount || 0);

    // Render dice
    var diceState = [];
    for (var i = 0; i < 5; i++) {
      diceState.push(room.dice[i] || { value: 0, held: false });
    }

    if (!isRolling) {
      Dice.renderAll(diceState);
    }

    // Set dice interactivity (can only hold after first roll and during your turn)
    Dice.setInteractive(isMyTurn && room.rollCount > 0);

    // Roll button state
    UI.setRollButtonEnabled(isMyTurn && (room.rollCount || 0) < 3 && !isRolling, isMyTurn);

    // Render scorecard
    var currentDice = Dice.getDiceValues(diceState);
    UI.renderScorecard(
      (room.players.player1 && room.players.player1.scores) || {},
      (room.players.player2 && room.players.player2.scores) || {},
      gameMode,
      currentDice,
      isMyTurn,
      localPlayerKey,
      (room.players.player1 && room.players.player1.name) || 'Player 1',
      (room.players.player2 && room.players.player2.name) || 'Player 2',
      myData.lastCategory || null,
      oppData.lastCategory || null,
      room.rollCount > 0
    );

    // Celebration check (Yacht/Yahtzee scored)
    if (room.celebration && room.celebration.ts && room.celebration.ts > lastCelebrationTs) {
      lastCelebrationTs = room.celebration.ts;
      UI.showConfetti();
    }
  }

  function rollDice() {
    if (!lastRoomData || isRolling) return;

    var room = lastRoomData;
    if (room.currentTurn !== localPlayerKey) return;
    if ((room.rollCount || 0) >= 3) return;

    isRolling = true;
    window.YachtGame.UI.setRollButtonEnabled(false, true);

    // Generate placeholder values for animation
    var animDiceState = [];
    for (var i = 0; i < 5; i++) {
      var current = room.dice[i] || { value: 0, held: false };
      if (current.held) {
        animDiceState.push({ value: current.value, held: true });
      } else {
        animDiceState.push({ value: Math.ceil(Math.random() * 6), held: false });
      }
    }

    // Animate dice locally with placeholder values
    var dieEls = document.querySelectorAll('.die');
    var rollSafetyTimer = setTimeout(function () { isRolling = false; }, 3000);

    window.YachtGame.Dice.animateRoll(dieEls, animDiceState, function () {
      clearTimeout(rollSafetyTimer);
      // Animation done; actual values will come from Firebase listener
    });

    // Call Cloud Function (server generates real dice values)
    rollDiceFn({ roomCode: roomCode }).then(function () {
      isRolling = false;
    }).catch(function (error) {
      isRolling = false;
      console.error('rollDice error:', error);
      window.YachtGame.UI.showToast('Roll failed: ' + (error.message || 'Unknown error'));
    });
  }

  function toggleHold(index) {
    if (!lastRoomData) return;
    var room = lastRoomData;
    if (room.currentTurn !== localPlayerKey) return;
    if ((room.rollCount || 0) < 1) return; // Can't hold before first roll

    var current = room.dice[index] || { value: 0, held: false };
    var newHeld = !current.held;

    // Write to heldDice path (client-writable via Security Rules)
    var heldRef = window.YachtGame.db.ref('rooms/' + roomCode + '/heldDice/' + index);
    heldRef.set(newHeld);

    // Immediate local UI feedback: update lastRoomData and re-render
    if (lastRoomData.dice && lastRoomData.dice[index]) {
      lastRoomData.dice[index].held = newHeld;
    }
    var diceState = [];
    for (var i = 0; i < 5; i++) {
      diceState.push(lastRoomData.dice[i] || { value: 0, held: false });
    }
    window.YachtGame.Dice.renderAll(diceState);
  }

  function confirmCategory(category) {
    if (!lastRoomData) return;
    var myScores = lastRoomData.players[localPlayerKey].scores || {};
    if (myScores[category] !== null && myScores[category] !== undefined) return;

    if (pendingCategory === category) {
      selectCategory(category);
      pendingCategory = null;
    } else {
      pendingCategory = category;
      window.YachtGame.UI.showScoreConfirmHint(category);
    }
  }

  function selectCategory(category) {
    if (isWriting) return;
    if (!lastRoomData) return;
    var room = lastRoomData;
    if (room.currentTurn !== localPlayerKey) return;
    if ((room.rollCount || 0) < 1) return;

    var myScores = room.players[localPlayerKey].scores || {};
    if (myScores[category] !== null && myScores[category] !== undefined) return;

    isWriting = true;

    // Call Cloud Function — server calculates score and updates game state
    selectCategoryFn({ roomCode: roomCode, category: category }).then(function (result) {
      isWriting = false;
      if (result.data && result.data.yahtzeeBonus) {
        window.YachtGame.UI.showToast('Yahtzee Bonus! +100');
      }
    }).catch(function (error) {
      isWriting = false;
      console.error('selectCategory error:', error);
      window.YachtGame.UI.showToast('Failed: ' + (error.message || 'Unknown error'));
    });
  }

  function sendEmote(msg) {
    if (!roomRef || !lastRoomData) return;
    // Show on my own header immediately
    window.YachtGame.UI.showEmoteBubble('mine', msg);
    var myName = lastRoomData.players[localPlayerKey].name;
    roomRef.child('emotes/' + localPlayerKey).set({
      msg: msg,
      name: myName,
      ts: firebase.database.ServerValue.TIMESTAMP
    });
  }

  function leaveGame() {
    if (roomRef && lastRoomData && lastRoomData.status === 'playing') {
      // Call Cloud Function for safe forfeit
      leaveGameFn({ roomCode: roomCode }).catch(function (error) {
        console.error('leaveGame error:', error);
      });
    }
    destroy();
    window.YachtGame.Lobby.clearSession();
    window.YachtGame.UI.showScreen('screen-lobby');
  }

  function getGameMode() {
    return gameMode;
  }

  function destroy() {
    if (roomRef && roomListener) {
      roomRef.off('value', roomListener);
    }
    if (roomRef && emoteListener) {
      roomRef.child('emotes/' + opponentKey).off('value', emoteListener);
    }
    // Room cleanup is now handled by the server-side onGameFinished trigger
    roomRef = null;
    roomCode = null;
    localPlayerKey = null;
    opponentKey = null;
    gameMode = null;
    lastRoomData = null;
    isRolling = false;
    isWriting = false;
    pendingCategory = null;
    lastTurn = null;
    lastRollCount = null;
    emoteListener = null;
    lastSeenEmoteTs = 0;
    lastCelebrationTs = 0;
    // Restore player's own skin
    var DiceSkins = window.YachtGame.DiceSkins;
    if (DiceSkins) DiceSkins.loadSkin();
  }

  window.YachtGame.Game = {
    init: init,
    rollDice: rollDice,
    toggleHold: toggleHold,
    confirmCategory: confirmCategory,
    sendEmote: sendEmote,
    leaveGame: leaveGame,
    getGameMode: getGameMode,
    destroy: destroy
  };
})();
