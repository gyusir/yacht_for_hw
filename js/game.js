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
  var emoteListener = null;
  var lastSeenEmoteTs = 0;

  function init(code, playerKey) {
    roomCode = code;
    localPlayerKey = playerKey;
    opponentKey = playerKey === 'player1' ? 'player2' : 'player1';
    roomRef = window.YachtGame.db.ref('rooms/' + roomCode);

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
      // Save game history for signed-in users
      saveGameHistory(room);
      return;
    }

    // Ensure we're on the game screen
    if (room.status === 'playing') {
      UI.showScreen('screen-game');
    }

    var isMyTurn = room.currentTurn === localPlayerKey;

    // Apply dice skin of the current turn's player
    var DiceSkins = window.YachtGame.DiceSkins;
    if (DiceSkins) {
      var turnPlayer = room.players[room.currentTurn];
      var turnSkin = (turnPlayer && turnPlayer.diceSkin) || 'classic';
      DiceSkins.applySkin(turnSkin);
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
    UI.setRollButtonEnabled(isMyTurn && (room.rollCount || 0) < 3 && !isRolling);

    // Render scorecard
    var currentDice = Dice.getDiceValues(diceState);
    UI.renderScorecard(
      (room.players.player1 && room.players.player1.scores) || {},
      (room.players.player2 && room.players.player2.scores) || {},
      gameMode,
      currentDice,
      isMyTurn && room.rollCount > 0,
      localPlayerKey,
      (room.players.player1 && room.players.player1.name) || 'Player 1',
      (room.players.player2 && room.players.player2.name) || 'Player 2',
      myData.lastCategory || null,
      oppData.lastCategory || null
    );
  }

  function rollDice() {
    if (!lastRoomData || isRolling) return;

    var room = lastRoomData;
    if (room.currentTurn !== localPlayerKey) return;
    if ((room.rollCount || 0) >= 3) return;

    isRolling = true;
    window.YachtGame.UI.setRollButtonEnabled(false);

    // Generate new values for unheld dice
    var newDice = {};
    var diceState = [];
    for (var i = 0; i < 5; i++) {
      var current = room.dice[i] || { value: 0, held: false };
      if (current.held) {
        newDice[i] = { value: current.value, held: true };
      } else {
        newDice[i] = { value: Math.ceil(Math.random() * 6), held: false };
      }
      diceState.push(newDice[i]);
    }

    var newRollCount = (room.rollCount || 0) + 1;

    // Animate dice locally
    var dieEls = document.querySelectorAll('.die');
    window.YachtGame.Dice.animateRoll(dieEls, diceState, function () {
      isRolling = false;
      // Write to Firebase after animation
      var updates = {};
      updates['dice'] = newDice;
      updates['rollCount'] = newRollCount;
      roomRef.update(updates);
    });
  }

  function toggleHold(index) {
    if (!lastRoomData) return;
    var room = lastRoomData;
    if (room.currentTurn !== localPlayerKey) return;
    if ((room.rollCount || 0) < 1) return; // Can't hold before first roll

    var current = room.dice[index] || { value: 0, held: false };
    roomRef.child('dice/' + index + '/held').set(!current.held);
  }

  function selectCategory(category) {
    if (!lastRoomData) return;
    var room = lastRoomData;
    if (room.currentTurn !== localPlayerKey) return;
    if ((room.rollCount || 0) < 1) return; // Must roll at least once

    var myScores = room.players[localPlayerKey].scores || {};
    if (myScores[category] !== null && myScores[category] !== undefined) return; // Already filled

    var Scoring = window.YachtGame.Scoring;
    var diceValues = [];
    for (var i = 0; i < 5; i++) {
      diceValues.push(room.dice[i].value);
    }

    var score = Scoring.calculate(diceValues, category, gameMode);

    // Check for Yahtzee bonus
    var updates = {};
    updates['players/' + localPlayerKey + '/scores/' + category] = score;
    updates['players/' + localPlayerKey + '/lastCategory'] = category;

    if (gameMode === 'yahtzee') {
      var hasYahtzee = true;
      for (var i = 1; i < diceValues.length; i++) {
        if (diceValues[i] !== diceValues[0]) { hasYahtzee = false; break; }
      }
      var existingYahtzeeScore = myScores.yahtzee;
      if (hasYahtzee && existingYahtzeeScore === 50 && category !== 'yahtzee') {
        var currentBonus = myScores.yahtzeeBonus || 0;
        updates['players/' + localPlayerKey + '/scores/yahtzeeBonus'] = currentBonus + 100;
        window.YachtGame.UI.showToast('Yahtzee Bonus! +100');
      }
    }

    // Switch turn and reset dice
    updates['currentTurn'] = opponentKey;
    updates['rollCount'] = 0;
    for (var i = 0; i < 5; i++) {
      updates['dice/' + i + '/held'] = false;
      updates['dice/' + i + '/value'] = 0;
    }

    // Check if game is over after this move
    var updatedScores = Object.assign({}, myScores);
    updatedScores[category] = score;

    var oppScores = room.players[opponentKey].scores || {};
    var myAllFilled = Scoring.allFilled(updatedScores, gameMode);
    var oppAllFilled = Scoring.allFilled(oppScores, gameMode);

    if (myAllFilled && oppAllFilled) {
      // Game over
      var myTotal = Scoring.totalScore(updatedScores, gameMode, updatedScores.yahtzeeBonus);
      var oppTotal = Scoring.totalScore(oppScores, gameMode, oppScores.yahtzeeBonus);

      if (myTotal > oppTotal) {
        updates['winner'] = localPlayerKey;
      } else if (oppTotal > myTotal) {
        updates['winner'] = opponentKey;
      } else {
        updates['winner'] = 'tie';
      }
      updates['status'] = 'finished';
    }

    roomRef.update(updates);
  }

  var historySaved = false;
  function saveGameHistory(room) {
    if (historySaved) return;
    var Auth = window.YachtGame.Auth;
    if (!Auth || !Auth.isSignedIn()) return;
    historySaved = true;

    var Scoring = window.YachtGame.Scoring;
    var myData = room.players[localPlayerKey];
    var oppData = room.players[opponentKey];
    var myScores = myData.scores || {};
    var oppScores = oppData.scores || {};
    var myTotal = Scoring.totalScore(myScores, gameMode, myScores.yahtzeeBonus);
    var oppTotal = Scoring.totalScore(oppScores, gameMode, oppScores.yahtzeeBonus);

    var result;
    if (room.winner === localPlayerKey) result = 'win';
    else if (room.winner === 'tie') result = 'tie';
    else result = 'loss';

    window.YachtGame.History.saveResult(Auth.getPlayerUid(), {
      mode: gameMode,
      opponentName: oppData.name,
      myScore: myTotal,
      oppScore: oppTotal,
      result: result,
      roomCode: roomCode
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
      roomRef.update({ status: 'finished', winner: opponentKey });
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
    roomRef = null;
    roomCode = null;
    localPlayerKey = null;
    opponentKey = null;
    gameMode = null;
    lastRoomData = null;
    isRolling = false;
    emoteListener = null;
    lastSeenEmoteTs = 0;
    historySaved = false;
    // Restore player's own skin
    var DiceSkins = window.YachtGame.DiceSkins;
    if (DiceSkins) DiceSkins.loadSkin();
  }

  window.YachtGame.Game = {
    init: init,
    rollDice: rollDice,
    toggleHold: toggleHold,
    selectCategory: selectCategory,
    sendEmote: sendEmote,
    leaveGame: leaveGame,
    getGameMode: getGameMode,
    destroy: destroy
  };
})();
