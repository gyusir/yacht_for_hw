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
  var celebratedBonuses = {};
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
      UI.showScreen('screen-game', gameMode);
    }

    var isMyTurn = room.currentTurn === localPlayerKey;

    // Reset pending score selection only on turn change or dice re-roll
    if (room.currentTurn !== lastTurn || (room.rollCount || 0) !== lastRollCount) {
      pendingCategory = null;
    }
    lastTurn = room.currentTurn;
    lastRollCount = room.rollCount || 0;

    // Apply dice skin: classic before first roll, player's skin after rolling
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

    // Render dice (heldDice is the single source of truth for held state)
    var diceState = [];
    var heldData = room.heldDice || {};
    for (var i = 0; i < 5; i++) {
      var d = room.dice[i] || { value: 0, held: false };
      diceState.push({ value: d.value, held: heldData[i] === true });
    }

    if (!isRolling) {
      Dice.renderAll(diceState);
    }

    // Set dice interactivity (can only hold after first roll and during your turn)
    Dice.setInteractive(isMyTurn && room.rollCount > 0);

    // Roll button state
    UI.setRollButtonEnabled(isMyTurn && (room.rollCount || 0) < 3 && !isRolling, isMyTurn, room.rollCount || 0);

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
      room.rollCount > 0,
      (myData && myData.diceSkin) || 'classic',
      (oppData && oppData.diceSkin) || 'classic'
    );

    // Celebration check: all 5 dice show the same value
    if (!isRolling && (room.rollCount || 0) > 0) {
      var diceVals = currentDice;
      if (diceVals[0] > 0 && diceVals[0] === diceVals[1] && diceVals[1] === diceVals[2] && diceVals[2] === diceVals[3] && diceVals[3] === diceVals[4]) {
        var celebKey = room.currentTurn + '_' + room.rollCount;
        if (celebKey !== lastCelebrationTs) {
          lastCelebrationTs = celebKey;
          UI.showConfetti();
        }
      }
    }

    // Celebration check: Yahtzee upper bonus achieved
    if (gameMode === 'yahtzee') {
      var players = ['player1', 'player2'];
      for (var pi = 0; pi < players.length; pi++) {
        var pk = players[pi];
        var pScores = (room.players[pk] && room.players[pk].scores) || {};
        if (!celebratedBonuses[pk] && Scoring.upperBonus(pScores) > 0) {
          celebratedBonuses[pk] = true;
          UI.showConfetti();
        }
      }
    }
  }

  function rollDice() {
    if (!lastRoomData || isRolling) return;

    var room = lastRoomData;
    if (room.currentTurn !== localPlayerKey) return;
    if ((room.rollCount || 0) >= 3) return;

    isRolling = true;
    window.YachtGame.UI.setRollButtonEnabled(false, true);

    // Apply skin immediately so the animation renders with the correct skin
    var DiceSkins = window.YachtGame.DiceSkins;
    if (DiceSkins) {
      var myData = room.players[localPlayerKey];
      DiceSkins.applySkin((myData && myData.diceSkin) || 'classic');
    }

    // Determine which dice are held (for animation: skip held dice)
    var heldData = room.heldDice || {};
    var heldFlags = [];
    for (var i = 0; i < 5; i++) {
      var d = room.dice[i] || { value: 0, held: false };
      heldFlags.push(heldData[i] === true);
    }

    // Start spinning animation on unheld dice (no final value yet)
    var dieEls = document.querySelectorAll('.die');
    var spinTimers = [];
    for (var i = 0; i < 5; i++) {
      if (heldFlags[i]) continue;
      (function (idx) {
        var el = dieEls[idx];
        el.classList.add('rolling');
        var timer = setInterval(function () {
          window.YachtGame.Dice.renderDie(el, Math.ceil(Math.random() * 6));
        }, 50);
        spinTimers.push({ idx: idx, timer: timer });
      })(i);
    }

    var rollRequestPending = true;
    var rollSafetyTimer = setTimeout(function () {
      // Safety: stop spinning and render from lastRoomData
      for (var s = 0; s < spinTimers.length; s++) {
        clearInterval(spinTimers[s].timer);
        dieEls[spinTimers[s].idx].classList.remove('rolling');
      }
      // Only allow re-roll if the server request already completed
      if (!rollRequestPending) {
        isRolling = false;
      }
      if (lastRoomData && lastRoomData.dice) {
        var ds = [];
        var hd = lastRoomData.heldDice || {};
        for (var j = 0; j < 5; j++) {
          var dd = lastRoomData.dice[j] || { value: 0, held: false };
          ds.push({ value: dd.value, held: hd[j] === true });
        }
        window.YachtGame.Dice.renderAll(ds);
      }
    }, 5000);

    // Call Cloud Function — when it responds, stop spinning and show real values
    rollDiceFn({ roomCode: roomCode }).then(function (result) {
      rollRequestPending = false;
      clearTimeout(rollSafetyTimer);
      var serverDice = result.data.dice;

      // Stop spinning and render server's actual values
      for (var s = 0; s < spinTimers.length; s++) {
        clearInterval(spinTimers[s].timer);
        dieEls[spinTimers[s].idx].classList.remove('rolling');
      }

      // Render all dice with server values (use heldDice as source of truth for held state)
      var hd = lastRoomData ? (lastRoomData.heldDice || {}) : {};
      var finalState = [];
      for (var j = 0; j < 5; j++) {
        var sd = serverDice[j] || { value: 0, held: false };
        finalState.push({ value: sd.value, held: hd[j] === true });
      }
      window.YachtGame.Dice.renderAll(finalState);
      isRolling = false;
      // Re-enable roll button and re-render scorecard so focus logic runs correctly
      if (lastRoomData) {
        var newRollCount = lastRoomData.rollCount || 0;
        var isMyTurn = lastRoomData.currentTurn === localPlayerKey;
        window.YachtGame.UI.setRollButtonEnabled(isMyTurn && newRollCount < 3, isMyTurn, newRollCount);
        // Re-trigger scorecard render so the kb-focus wrapper sees the enabled roll button
        var Scoring = window.YachtGame.Scoring;
        var Dice = window.YachtGame.Dice;
        var hd = lastRoomData.heldDice || {};
        var ds = [];
        for (var k = 0; k < 5; k++) {
          var dd = lastRoomData.dice[k] || { value: 0, held: false };
          ds.push({ value: dd.value, held: hd[k] === true });
        }
        var currentDice = Dice.getDiceValues(ds);
        window.YachtGame.UI.renderScorecard(
          (lastRoomData.players.player1 && lastRoomData.players.player1.scores) || {},
          (lastRoomData.players.player2 && lastRoomData.players.player2.scores) || {},
          lastRoomData.gameMode,
          currentDice,
          isMyTurn,
          localPlayerKey,
          (lastRoomData.players.player1 && lastRoomData.players.player1.name) || 'Player 1',
          (lastRoomData.players.player2 && lastRoomData.players.player2.name) || 'Player 2',
          (lastRoomData.players[localPlayerKey] && lastRoomData.players[localPlayerKey].lastCategory) || null,
          (lastRoomData.players[localPlayerKey === 'player1' ? 'player2' : 'player1'] && lastRoomData.players[localPlayerKey === 'player1' ? 'player2' : 'player1'].lastCategory) || null,
          lastRoomData.rollCount > 0,
          (lastRoomData.players[localPlayerKey] && lastRoomData.players[localPlayerKey].diceSkin) || 'classic',
          (lastRoomData.players[localPlayerKey === 'player1' ? 'player2' : 'player1'] && lastRoomData.players[localPlayerKey === 'player1' ? 'player2' : 'player1'].diceSkin) || 'classic'
        );
      }
    }).catch(function (error) {
      rollRequestPending = false;
      clearTimeout(rollSafetyTimer);
      for (var s = 0; s < spinTimers.length; s++) {
        clearInterval(spinTimers[s].timer);
        dieEls[spinTimers[s].idx].classList.remove('rolling');
      }
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

    // Determine current held state from heldDice (single source of truth)
    var heldData = room.heldDice || {};
    var isCurrentlyHeld = heldData[index] === true;
    var newHeld = !isCurrentlyHeld;

    // Write to heldDice path (client-writable via Security Rules)
    var heldRef = window.YachtGame.db.ref('rooms/' + roomCode + '/heldDice/' + index);
    heldRef.set(newHeld).catch(function (err) {
      console.error('Failed to update held state:', err);
      // Rollback optimistic UI on failure
      var rollbackEls = document.querySelectorAll('.die');
      var rollbackEl = rollbackEls[index];
      if (rollbackEl) {
        if (isCurrentlyHeld) {
          rollbackEl.classList.add('held');
          if (!rollbackEl.querySelector('.held-check')) {
            var chk = document.createElement('span');
            chk.className = 'held-check';
            chk.textContent = '\u2713';
            rollbackEl.appendChild(chk);
          }
        } else {
          rollbackEl.classList.remove('held');
          var existingChk = rollbackEl.querySelector('.held-check');
          if (existingChk) existingChk.remove();
        }
      }
    });

    // Immediate local UI feedback: toggle only this die's held state via DOM
    var dieEls = document.querySelectorAll('.die');
    var el = dieEls[index];
    if (el) {
      var existing = el.querySelector('.held-check');
      if (newHeld) {
        el.classList.add('held');
        if (!existing) {
          var check = document.createElement('span');
          check.className = 'held-check';
          check.textContent = '\u2713';
          el.appendChild(check);
        }
      } else {
        el.classList.remove('held');
        if (existing) existing.remove();
      }
    }
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

    // Pre-validate category before sending to server
    var Scoring = window.YachtGame.Scoring;
    if (Scoring && Scoring.getCategories) {
      var validCats = Scoring.getCategories(room.gameMode);
      if (validCats.indexOf(category) === -1) return;
    }

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
    celebratedBonuses = {};
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
    destroy: destroy,
    getPendingCategory: function () { return pendingCategory; },
    isRolling: function () { return isRolling; }
  };
})();
