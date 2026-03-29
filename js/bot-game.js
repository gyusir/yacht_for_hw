// Bot game controller: local state, turn flow, animations, emote triggers
(function () {
  'use strict';

  window.YachtGame = window.YachtGame || {};

  // ─── Module State ───

  var roomData = null;
  var difficulty = null;
  var isAnimating = false;
  var pendingCategory = null;
  var lastCelebrationKey = null;
  var celebratedBonuses = {};
  var timerIds = [];
  var idleTimerId = null;
  var lastBotEmoteTime = 0;
  var turnCount = 0;

  var BOT_EMOTE_COOLDOWN = 4000;
  var IDLE_TIMEOUT = 10000;

  // ─── Emote Trigger Definitions ───

  var EMOTE_TRIGGERS = {
    game_start:     { basic: 0.80, gambler: 0.90, pool: ['\u{1F9CA} 쿨하게 가자', '\u{1F3AF} 계획대로'] },
    bot_yacht:      { basic: 0.90, gambler: 0.95, pool: ['\u{1F525} 실화냐?', '\u{1F451} 왕이 납신다'] },
    bot_high:       { basic: 0.40, gambler: 0.60, pool: ['\u{1F60E} 게임 쉽네요', '\u{1F3AF} 계획대로'] },
    bot_zero:       { basic: 0.30, gambler: 0.50, pool: ['\u{1F926} 말도 안돼', '\u{1F62D} 봐줘요...'] },
    player_yacht:   { basic: 0.50, gambler: 0.70, pool: ['\u{1F631} 헐 대박', '\u{1F340} 운 좋았을 뿐~'] },
    player_zero:    { basic: 0.40, gambler: 0.55, pool: ['\u{1F60E} 게임 쉽네요', '\u2753 그게 최선?'] },
    player_low:     { basic: 0.25, gambler: 0.40, pool: ['\u2753 그게 최선?', '\u{1F914} Hmm...'] },
    bot_leading:    { basic: 0.15, gambler: 0.30, pool: ['\u{1F60E} 게임 쉽네요', '\u{1F451} 왕이 납신다'] },
    bot_losing:     { basic: 0.20, gambler: 0.35, pool: ['\u{1F62D} 봐줘요...', '\u{1F9CA} 쿨하게 가자'] },
    player_slow:    { basic: 0.10, gambler: 0.25, pool: ['\u{1F422} 좀 빨리~', '\u{1F971} 하품 나온다~'] },
    game_end_win:   { basic: 0.70, gambler: 0.85, pool: ['\u{1F60E} 게임 쉽네요', '\u{1F451} 왕이 납신다', '\u{1F44B} Nice try!'] },
    game_end_lose:  { basic: 0.60, gambler: 0.75, pool: ['\u{1F926} 말도 안돼', '\u{1F340} 운 좋았을 뿐~'] }
  };

  // ─── Helpers ───

  function addTimer(fn, ms) {
    var id = setTimeout(fn, ms);
    timerIds.push(id);
    return id;
  }

  function clearAllTimers() {
    for (var i = 0; i < timerIds.length; i++) clearTimeout(timerIds[i]);
    timerIds = [];
    if (idleTimerId) { clearTimeout(idleTimerId); idleTimerId = null; }
  }

  function randRange(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  function getDiceValues() {
    var vals = [];
    for (var i = 0; i < 5; i++) {
      vals.push(roomData.dice[i] ? roomData.dice[i].value : 0);
    }
    return vals;
  }

  function getDiceState() {
    var state = [];
    var hd = roomData.heldDice || {};
    for (var i = 0; i < 5; i++) {
      var d = roomData.dice[i] || { value: 0, held: false };
      state.push({ value: d.value, held: hd[i] === true });
    }
    return state;
  }

  function buildEmptyScores(gameMode) {
    var scores = { _init: true };
    if (gameMode === 'yahtzee') scores.yahtzeeBonus = 0;
    return scores;
  }

  function getMyScores() { return roomData.players.player1.scores || {}; }
  function getBotScores() { return roomData.players.player2.scores || {}; }

  // ─── Emote System ───

  function tryBotEmote(event) {
    var now = Date.now();
    if (now - lastBotEmoteTime < BOT_EMOTE_COOLDOWN) return;

    var trigger = EMOTE_TRIGGERS[event];
    if (!trigger) return;

    var prob = difficulty === 'gambler' ? trigger.gambler : trigger.basic;
    if (Math.random() > prob) return;

    var emote = trigger.pool[Math.floor(Math.random() * trigger.pool.length)];
    lastBotEmoteTime = now;

    addTimer(function () {
      var UI = window.YachtGame.UI;
      if (UI) UI.showEmoteBubble('opp', emote);
    }, randRange(300, 800));
  }

  function resetIdleTimer() {
    if (idleTimerId) clearTimeout(idleTimerId);
    if (!roomData || roomData.currentTurn !== 'player1') return;
    idleTimerId = setTimeout(function () {
      tryBotEmote('player_slow');
      // Reset for another trigger after 15s
      idleTimerId = setTimeout(function () {
        tryBotEmote('player_slow');
      }, 15000);
    }, IDLE_TIMEOUT);
  }

  // ─── State Rendering ───

  function onStateUpdate() {
    if (!roomData) return;

    var UI = window.YachtGame.UI;
    var Dice = window.YachtGame.Dice;
    var Scoring = window.YachtGame.Scoring;
    var DiceSkins = window.YachtGame.DiceSkins;

    var isMyTurn = roomData.currentTurn === 'player1';
    var myData = roomData.players.player1;
    var oppData = roomData.players.player2;

    // Game over check
    if (roomData.status === 'finished') {
      UI.showScreen('screen-gameover');
      UI.renderGameOver(
        myData.name, oppData.name,
        myData.scores || {}, oppData.scores || {},
        roomData.gameMode, roomData.winner, 'player1'
      );
      saveResult();
      return;
    }

    // Ensure game screen
    UI.showScreen('screen-game', roomData.gameMode);

    // Dice skin: always show current turn player's skin
    if (DiceSkins) {
      var turnPlayer = roomData.currentTurn === 'player1' ? myData : oppData;
      DiceSkins.applySkin((turnPlayer && turnPlayer.diceSkin) || 'classic');
    }

    UI.updateTurnIndicator(isMyTurn, oppData.name || 'Bot');
    UI.updateRollCounter(roomData.rollCount || 0);

    // Render dice
    if (!isAnimating) {
      Dice.renderAll(getDiceState());
    }
    Dice.setInteractive(isMyTurn && roomData.rollCount > 0);

    // Roll button
    UI.setRollButtonEnabled(
      isMyTurn && (roomData.rollCount || 0) < 3 && !isAnimating,
      isMyTurn,
      roomData.rollCount || 0
    );

    // Scorecard
    var currentDice = getDiceValues();
    UI.renderScorecard(
      myData.scores || {},
      oppData.scores || {},
      roomData.gameMode,
      currentDice,
      isMyTurn,
      'player1',
      myData.name || 'You',
      oppData.name || 'Bot',
      myData.lastCategory || null,
      oppData.lastCategory || null,
      roomData.rollCount > 0,
      (myData && myData.diceSkin) || 'classic',
      (oppData && oppData.diceSkin) || 'classic'
    );

    // Celebration: all 5 dice same value
    if (!isAnimating && roomData.rollCount > 0) {
      var dv = currentDice;
      if (dv[0] > 0 && dv[0] === dv[1] && dv[1] === dv[2] && dv[2] === dv[3] && dv[3] === dv[4]) {
        var ck = roomData.currentTurn + '_' + roomData.rollCount;
        if (ck !== lastCelebrationKey) {
          lastCelebrationKey = ck;
          UI.showConfetti();
        }
      }
    }

    // Yahtzee upper bonus celebration
    if (roomData.gameMode === 'yahtzee') {
      var players = ['player1', 'player2'];
      for (var pi = 0; pi < players.length; pi++) {
        var pk = players[pi];
        var pScores = (roomData.players[pk] && roomData.players[pk].scores) || {};
        if (!celebratedBonuses[pk] && Scoring.upperBonus(pScores) > 0) {
          celebratedBonuses[pk] = true;
          UI.showConfetti();
        }
      }
    }
  }

  // ─── Player Turn Functions ───

  function rollDice() {
    if (!roomData || isAnimating) return;
    if (roomData.currentTurn !== 'player1') return;
    if ((roomData.rollCount || 0) >= 3) return;

    resetIdleTimer();
    isAnimating = true;

    var UI = window.YachtGame.UI;
    var Dice = window.YachtGame.Dice;
    var DiceSkins = window.YachtGame.DiceSkins;

    UI.setRollButtonEnabled(false, true);

    // Apply player skin
    if (DiceSkins) {
      var myData = roomData.players.player1;
      DiceSkins.applySkin((myData && myData.diceSkin) || 'classic');
    }

    // Determine held dice
    var hd = roomData.heldDice || {};
    var heldFlags = [];
    for (var i = 0; i < 5; i++) heldFlags.push(hd[i] === true);

    // Generate new values
    var newValues = [];
    for (var i = 0; i < 5; i++) {
      if (heldFlags[i] && roomData.dice[i] && roomData.dice[i].value >= 1) {
        newValues.push(roomData.dice[i].value);
      } else {
        newValues.push(Math.floor(Math.random() * 6) + 1);
      }
    }

    // Spinning animation on unheld dice
    var dieEls = document.querySelectorAll('.die');
    var spinTimers = [];
    for (var i = 0; i < 5; i++) {
      if (heldFlags[i]) continue;
      (function (idx) {
        var el = dieEls[idx];
        el.classList.add('rolling');
        var timer = setInterval(function () {
          Dice.renderDie(el, Math.ceil(Math.random() * 6));
        }, 50);
        spinTimers.push({ idx: idx, timer: timer });
      })(i);
    }

    // Stop after 400ms and show final values
    addTimer(function () {
      for (var s = 0; s < spinTimers.length; s++) {
        clearInterval(spinTimers[s].timer);
        dieEls[spinTimers[s].idx].classList.remove('rolling');
      }

      // Update state
      for (var i = 0; i < 5; i++) {
        roomData.dice[i] = { value: newValues[i], held: hd[i] === true };
      }
      roomData.rollCount = (roomData.rollCount || 0) + 1;

      isAnimating = false;
      onStateUpdate();
    }, 400);
  }

  function toggleHold(index) {
    if (!roomData) return;
    if (roomData.currentTurn !== 'player1') return;
    if ((roomData.rollCount || 0) < 1) return;

    resetIdleTimer();

    var hd = roomData.heldDice || {};
    var isCurrentlyHeld = hd[index] === true;
    var newHeld = !isCurrentlyHeld;

    if (!roomData.heldDice) roomData.heldDice = {};
    roomData.heldDice[index] = newHeld;

    // Immediate DOM update
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
    if (!roomData) return;
    var myScores = roomData.players.player1.scores || {};
    if (myScores[category] !== null && myScores[category] !== undefined) return;

    if (pendingCategory === category) {
      selectCategory('player1', category);
      pendingCategory = null;
    } else {
      pendingCategory = category;
      window.YachtGame.UI.showScoreConfirmHint(category);
    }
  }

  function selectCategory(playerKey, category) {
    if (!roomData) return;
    var Scoring = window.YachtGame.Scoring;

    var diceValues = getDiceValues();
    var score = Scoring.calculate(diceValues, category, roomData.gameMode);

    // Update scores
    var player = roomData.players[playerKey];
    player.scores[category] = score;
    player.lastCategory = category;

    // Yahtzee bonus check
    if (roomData.gameMode === 'yahtzee') {
      var allSame = true;
      for (var i = 1; i < 5; i++) {
        if (diceValues[i] !== diceValues[0]) { allSame = false; break; }
      }
      if (allSame && diceValues[0] > 0 && player.scores.yahtzee === 50 && category !== 'yahtzee') {
        player.scores.yahtzeeBonus = (player.scores.yahtzeeBonus || 0) + 100;
        if (playerKey === 'player1') {
          window.YachtGame.UI.showToast('Yahtzee Bonus! +100');
        }
      }
    }

    // Celebration flag
    if ((category === 'yacht' || category === 'yahtzee') && score === 50) {
      window.YachtGame.UI.showConfetti();
    }

    // Check emote triggers for the category just scored
    if (playerKey === 'player1') {
      // Player just scored
      if (score === 0) tryBotEmote('player_zero');
      else if (score <= 5) tryBotEmote('player_low');
      if ((category === 'yacht' || category === 'yahtzee') && score === 50) tryBotEmote('player_yacht');
    } else {
      // Bot just scored
      if (score === 0) tryBotEmote('bot_zero');
      else if (score >= 25) tryBotEmote('bot_high');
      if ((category === 'yacht' || category === 'yahtzee') && score === 50) tryBotEmote('bot_yacht');
    }

    // Switch turn
    var oppKey = playerKey === 'player1' ? 'player2' : 'player1';
    roomData.currentTurn = oppKey;
    roomData.rollCount = 0;
    roomData.heldDice = {};
    for (var i = 0; i < 5; i++) {
      roomData.dice[i] = { value: 0, held: false };
    }
    pendingCategory = null;

    // Check game over
    var myScores = roomData.players.player1.scores;
    var botScores = roomData.players.player2.scores;
    if (Scoring.allFilled(myScores, roomData.gameMode) && Scoring.allFilled(botScores, roomData.gameMode)) {
      var myTotal = Scoring.totalScore(myScores, roomData.gameMode, myScores.yahtzeeBonus);
      var botTotal = Scoring.totalScore(botScores, roomData.gameMode, botScores.yahtzeeBonus);
      if (myTotal > botTotal) roomData.winner = 'player1';
      else if (botTotal > myTotal) roomData.winner = 'player2';
      else roomData.winner = 'tie';
      roomData.status = 'finished';

      // End-game emote
      if (roomData.winner === 'player2') tryBotEmote('game_end_win');
      else if (roomData.winner === 'player1') tryBotEmote('game_end_lose');

      onStateUpdate();
      return;
    }

    // Score differential emote
    var Scoring2 = window.YachtGame.Scoring;
    var myT = Scoring2.totalScore(myScores, roomData.gameMode, myScores.yahtzeeBonus);
    var botT = Scoring2.totalScore(botScores, roomData.gameMode, botScores.yahtzeeBonus);
    if (botT - myT >= 30) tryBotEmote('bot_leading');
    else if (myT - botT >= 30) tryBotEmote('bot_losing');

    onStateUpdate();

    // If it's now bot's turn, start bot turn
    if (roomData.currentTurn === 'player2') {
      startBotTurn();
    } else {
      resetIdleTimer();
    }
  }

  // ─── Bot Turn ───

  function startBotTurn() {
    if (!roomData || roomData.status === 'finished') return;
    turnCount++;

    // Game start emote on first bot turn
    if (turnCount === 1) tryBotEmote('game_start');

    var thinkDelay = difficulty === 'gambler' ? randRange(1000, 1500) : randRange(600, 1000);
    addTimer(function () { botRoll(); }, thinkDelay);
  }

  function botRoll() {
    if (!roomData || roomData.status === 'finished' || roomData.currentTurn !== 'player2') return;

    isAnimating = true;
    var UI = window.YachtGame.UI;
    var Dice = window.YachtGame.Dice;
    var DiceSkins = window.YachtGame.DiceSkins;

    // Apply bot's skin
    var botData = roomData.players.player2;
    if (DiceSkins) DiceSkins.applySkin((botData && botData.diceSkin) || 'classic');

    // Determine held dice
    var hd = roomData.heldDice || {};
    var heldFlags = [];
    for (var i = 0; i < 5; i++) heldFlags.push(hd[i] === true);

    // Generate new values
    var newValues = [];
    for (var i = 0; i < 5; i++) {
      if (heldFlags[i] && roomData.dice[i] && roomData.dice[i].value >= 1) {
        newValues.push(roomData.dice[i].value);
      } else {
        newValues.push(Math.floor(Math.random() * 6) + 1);
      }
    }

    // Spinning animation
    var dieEls = document.querySelectorAll('.die');
    var spinTimers = [];
    for (var i = 0; i < 5; i++) {
      if (heldFlags[i]) continue;
      (function (idx) {
        var el = dieEls[idx];
        el.classList.add('rolling');
        var timer = setInterval(function () {
          Dice.renderDie(el, Math.ceil(Math.random() * 6));
        }, 50);
        spinTimers.push({ idx: idx, timer: timer });
      })(i);
    }

    addTimer(function () {
      for (var s = 0; s < spinTimers.length; s++) {
        clearInterval(spinTimers[s].timer);
        dieEls[spinTimers[s].idx].classList.remove('rolling');
      }

      for (var i = 0; i < 5; i++) {
        roomData.dice[i] = { value: newValues[i], held: hd[i] === true };
      }
      roomData.rollCount = (roomData.rollCount || 0) + 1;
      isAnimating = false;

      onStateUpdate();

      // Bot evaluates after rolling
      var evalDelay = difficulty === 'gambler' ? randRange(700, 1000) : randRange(400, 700);
      addTimer(function () { botEvaluate(); }, evalDelay);
    }, 400);
  }

  function botEvaluate() {
    if (!roomData || roomData.status === 'finished' || roomData.currentTurn !== 'player2') return;

    var BotAI = window.YachtGame.BotAI;
    var diceValues = getDiceValues();
    var botScores = getBotScores();

    // Should we reroll?
    if (roomData.rollCount < 3 && BotAI.shouldReroll(diceValues, botScores, roomData.gameMode, difficulty, roomData.rollCount)) {
      // Decide which dice to hold
      var holds = BotAI.chooseHolds(diceValues, botScores, roomData.gameMode, difficulty, roomData.rollCount);
      botApplyHolds(holds, function () {
        var rerollDelay = difficulty === 'gambler' ? randRange(500, 800) : randRange(300, 500);
        addTimer(function () { botRoll(); }, rerollDelay);
      });
    } else {
      // Select category
      var selectDelay = difficulty === 'gambler' ? randRange(800, 1200) : randRange(500, 800);
      addTimer(function () { botSelectCategory(); }, selectDelay);
    }
  }

  function botApplyHolds(holds, callback) {
    if (!roomData) return;

    var Dice = window.YachtGame.Dice;
    var dieEls = document.querySelectorAll('.die');
    var currentHeld = roomData.heldDice || {};
    var changes = [];

    for (var i = 0; i < 5; i++) {
      var isHeld = currentHeld[i] === true;
      if (holds[i] !== isHeld) {
        changes.push({ index: i, newHeld: holds[i] });
      }
    }

    if (changes.length === 0) {
      if (callback) callback();
      return;
    }

    // Apply changes one at a time with stagger
    var applied = 0;
    for (var c = 0; c < changes.length; c++) {
      (function (change, delay) {
        addTimer(function () {
          if (!roomData) return;
          if (!roomData.heldDice) roomData.heldDice = {};
          roomData.heldDice[change.index] = change.newHeld;

          var el = dieEls[change.index];
          if (el) {
            var existing = el.querySelector('.held-check');
            if (change.newHeld) {
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

          applied++;
          if (applied === changes.length && callback) {
            callback();
          }
        }, delay);
      })(changes[c], (c + 1) * 150);
    }
  }

  function botSelectCategory() {
    if (!roomData || roomData.status === 'finished' || roomData.currentTurn !== 'player2') return;

    var BotAI = window.YachtGame.BotAI;
    var diceValues = getDiceValues();
    var botScores = getBotScores();
    var myScores = getMyScores();

    var category = BotAI.chooseCategory(diceValues, botScores, roomData.gameMode, difficulty, myScores);
    if (!category) return;

    selectCategory('player2', category);
  }

  // ─── History Save ───

  function saveResult() {
    if (!roomData || roomData.status !== 'finished') return;

    var Auth = window.YachtGame.Auth;
    if (!Auth || !Auth.isSignedIn()) return;

    var Scoring = window.YachtGame.Scoring;
    var myScores = roomData.players.player1.scores || {};
    var botScores = roomData.players.player2.scores || {};
    var myTotal = Scoring.totalScore(myScores, roomData.gameMode, myScores.yahtzeeBonus);
    var botTotal = Scoring.totalScore(botScores, roomData.gameMode, botScores.yahtzeeBonus);

    var result;
    if (roomData.winner === 'player1') result = 'win';
    else if (roomData.winner === 'tie') result = 'tie';
    else result = 'loss';

    var fns = window.YachtGame.functions;
    if (!fns) return;

    var saveFn = fns.httpsCallable('saveBotGameResult');
    saveFn({
      gameMode: roomData.gameMode,
      botDifficulty: difficulty,
      myScore: myTotal,
      oppScore: botTotal,
      result: result
    }).catch(function (err) {
      console.error('saveBotGameResult error:', err);
    });
  }

  // ─── Public Interface ───

  function init(gameMode, diff, playerName) {
    difficulty = diff;
    turnCount = 0;
    lastBotEmoteTime = 0;
    lastCelebrationKey = null;
    celebratedBonuses = {};
    pendingCategory = null;
    isAnimating = false;
    clearAllTimers();

    var Auth = window.YachtGame.Auth;
    var DiceSkins = window.YachtGame.DiceSkins;
    var uid = Auth ? Auth.getPlayerUid() : 'guest';
    var diceSkin = DiceSkins ? DiceSkins.getCurrentSkin() : 'classic';

    var botName = diff === 'gambler' ? 'Bot (Gambler)' : 'Bot (Basic)';

    roomData = {
      gameMode: gameMode,
      status: 'playing',
      currentTurn: 'player1',
      rollCount: 0,
      dice: {},
      heldDice: {},
      players: {
        player1: {
          name: playerName || 'You',
          uid: uid,
          connected: true,
          scores: buildEmptyScores(gameMode),
          diceSkin: diceSkin,
          lastCategory: null
        },
        player2: {
          name: botName,
          uid: 'bot',
          connected: true,
          scores: buildEmptyScores(gameMode),
          diceSkin: diff === 'gambler' ? 'carbon' : 'circuit',
          lastCategory: null
        }
      },
      winner: ''
    };

    for (var i = 0; i < 5; i++) {
      roomData.dice[i] = { value: 0, held: false };
    }

    window.YachtGame._isBotGame = true;

    // Load DP table for bot AI (non-blocking — game starts immediately)
    var BotAI = window.YachtGame.BotAI;
    if (BotAI && BotAI.loadDPTable && !BotAI.isReady(gameMode)) {
      BotAI.loadDPTable(gameMode, function (ok) {
        if (ok) console.log('[BotGame] DP table ready for', gameMode);
      });
    }

    onStateUpdate();
    resetIdleTimer();
  }

  function sendEmote(msg) {
    if (!roomData) return;
    window.YachtGame.UI.showEmoteBubble('mine', msg);
  }

  function leaveGame() {
    if (roomData && roomData.status === 'playing') {
      roomData.winner = 'player2';
      roomData.status = 'finished';
      saveResult();
    }
    destroy();
    window.YachtGame.Lobby.clearSession();
    window.YachtGame.UI.showScreen('screen-lobby');
  }

  function getGameMode() {
    return roomData ? roomData.gameMode : null;
  }

  function destroy() {
    clearAllTimers();
    roomData = null;
    difficulty = null;
    isAnimating = false;
    pendingCategory = null;
    lastCelebrationKey = null;
    celebratedBonuses = {};
    turnCount = 0;
    lastBotEmoteTime = 0;
    window.YachtGame._isBotGame = false;
    var DiceSkins = window.YachtGame.DiceSkins;
    if (DiceSkins) DiceSkins.loadSkin();
  }

  window.YachtGame.BotGame = {
    init: init,
    rollDice: rollDice,
    toggleHold: toggleHold,
    confirmCategory: confirmCategory,
    sendEmote: sendEmote,
    leaveGame: leaveGame,
    getGameMode: getGameMode,
    destroy: destroy,
    getPendingCategory: function () { return pendingCategory; },
    isRolling: function () { return isAnimating; }
  };
})();
