// Game controller: state machine, turn management, Firebase sync
(function () {
  'use strict';

  window.YachtGame = window.YachtGame || {};

  var roomRef = null;
  var roomCode = null;
  var localPlayerKey = null;
  var opponentKey = null;

  // Resolve player display name using language-specific nickname if available
  function resolvePlayerName(pData, fallback) {
    if (!pData) return fallback || 'Player';
    var I18n = window.YachtGame.I18n;
    if (I18n && pData.nicknameKo && pData.nicknameEn) {
      return I18n.getLang() === 'ko' ? pData.nicknameKo : pData.nicknameEn;
    }
    return pData.name || fallback || 'Player';
  }
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
  var isOnline = true;
  var connectedRef = null;
  var connectedCallback = null;

  // Cloud Functions references
  var rollDiceFn = null;
  var selectCategoryFn = null;
  var leaveGameFn = null;
  var proposeDrawFn = null;
  var respondToDrawFn = null;
  var claimDisconnectWinFn = null;
  var disconnectTimerId = null;
  var disconnectCountdownId = null;
  var DISCONNECT_TIMEOUT = 10;

  function getFunctions() {
    if (!rollDiceFn) {
      var fns = window.YachtGame.functions;
      rollDiceFn = fns.httpsCallable('rollDice');
      selectCategoryFn = fns.httpsCallable('selectCategory');
      leaveGameFn = fns.httpsCallable('leaveGame');
      proposeDrawFn = fns.httpsCallable('proposeDraw');
      respondToDrawFn = fns.httpsCallable('respondToDraw');
      claimDisconnectWinFn = fns.httpsCallable('claimDisconnectWin');
    }
  }

  function clearDisconnectTimer() {
    if (disconnectTimerId) { clearTimeout(disconnectTimerId); disconnectTimerId = null; }
    if (disconnectCountdownId) { clearInterval(disconnectCountdownId); disconnectCountdownId = null; }
  }

  function startDisconnectCountdown() {
    clearDisconnectTimer();
    var remaining = DISCONNECT_TIMEOUT;
    var timerEl = document.getElementById('disconnect-timer');
    if (timerEl) timerEl.textContent = remaining;

    disconnectCountdownId = setInterval(function () {
      remaining--;
      if (timerEl) timerEl.textContent = remaining;
      if (remaining <= 0) {
        clearInterval(disconnectCountdownId);
        disconnectCountdownId = null;
      }
    }, 1000);

    disconnectTimerId = setTimeout(function () {
      disconnectTimerId = null;
      getFunctions();
      claimDisconnectWinFn({ roomCode: roomCode }).catch(function (err) {
        console.error('claimDisconnectWin error:', err);
        var _I18n = window.YachtGame.I18n;
        window.YachtGame.UI.showToast(_I18n ? _I18n.t('claim_win_failed') : 'Failed to claim win.');
      });
    }, DISCONNECT_TIMEOUT * 1000);
  }

  function init(code, playerKey) {
    roomCode = code;
    localPlayerKey = playerKey;
    opponentKey = playerKey === 'player1' ? 'player2' : 'player1';
    roomRef = window.YachtGame.db.ref('rooms/' + roomCode);
    getFunctions();

    // Show game screen immediately (don't wait for first Firebase callback)
    window.YachtGame.UI.showScreen('screen-game');

    // Track online/offline status
    connectedRef = window.YachtGame.db.ref('.info/connected');
    connectedCallback = connectedRef.on('value', function (snap) {
      isOnline = snap.val() === true;
    });

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

  function checkCelebration(diceVals) {
    if (!lastRoomData) return;
    var room = lastRoomData;
    if ((room.rollCount || 0) <= 0) return;
    if (diceVals[0] > 0 && diceVals[0] === diceVals[1] && diceVals[1] === diceVals[2] && diceVals[2] === diceVals[3] && diceVals[3] === diceVals[4]) {
      var celebKey = room.currentTurn + '_' + room.rollCount;
      if (celebKey !== lastCelebrationTs) {
        lastCelebrationTs = celebKey;
        window.YachtGame.UI.showConfetti();
      }
    }
  }

  function onRoomUpdate(snapshot) {
    if (!snapshot.exists()) return;

    var room = snapshot.val();
    var prevRoom = lastRoomData;
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

    // SFX for opponent actions
    var SFX = window.YachtGame.SFX;
    if (SFX && prevRoom && prevRoom.players) {
      var prevOpp = prevRoom.players[opponentKey];
      // Confirm: opponent gained a newly filled score entry
      if (prevOpp) {
        var countFilled = function (s) {
          var n = 0;
          if (s) { for (var k in s) { if (s[k] !== null && s[k] !== undefined) n++; } }
          return n;
        };
        if (countFilled(oppData.scores) > countFilled(prevOpp.scores)) SFX.play('confirm');
      }
      // Roll / hold during opponent's turn
      if (prevRoom.currentTurn === opponentKey && room.currentTurn === opponentKey) {
        if ((room.rollCount || 0) > (prevRoom.rollCount || 0)) SFX.play('roll');
        else if (JSON.stringify(prevRoom.heldDice || {}) !== JSON.stringify(room.heldDice || {})) SFX.play('hold');
      }
    }

    // Handle disconnection with 10s auto-win countdown
    if (oppData.connected === false && room.status === 'playing') {
      UI.showDisconnectOverlay(true);
      if (!disconnectTimerId) startDisconnectCountdown();
    } else {
      UI.showDisconnectOverlay(false);
      clearDisconnectTimer();
    }

    // Handle draw proposal
    if (room.drawProposal && room.status === 'playing') {
      if (room.drawProposal.proposedBy !== localPlayerKey) {
        UI.showDrawProposal(true);
      } else {
        UI.showDrawPending(true);
      }
    } else {
      UI.showDrawProposal(false);
      UI.showDrawPending(false);

      // Detect draw rejection: previously had our proposal, now gone, game still playing
      if (prevRoom && prevRoom.drawProposal &&
          prevRoom.drawProposal.proposedBy === localPlayerKey &&
          room.status === 'playing') {
        var _I18n = window.YachtGame.I18n;
        UI.showToast(_I18n ? _I18n.t('draw_declined') : 'Opponent declined the draw.');
      }
    }

    // Skip re-render if only non-game-state fields changed (e.g. emotes)
    if (prevRoom && prevRoom.status === room.status &&
        prevRoom.currentTurn === room.currentTurn &&
        prevRoom.rollCount === room.rollCount &&
        JSON.stringify(prevRoom.dice) === JSON.stringify(room.dice) &&
        JSON.stringify(prevRoom.heldDice) === JSON.stringify(room.heldDice) &&
        JSON.stringify(prevRoom.players && prevRoom.players.player1 && prevRoom.players.player1.scores) ===
        JSON.stringify(room.players && room.players.player1 && room.players.player1.scores) &&
        JSON.stringify(prevRoom.players && prevRoom.players.player2 && prevRoom.players.player2.scores) ===
        JSON.stringify(room.players && room.players.player2 && room.players.player2.scores)) {
      return;
    }

    // Game over check
    if (room.status === 'finished') {
      UI.showScreen('screen-gameover');
      var p1 = room.players.player1;
      var p2 = room.players.player2;
      var goP1Name = resolvePlayerName(p1, 'Player 1');
      var goP2Name = resolvePlayerName(p2, 'Player 2');
      var Auth = window.YachtGame.Auth;
      if (localPlayerKey === 'player1' && Auth && Auth.getPlayerName) goP1Name = Auth.getPlayerName() || goP1Name;
      if (localPlayerKey === 'player2' && Auth && Auth.getPlayerName) goP2Name = Auth.getPlayerName() || goP2Name;
      UI.renderGameOver(
        goP1Name, goP2Name,
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
    UI.updateTurnIndicator(isMyTurn, resolvePlayerName(oppData, 'Opponent'));

    // Update roll counter
    UI.updateRollCounter(room.rollCount || 0);

    // Render dice (heldDice is the single source of truth for held state)
    var diceState = [];
    var heldData = room.heldDice || {};
    for (var i = 0; i < 5; i++) {
      var d = room.dice[i] || { value: 0, held: false };
      diceState.push({ value: d.value, held: heldData[i] === true });
    }

    // Opponent roll animation: show spinning before revealing values
    var oppRolled = !isMyTurn && prevRoom && prevRoom.currentTurn === room.currentTurn &&
        (room.rollCount || 0) > (prevRoom.rollCount || 0);
    if (oppRolled && !isRolling) {
      isRolling = true;
      var dieEls = document.querySelectorAll('.die');
      var oppSpinTimers = [];
      for (var i = 0; i < 5; i++) {
        if (heldData[i] === true) continue;
        (function (idx) {
          var el = dieEls[idx];
          el.classList.add('rolling');
          var timer = setInterval(function () {
            Dice.renderDie(el, Math.ceil(Math.random() * 6));
          }, 80);
          oppSpinTimers.push({ idx: idx, timer: timer });
        })(i);
      }
      var oppFinalValues = [];
      for (var fi = 0; fi < 5; fi++) oppFinalValues.push(diceState[fi].value);
      var oppDiceState = diceState;
      setTimeout(function () {
        Dice.staggerStop(oppSpinTimers, dieEls, oppFinalValues, function () {
          Dice.renderAll(oppDiceState);
          isRolling = false;
          checkCelebration(oppFinalValues);
          // Render scorecard now that all dice have stopped
          if (lastRoomData) {
            var r = lastRoomData;
            var _ds = [];
            var _hd = r.heldDice || {};
            for (var k = 0; k < 5; k++) {
              var _dd = r.dice[k] || { value: 0, held: false };
              _ds.push({ value: _dd.value, held: _hd[k] === true });
            }
            var _currentDice = Dice.getDiceValues(_ds);
            var _isMyTurn = r.currentTurn === localPlayerKey;
            var _Auth = window.YachtGame.Auth;
            var _p1Data = r.players.player1;
            var _p2Data = r.players.player2;
            var _p1Name = resolvePlayerName(_p1Data, 'Player 1');
            var _p2Name = resolvePlayerName(_p2Data, 'Player 2');
            if (localPlayerKey === 'player1' && _Auth && _Auth.getPlayerName) _p1Name = _Auth.getPlayerName() || _p1Name;
            if (localPlayerKey === 'player2' && _Auth && _Auth.getPlayerName) _p2Name = _Auth.getPlayerName() || _p2Name;
            var _myData = r.players[localPlayerKey] || {};
            var _oppData = r.players[localPlayerKey === 'player1' ? 'player2' : 'player1'] || {};
            UI.renderScorecard(
              (_p1Data && _p1Data.scores) || {},
              (_p2Data && _p2Data.scores) || {},
              r.gameMode,
              _currentDice,
              _isMyTurn,
              localPlayerKey,
              _p1Name, _p2Name,
              _myData.lastCategory || null,
              _oppData.lastCategory || null,
              r.rollCount > 0,
              (_myData.diceSkin) || 'classic',
              (_oppData.diceSkin) || 'classic'
            );
          }
        });
      }, 400);
    } else if (!isRolling) {
      Dice.renderAll(diceState);
    }

    // Set dice interactivity (can only hold after first roll and during your turn)
    Dice.setInteractive(isMyTurn && room.rollCount > 0);

    // Roll button state
    UI.setRollButtonEnabled(isMyTurn && (room.rollCount || 0) < 3 && !isRolling, isMyTurn, room.rollCount || 0);

    // Render scorecard (skip during rolling animation — staggerStop callback will render)
    if (!isRolling) {
      var currentDice = Dice.getDiceValues(diceState);
      var Auth = window.YachtGame.Auth;
      var p1Data = room.players.player1;
      var p2Data = room.players.player2;
      var p1Name = resolvePlayerName(p1Data, 'Player 1');
      var p2Name = resolvePlayerName(p2Data, 'Player 2');
      // Override my own name with Auth (has latest language nickname)
      if (localPlayerKey === 'player1' && Auth && Auth.getPlayerName) p1Name = Auth.getPlayerName() || p1Name;
      if (localPlayerKey === 'player2' && Auth && Auth.getPlayerName) p2Name = Auth.getPlayerName() || p2Name;
      UI.renderScorecard(
        (p1Data && p1Data.scores) || {},
        (p2Data && p2Data.scores) || {},
        gameMode,
        currentDice,
        isMyTurn,
        localPlayerKey,
        p1Name, p2Name,
        myData.lastCategory || null,
        oppData.lastCategory || null,
        room.rollCount > 0,
        (myData && myData.diceSkin) || 'classic',
        (oppData && oppData.diceSkin) || 'classic'
      );
    }

    // Celebration check: all 5 dice show the same value
    if (!isRolling) {
      checkCelebration(currentDice);
    }

    // Celebration check: Yahtzee upper bonus achieved
    if (gameMode === 'yahtzee') {
      var players = ['player1', 'player2'];
      for (var pi = 0; pi < players.length; pi++) {
        var pk = players[pi];
        var pScores = (room.players[pk] && room.players[pk].scores) || {};
        if (!celebratedBonuses[pk] && Scoring.upperBonus(pScores) > 0) {
          celebratedBonuses[pk] = true;
          var bonusSkin = (room.players[pk] && room.players[pk].diceSkin) || 'classic';
          UI.showConfetti(bonusSkin);
        }
      }
    }
  }

  function rollDice() {
    if (!lastRoomData || isRolling) return;
    if (!isOnline) { var _I18n = window.YachtGame.I18n; window.YachtGame.UI.showToast(_I18n ? _I18n.t('offline_status') : 'You are offline.'); return; }

    var room = lastRoomData;
    if (room.currentTurn !== localPlayerKey) return;
    if ((room.rollCount || 0) >= 3) return;

    isRolling = true;
    if (window.YachtGame.SFX) window.YachtGame.SFX.play('roll');
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

    function stopAllSpinners() {
      for (var s = 0; s < spinTimers.length; s++) {
        spinTimers[s].running = false;
        dieEls[spinTimers[s].idx].classList.remove('rolling');
      }
    }

    for (var i = 0; i < 5; i++) {
      if (heldFlags[i]) continue;
      (function (idx) {
        var el = dieEls[idx];
        el.classList.add('rolling');
        var entry = { idx: idx, running: true };
        var lastRender = 0;

        function spin(timestamp) {
          if (!entry.running) return;
          if (timestamp - lastRender >= 80) {
            window.YachtGame.Dice.renderDie(el, Math.ceil(Math.random() * 6));
            lastRender = timestamp;
          }
          requestAnimationFrame(spin);
        }
        requestAnimationFrame(spin);
        spinTimers.push(entry);
      })(i);
    }

    var rollRequestPending = true;
    var rollSafetyTimer = setTimeout(function () {
      // Safety: stop spinning and render from lastRoomData
      stopAllSpinners();
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

      // Stop spinning with stagger and render server's actual values
      var hd = lastRoomData ? (lastRoomData.heldDice || {}) : {};
      var finalState = [];
      var finalValues = [];
      for (var j = 0; j < 5; j++) {
        var sd = serverDice[j] || { value: 0, held: false };
        finalState.push({ value: sd.value, held: hd[j] === true });
        finalValues.push(sd.value);
      }
      window.YachtGame.Dice.staggerStop(spinTimers, dieEls, finalValues, function () {
        window.YachtGame.Dice.renderAll(finalState);
        isRolling = false;
        checkCelebration(finalValues);
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
        var _Auth = window.YachtGame.Auth;
        var _oppKey = localPlayerKey === 'player1' ? 'player2' : 'player1';
        var _p1Data = lastRoomData.players.player1;
        var _p2Data = lastRoomData.players.player2;
        var _p1Name = resolvePlayerName(_p1Data, 'Player 1');
        var _p2Name = resolvePlayerName(_p2Data, 'Player 2');
        if (localPlayerKey === 'player1' && _Auth && _Auth.getPlayerName) _p1Name = _Auth.getPlayerName() || _p1Name;
        if (localPlayerKey === 'player2' && _Auth && _Auth.getPlayerName) _p2Name = _Auth.getPlayerName() || _p2Name;
        window.YachtGame.UI.renderScorecard(
          (_p1Data && _p1Data.scores) || {},
          (_p2Data && _p2Data.scores) || {},
          lastRoomData.gameMode,
          currentDice,
          isMyTurn,
          localPlayerKey,
          _p1Name, _p2Name,
          (lastRoomData.players[localPlayerKey] && lastRoomData.players[localPlayerKey].lastCategory) || null,
          (lastRoomData.players[localPlayerKey === 'player1' ? 'player2' : 'player1'] && lastRoomData.players[localPlayerKey === 'player1' ? 'player2' : 'player1'].lastCategory) || null,
          lastRoomData.rollCount > 0,
          (lastRoomData.players[localPlayerKey] && lastRoomData.players[localPlayerKey].diceSkin) || 'classic',
          (lastRoomData.players[localPlayerKey === 'player1' ? 'player2' : 'player1'] && lastRoomData.players[localPlayerKey === 'player1' ? 'player2' : 'player1'].diceSkin) || 'classic'
        );
      }
      });
    }).catch(function (error) {
      rollRequestPending = false;
      clearTimeout(rollSafetyTimer);
      stopAllSpinners();
      isRolling = false;
      console.error('rollDice error:', error);
      window.YachtGame.UI.showToast('Roll failed: ' + (error.message || 'Unknown error'));
    });
  }

  function toggleHold(index) {
    if (!lastRoomData) return;
    if (!isOnline) return;
    var room = lastRoomData;
    if (room.currentTurn !== localPlayerKey) return;
    if ((room.rollCount || 0) < 1) return; // Can't hold before first roll

    if (window.YachtGame.SFX) window.YachtGame.SFX.play('hold');

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
    if (!isOnline) { var _I18n = window.YachtGame.I18n; window.YachtGame.UI.showToast(_I18n ? _I18n.t('offline_status') : 'You are offline.'); return; }
    var myScores = lastRoomData.players[localPlayerKey].scores || {};
    if (myScores[category] !== null && myScores[category] !== undefined) return;

    if (pendingCategory === category) {
      if (window.YachtGame.SFX) window.YachtGame.SFX.play('confirm');
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
    window.YachtGame.UI.showCellLoading(category);

    // Call Cloud Function — server calculates score and updates game state
    selectCategoryFn({ roomCode: roomCode, category: category }).then(function (result) {
      isWriting = false;
      if (result.data && result.data.yahtzeeBonus) {
        window.YachtGame.UI.showToast('Yahtzee Bonus! +100');
      }
    }).catch(function (error) {
      isWriting = false;
      window.YachtGame.UI.hideCellLoading();
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
      // The Firebase listener will detect status: "finished" and show gameover screen
      leaveGameFn({ roomCode: roomCode }).catch(function (error) {
        console.error('leaveGame error:', error);
        // On error, fall back to lobby
        destroy();
        window.YachtGame.Lobby.clearSession();
        window.YachtGame.UI.showScreen('screen-lobby');
      });
    } else {
      destroy();
      window.YachtGame.Lobby.clearSession();
      window.YachtGame.UI.showScreen('screen-lobby');
    }
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
    if (connectedRef && connectedCallback) {
      connectedRef.off('value', connectedCallback);
    }
    connectedRef = null;
    connectedCallback = null;
    isOnline = true;
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
    roomListener = null;
    emoteListener = null;
    lastSeenEmoteTs = 0;
    lastCelebrationTs = 0;
    celebratedBonuses = {};
    clearDisconnectTimer();
    // Restore player's own skin
    var DiceSkins = window.YachtGame.DiceSkins;
    if (DiceSkins) DiceSkins.loadSkin();
  }

  function proposeDraw() {
    if (!roomCode) return;
    getFunctions();
    proposeDrawFn({ roomCode: roomCode }).catch(function (err) {
      console.error('proposeDraw error:', err);
      window.YachtGame.UI.showDrawPending(false);
      var I18n = window.YachtGame.I18n;
      window.YachtGame.UI.showToast(I18n ? I18n.t('draw_failed') : '무승부 제안에 실패했습니다');
    });
  }

  function respondToDraw(accept) {
    if (!roomCode) return;
    getFunctions();
    respondToDrawFn({ roomCode: roomCode, accept: accept }).catch(function (err) {
      console.error('respondToDraw error:', err);
      var I18n = window.YachtGame.I18n;
      window.YachtGame.UI.showToast(I18n ? I18n.t('draw_response_failed') : 'Failed to respond to draw.');
    });
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
    isRolling: function () { return isRolling; },
    proposeDraw: proposeDraw,
    respondToDraw: respondToDraw,
    resolvePlayerName: resolvePlayerName,
    refreshUI: function () {
      if (!lastRoomData) return;
      var room = lastRoomData;

      // Game over screen refresh
      if (room.status === 'finished') {
        var _p1 = room.players.player1;
        var _p2 = room.players.player2;
        var _Auth = window.YachtGame.Auth;
        var _p1N = resolvePlayerName(_p1, 'Player 1');
        var _p2N = resolvePlayerName(_p2, 'Player 2');
        if (localPlayerKey === 'player1' && _Auth && _Auth.getPlayerName) _p1N = _Auth.getPlayerName() || _p1N;
        if (localPlayerKey === 'player2' && _Auth && _Auth.getPlayerName) _p2N = _Auth.getPlayerName() || _p2N;
        window.YachtGame.UI.renderGameOver(
          _p1N, _p2N,
          _p1.scores || {}, _p2.scores || {},
          room.gameMode, room.winner, localPlayerKey
        );
        return;
      }
      var myData = room.players[localPlayerKey] || {};
      var oppKey = localPlayerKey === 'player1' ? 'player2' : 'player1';
      var oppData = room.players[oppKey] || {};
      var isMyTurn = room.currentTurn === localPlayerKey;
      var diceState = [];
      for (var i = 0; i < 5; i++) {
        var d = (room.dice && room.dice[i]) || { value: 0, held: false };
        var h = room.heldDice && room.heldDice[i];
        diceState.push({ value: d.value || 0, held: !!h });
      }
      var currentDice = window.YachtGame.Dice.getDiceValues(diceState);
      var Auth = window.YachtGame.Auth;
      var p1Data = room.players.player1;
      var p2Data = room.players.player2;
      var p1Name = resolvePlayerName(p1Data, 'Player 1');
      var p2Name = resolvePlayerName(p2Data, 'Player 2');
      if (localPlayerKey === 'player1' && Auth && Auth.getPlayerName) p1Name = Auth.getPlayerName() || p1Name;
      if (localPlayerKey === 'player2' && Auth && Auth.getPlayerName) p2Name = Auth.getPlayerName() || p2Name;
      window.YachtGame.UI.renderScorecard(
        (p1Data && p1Data.scores) || {}, (p2Data && p2Data.scores) || {},
        room.gameMode, currentDice, isMyTurn, localPlayerKey,
        p1Name, p2Name,
        myData.lastCategory || null, oppData.lastCategory || null,
        room.rollCount > 0,
        (myData.diceSkin) || 'classic', (oppData.diceSkin) || 'classic'
      );
    }
  };
})();
