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
  var resultSaved = false;
  var turnCount = 0;

  var BOT_EMOTE_COOLDOWN = 4000;
  var IDLE_TIMEOUT = 10000;
  var botConsecutiveHigh = 0;
  var playerConsecutiveLow = 0;
  var prevScoreGap = 0;

  // ─── Emote Trigger Definitions ───

  var EMOTE_TRIGGERS = {
    game_start:       { basic: 0.80, gambler: 0.90, pool: ['\u{1F9CA} 쿨하게~', '\u{1F3AF} 계획대로', '\u{1F44A} 한판 붙자', '\u{1F60F} 봐드림', '\u{1F3B2} 주사위의 신'] },
    bot_yacht:        { basic: 0.90, gambler: 0.95, pool: ['\u{1F525} 실화냐?', '\u{1F451} 왕 납신다', '\u{1F4A5} 완벽!', '\u{1F3C6} 이게 실력', '\u{1F60E} 너무 쉬움'] },
    bot_high:         { basic: 0.40, gambler: 0.60, pool: ['\u{1F60E} 쉽네요', '\u{1F3AF} 계획대로', '\u{1F4AA} 기본이지', '\u{1F9E0} 천재?', '\u{1F4C8} 쭉쭉'] },
    bot_zero:         { basic: 0.30, gambler: 0.50, pool: ['\u{1F926} 말도 안돼', '\u{1F62D} 봐줘요', '\u{1F4A8} 잠깐 실수', '\u{1F612} 다음엔..'] },
    player_yacht:     { basic: 0.50, gambler: 0.70, pool: ['\u{1F631} 헐 대박', '\u{1F340} 운이지~', '\u{1F644} 치트 아님?', '\u{1F914} 또 나올까', '\u{1F612} 좀 치네'] },
    player_zero:      { basic: 0.40, gambler: 0.55, pool: ['\u{1F60E} 쉽네요', '\u2753 그게 최선?', '\u{1F923} ㅋㅋㅋㅋ', '\u{1F4A9} 실력?', '\u{1F622} 슬프다'] },
    player_low:       { basic: 0.25, gambler: 0.40, pool: ['\u2753 그게 최선?', '\u{1F914} Hmm..', '\u{1F9D0} 전략이..?', '\u{1F615} 에이~', '\u{1F971} 하품~'] },
    bot_leading:      { basic: 0.15, gambler: 0.30, pool: ['\u{1F60E} 쉽네요', '\u{1F451} 왕 납신다', '\u{1F3C3} 따라와~', '\u{1F4AA} 격차 벌림', '\u{1F44B} 항복?'] },
    bot_losing:       { basic: 0.20, gambler: 0.35, pool: ['\u{1F62D} 봐줘요', '\u{1F9CA} 쿨하게~', '\u{1F612} 아직이야', '\u{1F525} 역전 간다'] },
    player_slow:      { basic: 0.10, gambler: 0.25, pool: ['\u{1F422} 좀 빨리~', '\u{1F971} 하품~', '\u{23F0} 시간 간다', '\u{1F634} Zzz..', '\u{1F4A4} 자는 거?'] },
    game_end_win:     { basic: 0.70, gambler: 0.85, pool: ['\u{1F60E} 쉽네요', '\u{1F451} 왕 납신다', '\u{1F44B} GG~', '\u{1F3C6} GG', '\u{1F60F} 배웠지?'] },
    game_end_lose:    { basic: 0.60, gambler: 0.75, pool: ['\u{1F926} 말도 안돼', '\u{1F340} 운이지~', '\u{1F612} 다음엔..', '\u{1F620} 리매치!'] },
    bot_comeback:     { basic: 0.50, gambler: 0.70, pool: ['\u{1F525} 역전이다!', '\u{1F60F} 떨리지?', '\u{1F4AA} 다시 간다', '\u{1F3AF} 계획대로', '\u{1F608} 흔들리지?'] },
    player_wasted:    { basic: 0.50, gambler: 0.70, pool: ['\u{1F62C} 아까워~', '\u{1F923} 0점?!', '\u{1F4A9} 감사~', '\u{1F92D} 아닌데..', '\u{1F622} 울겠다'] },
    bot_streak:       { basic: 0.40, gambler: 0.60, pool: ['\u{1F525} 불붙었다!', '\u{1F4AA} 연속!', '\u{1F60E} 못 멈춰', '\u{1F680} 폭주 중~'] },
    player_streak_bad:{ basic: 0.35, gambler: 0.55, pool: ['\u{1F62C} 연속?!', '\u{1F914} 실력? 운?', '\u{1F4C9} 추락 중~', '\u{1F622} 눈물..'] },
    mid_game_taunt:   { basic: 0.12, gambler: 0.25, pool: ['\u{1F60F} 이 격차?', '\u{1F451} 이미 끝남', '\u{1F44B} 항복?', '\u{1F3AF} 예정된 승리'] }
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

  function getScoreGap() {
    if (!roomData) return 0;
    var Scoring = window.YachtGame.Scoring;
    var myScores = roomData.players.player1.scores || {};
    var botScores = roomData.players.player2.scores || {};
    var myT = Scoring.totalScore(myScores, roomData.gameMode, myScores.yahtzeeBonus);
    var botT = Scoring.totalScore(botScores, roomData.gameMode, botScores.yahtzeeBonus);
    return botT - myT;
  }

  function tryBotEmote(event) {
    var now = Date.now();
    if (now - lastBotEmoteTime < BOT_EMOTE_COOLDOWN) return;

    var trigger = EMOTE_TRIGGERS[event];
    if (!trigger) return;

    var prob = difficulty === 'gambler' ? trigger.gambler : trigger.basic;
    var gap = getScoreGap();
    if (gap > 50) prob = Math.min(prob * 1.3, 1.0);
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

    // Keep player name in sync with current language
    var Auth = window.YachtGame.Auth;
    if (Auth && Auth.getPlayerName) {
      myData.name = Auth.getPlayerName() || myData.name;
    }

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
    if (!roomData || !roomData.players || !roomData.players[playerKey]) return;
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
    var HIGH_VALUE_CATS = { yacht: 1, yahtzee: 1, fullHouse: 1, largeStraight: 1 };
    if (playerKey === 'player1') {
      // Player just scored
      if (score === 0) {
        tryBotEmote('player_zero');
        playerConsecutiveLow++;
        if (score === 0 && HIGH_VALUE_CATS[category]) tryBotEmote('player_wasted');
      } else if (score <= 5) {
        tryBotEmote('player_low');
        playerConsecutiveLow++;
      } else {
        playerConsecutiveLow = 0;
      }
      if (playerConsecutiveLow >= 2) tryBotEmote('player_streak_bad');
      if ((category === 'yacht' || category === 'yahtzee') && score === 50) tryBotEmote('player_yacht');
      botConsecutiveHigh = 0;
    } else {
      // Bot just scored
      if (score === 0) {
        tryBotEmote('bot_zero');
        botConsecutiveHigh = 0;
      } else if (score >= 20) {
        if (score >= 25) tryBotEmote('bot_high');
        botConsecutiveHigh++;
        if (botConsecutiveHigh >= 2) tryBotEmote('bot_streak');
      } else {
        botConsecutiveHigh = 0;
      }
      if ((category === 'yacht' || category === 'yahtzee') && score === 50) tryBotEmote('bot_yacht');
      playerConsecutiveLow = 0;
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
    var currentGap = botT - myT;
    if (currentGap >= 30) tryBotEmote('bot_leading');
    else if (currentGap <= -30) tryBotEmote('bot_losing');

    // Comeback: bot was losing by 30+ and now gap is within 15
    if (prevScoreGap <= -30 && currentGap > -15) tryBotEmote('bot_comeback');

    // Mid-game taunt: after turn 6, bot is leading
    if (turnCount >= 6 && currentGap > 0) tryBotEmote('mid_game_taunt');

    prevScoreGap = currentGap;

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
    if (idleTimerId) { clearTimeout(idleTimerId); idleTimerId = null; }
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
    if (resultSaved) return;
    if (!roomData || roomData.status !== 'finished') return;
    resultSaved = true;

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
    resultSaved = false;
    lastCelebrationKey = null;
    celebratedBonuses = {};
    pendingCategory = null;
    isAnimating = false;
    clearAllTimers();

    var Auth = window.YachtGame.Auth;
    var DiceSkins = window.YachtGame.DiceSkins;
    var uid = Auth ? Auth.getPlayerUid() : 'guest';
    var diceSkin = DiceSkins ? DiceSkins.getCurrentSkin() : 'classic';

    var botName = diff === 'gambler' ? 'Gambler Bot' : 'Basic Bot';

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
    botConsecutiveHigh = 0;
    playerConsecutiveLow = 0;
    prevScoreGap = 0;
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
    isRolling: function () { return isAnimating; },
    refreshUI: function () {
      if (!roomData) return;
      // Game over: only re-render game over screen (avoid re-triggering saveResult)
      if (roomData.status === 'finished') {
        var Auth = window.YachtGame.Auth;
        var myName = (Auth && Auth.getPlayerName) ? Auth.getPlayerName() : (roomData.players.player1.name || 'You');
        window.YachtGame.UI.renderGameOver(
          myName, roomData.players.player2.name,
          roomData.players.player1.scores || {}, roomData.players.player2.scores || {},
          roomData.gameMode, roomData.winner, 'player1'
        );
        return;
      }
      onStateUpdate();
    }
  };
})();
