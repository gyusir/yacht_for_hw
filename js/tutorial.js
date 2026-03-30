// Tutorial module: guided walkthrough using the real game UI
(function () {
  'use strict';

  window.YachtGame = window.YachtGame || {};

  var currentStep = -1;
  var active = false;
  var mockRoomData = null;
  var returnScreen = 'screen-login';

  var STEPS = [
    {
      id: 'intro',
      highlight: null,
      msgKey: 'tut_intro',
      action: 'next'
    },
    {
      id: 'scorecard',
      highlight: '#scorecard',
      msgKey: 'tut_scorecard',
      action: 'next'
    },
    {
      id: 'dice',
      highlight: '.dice-roll-row',
      msgKey: 'tut_dice',
      action: 'next'
    },
    {
      id: 'roll',
      highlight: '#btn-roll',
      msgKey: 'tut_roll',
      action: 'roll'
    },
    {
      id: 'hold',
      highlight: '#dice-area',
      msgKey: 'tut_hold',
      action: 'hold'
    },
    {
      id: 'reroll',
      highlight: '#btn-roll',
      msgKey: 'tut_reroll',
      action: 'roll'
    },
    {
      id: 'scoring',
      highlight: '#scorecard',
      msgKey: 'tut_scoring',
      action: 'score'
    },
    {
      id: 'summary',
      highlight: null,
      msgKey: 'tut_summary',
      action: 'finish'
    }
  ];

  function t(key) {
    var I18n = window.YachtGame.I18n;
    return I18n ? I18n.t(key) : key;
  }

  function buildMockRoom() {
    var Scoring = window.YachtGame.Scoring;
    mockRoomData = {
      gameMode: 'yacht',
      status: 'playing',
      currentTurn: 'player1',
      rollCount: 0,
      dice: {},
      heldDice: {},
      players: {
        player1: {
          name: t('tut_you') || 'You',
          uid: 'tutorial',
          connected: true,
          scores: { _init: true },
          diceSkin: 'classic',
          lastCategory: null
        },
        player2: {
          name: t('tut_opponent') || 'Opponent',
          uid: 'tutorial-opp',
          connected: true,
          scores: { _init: true },
          diceSkin: 'classic',
          lastCategory: null
        }
      },
      winner: ''
    };
    for (var i = 0; i < 5; i++) {
      mockRoomData.dice[i] = { value: 0, held: false };
    }
  }

  function renderMockState() {
    var UI = window.YachtGame.UI;
    var Dice = window.YachtGame.Dice;
    var Scoring = window.YachtGame.Scoring;

    UI.updateRollCounter(mockRoomData.rollCount);

    var diceState = [];
    var hd = mockRoomData.heldDice || {};
    for (var i = 0; i < 5; i++) {
      var d = mockRoomData.dice[i] || { value: 0, held: false };
      diceState.push({ value: d.value, held: hd[i] === true });
    }
    Dice.renderAll(diceState);
    Dice.setInteractive(mockRoomData.rollCount > 0);
    UI.setRollButtonEnabled(mockRoomData.rollCount < 3, true, mockRoomData.rollCount);

    var currentDice = Dice.getDiceValues(diceState);
    UI.renderScorecard(
      mockRoomData.players.player1.scores,
      mockRoomData.players.player2.scores,
      mockRoomData.gameMode,
      currentDice,
      true,
      'player1',
      mockRoomData.players.player1.name,
      mockRoomData.players.player2.name,
      mockRoomData.players.player1.lastCategory,
      mockRoomData.players.player2.lastCategory,
      mockRoomData.rollCount > 0,
      'classic',
      'classic'
    );
  }

  function setHighlight(selector) {
    var old = document.querySelector('.tutorial-highlight');
    if (old) old.classList.remove('tutorial-highlight');
    if (selector) {
      var el = document.querySelector(selector);
      if (el) el.classList.add('tutorial-highlight');
    }
  }

  function showTooltip(step) {
    var overlay = document.getElementById('tutorial-overlay');
    var msgEl = document.getElementById('tutorial-message');
    var nextBtn = document.getElementById('tutorial-next');
    var skipBtn = document.getElementById('tutorial-skip');

    overlay.classList.remove('hidden');
    msgEl.textContent = t(step.msgKey);

    if (step.action === 'next') {
      nextBtn.style.display = '';
      nextBtn.textContent = t('tut_next');
    } else if (step.action === 'finish') {
      nextBtn.style.display = '';
      nextBtn.textContent = t('tut_start_playing');
    } else {
      nextBtn.style.display = 'none';
    }

    skipBtn.textContent = t('tut_skip');

    // Position tooltip near the highlighted element
    var tooltip = document.getElementById('tutorial-tooltip');
    if (step.highlight) {
      var target = document.querySelector(step.highlight);
      if (target) {
        var rect = target.getBoundingClientRect();
        var tooltipRect = tooltip.getBoundingClientRect();
        var top = rect.bottom + 12;
        if (top + tooltipRect.height > window.innerHeight) {
          top = rect.top - tooltipRect.height - 12;
        }
        var left = rect.left + (rect.width - tooltipRect.width) / 2;
        left = Math.max(8, Math.min(left, window.innerWidth - tooltipRect.width - 8));
        tooltip.style.position = 'fixed';
        tooltip.style.top = top + 'px';
        tooltip.style.left = left + 'px';
      }
    } else {
      tooltip.style.position = '';
      tooltip.style.top = '';
      tooltip.style.left = '';
    }
  }

  function advance() {
    currentStep++;
    if (currentStep >= STEPS.length) {
      cleanup();
      return;
    }

    var step = STEPS[currentStep];
    setHighlight(step.highlight);
    showTooltip(step);

    // Wire up action-specific listeners
    if (step.action === 'roll') {
      setupRollListener();
    } else if (step.action === 'hold') {
      setupHoldListener();
    } else if (step.action === 'score') {
      setupScoreListener();
    }
  }

  function setupRollListener() {
    var btn = document.getElementById('btn-roll');
    function onRoll() {
      btn.removeEventListener('click', onRoll);
      tutorialRoll();
      setTimeout(function () { advance(); }, 500);
    }
    btn.addEventListener('click', onRoll);
  }

  function tutorialRoll() {
    var hd = mockRoomData.heldDice || {};
    for (var i = 0; i < 5; i++) {
      if (!hd[i]) {
        mockRoomData.dice[i] = { value: Math.ceil(Math.random() * 6), held: false };
      }
    }
    mockRoomData.rollCount++;
    renderMockState();
  }

  function setupHoldListener() {
    var diceArea = document.getElementById('dice-area');
    function onHoldClick(e) {
      var die = e.target.closest('.die');
      if (!die) return;
      var idx = parseInt(die.getAttribute('data-index'), 10);
      if (isNaN(idx)) return;
      mockRoomData.heldDice[idx] = !mockRoomData.heldDice[idx];
      renderMockState();
      // Check if at least one is held
      var anyHeld = false;
      for (var i = 0; i < 5; i++) {
        if (mockRoomData.heldDice[i]) anyHeld = true;
      }
      if (anyHeld) {
        diceArea.removeEventListener('click', onHoldClick);
        setTimeout(function () { advance(); }, 300);
      }
    }
    diceArea.addEventListener('click', onHoldClick);
  }

  function setupScoreListener() {
    var scorecard = document.getElementById('scorecard');
    var pendingCat = null;

    function onScoreClick(e) {
      var cell = e.target.closest('.score-cell.preview');
      if (!cell) return;
      var cat = cell.getAttribute('data-category');
      if (!cat) return;

      if (pendingCat === cat) {
        // Confirm
        var Scoring = window.YachtGame.Scoring;
        var diceVals = [];
        for (var i = 0; i < 5; i++) {
          diceVals.push(mockRoomData.dice[i] ? mockRoomData.dice[i].value : 0);
        }
        var score = Scoring.calculate(diceVals, cat, mockRoomData.gameMode);
        mockRoomData.players.player1.scores[cat] = score;
        mockRoomData.players.player1.lastCategory = cat;
        mockRoomData.rollCount = 0;
        mockRoomData.heldDice = {};
        for (var i = 0; i < 5; i++) {
          mockRoomData.dice[i] = { value: 0, held: false };
        }
        renderMockState();
        scorecard.removeEventListener('click', onScoreClick);
        setTimeout(function () { advance(); }, 300);
      } else {
        pendingCat = cat;
        window.YachtGame.UI.showScoreConfirmHint(cat);
      }
    }
    scorecard.addEventListener('click', onScoreClick);
  }

  function start() {
    if (active) return;
    active = true;
    currentStep = -1;

    // Remember which screen to return to
    var activeScreen = document.querySelector('.screen.active');
    returnScreen = activeScreen ? activeScreen.id : 'screen-login';

    // Build mock data and show game screen
    buildMockRoom();
    window.YachtGame.UI.showScreen('screen-game', 'yacht');

    // Hide game-only buttons that don't apply in tutorial
    var btns = document.querySelectorAll('.game-only');
    for (var i = 0; i < btns.length; i++) {
      btns[i].style.display = 'none';
    }

    renderMockState();
    advance();
  }

  function cleanup() {
    active = false;
    currentStep = -1;
    mockRoomData = null;

    // Remove highlight
    setHighlight(null);

    // Hide overlay
    var overlay = document.getElementById('tutorial-overlay');
    if (overlay) overlay.classList.add('hidden');

    // Restore game-only buttons
    var btns = document.querySelectorAll('.game-only');
    for (var i = 0; i < btns.length; i++) {
      btns[i].style.display = '';
    }

    // Return to previous screen
    window.YachtGame.UI.showScreen(returnScreen);
  }

  window.YachtGame.Tutorial = {
    start: start,
    isActive: function () { return active; },
    cleanup: cleanup,
    _advance: advance
  };
})();
