// Dice rendering and interaction
(function () {
  'use strict';

  window.YachtGame = window.YachtGame || {};

  // Pip layout for each die value (3x3 grid positions: 1-9)
  // 1 2 3
  // 4 5 6
  // 7 8 9
  var PIP_LAYOUTS = {
    1: [5],
    2: [3, 7],
    3: [3, 5, 7],
    4: [1, 3, 7, 9],
    5: [1, 3, 5, 7, 9],
    6: [1, 3, 4, 6, 7, 9]
  };

  var GRID_POSITIONS = {
    1: { row: 1, col: 1 },
    2: { row: 1, col: 2 },
    3: { row: 1, col: 3 },
    4: { row: 2, col: 1 },
    5: { row: 2, col: 2 },
    6: { row: 2, col: 3 },
    7: { row: 3, col: 1 },
    8: { row: 3, col: 2 },
    9: { row: 3, col: 3 }
  };

  function renderDie(dieEl, value) {
    dieEl.innerHTML = '';
    dieEl.dataset.value = value || 0;

    if (!value || value < 1 || value > 6) {
      // Empty die (before first roll)
      for (var i = 1; i <= 9; i++) {
        var pip = document.createElement('div');
        pip.className = 'pip hidden';
        pip.style.gridRow = GRID_POSITIONS[i].row;
        pip.style.gridColumn = GRID_POSITIONS[i].col;
        dieEl.appendChild(pip);
      }
      return;
    }

    // Crimson skin: show calligraphy character instead of pips
    var DiceSkins = window.YachtGame.DiceSkins;
    if (DiceSkins && DiceSkins.getCurrentSkin() === 'crimson') {
      var charEl = document.createElement('span');
      charEl.className = 'crimson-char';
      charEl.textContent = DiceSkins.getCrimsonChar(value);
      dieEl.appendChild(charEl);
      return;
    }

    // Banana skin: show image instead of pips
    if (DiceSkins && DiceSkins.getCurrentSkin() === 'banana') {
      var img = document.createElement('img');
      img.src = 'die_image/banana/banana' + value + '.png';
      img.className = 'banana-die-img';
      img.alt = value;
      dieEl.appendChild(img);
      return;
    }

    // Fire skin: show image instead of pips
    if (DiceSkins && DiceSkins.getCurrentSkin() === 'fire') {
      var img = document.createElement('img');
      img.src = 'die_image/fire/fire' + value + '.png';
      img.className = 'fire-die-img';
      img.alt = value;
      dieEl.appendChild(img);
      return;
    }

    // Wave skin: show image instead of pips
    if (DiceSkins && DiceSkins.getCurrentSkin() === 'wave') {
      var img = document.createElement('img');
      img.src = 'die_image/wave/wave' + value + '.png';
      img.className = 'wave-die-img';
      img.alt = value;
      dieEl.appendChild(img);
      return;
    }

    var layout = PIP_LAYOUTS[value];
    for (var i = 1; i <= 9; i++) {
      var pip = document.createElement('div');
      pip.style.gridRow = GRID_POSITIONS[i].row;
      pip.style.gridColumn = GRID_POSITIONS[i].col;
      if (layout.indexOf(i) !== -1) {
        pip.className = 'pip';
      } else {
        pip.className = 'pip hidden';
      }
      dieEl.appendChild(pip);
    }
  }

  function renderAll(diceState) {
    var dieEls = document.querySelectorAll('.die');
    for (var i = 0; i < dieEls.length; i++) {
      var state = diceState[i] || { value: 0, held: false };
      renderDie(dieEls[i], state.value);

      var existing = dieEls[i].querySelector('.held-check');
      if (state.held) {
        dieEls[i].classList.add('held');
        if (!existing) {
          var check = document.createElement('span');
          check.className = 'held-check';
          check.textContent = '\u2713';
          dieEls[i].appendChild(check);
        }
      } else {
        dieEls[i].classList.remove('held');
        if (existing) existing.remove();
      }
    }
  }

  function setInteractive(enabled) {
    var dieEls = document.querySelectorAll('.die');
    for (var i = 0; i < dieEls.length; i++) {
      if (enabled) {
        dieEls[i].classList.remove('disabled');
      } else {
        dieEls[i].classList.add('disabled');
      }
    }
  }

  var activeTimers = [];

  function animateRoll(dieEls, finalDice, callback) {
    // Clear any in-progress animation timers
    for (var t = 0; t < activeTimers.length; t++) clearInterval(activeTimers[t]);
    activeTimers = [];

    var duration = 400;
    var steps = 8;
    var interval = duration / steps;
    var completed = 0;

    for (var i = 0; i < dieEls.length; i++) {
      (function (index) {
        var el = dieEls[index];
        var finalValue = finalDice[index].value;
        var isHeld = finalDice[index].held;

        if (isHeld) {
          completed++;
          if (completed === dieEls.length && callback) callback();
          return;
        }

        el.classList.add('rolling');
        var step = 0;
        var timer = setInterval(function () {
          step++;
          var randomVal = Math.ceil(Math.random() * 6);
          renderDie(el, randomVal);
          if (step >= steps) {
            clearInterval(timer);
            renderDie(el, finalValue);
            el.classList.remove('rolling');
            completed++;
            if (completed === dieEls.length && callback) callback();
          }
        }, interval + index * 15); // stagger each die slightly
        activeTimers.push(timer);
      })(i);
    }
  }

  function getDiceValues(diceState) {
    var values = [];
    for (var i = 0; i < 5; i++) {
      values.push(diceState[i] ? diceState[i].value : 0);
    }
    return values;
  }

  // Stagger stop: each die stops at a random order with delay between them
  var STAGGER_DELAY = 500; // ms between each die stopping

  function staggerStop(spinTimers, dieEls, finalValues, callback) {
    if (!spinTimers.length) { if (callback) callback(); return; }
    var shuffled = spinTimers.slice().sort(function () { return Math.random() - 0.5; });
    var completed = 0;
    for (var i = 0; i < shuffled.length; i++) {
      (function (entry, delay) {
        setTimeout(function () {
          if (entry.timer) clearInterval(entry.timer);
          if (entry.running !== undefined) entry.running = false;
          dieEls[entry.idx].classList.remove('rolling');
          if (finalValues) renderDie(dieEls[entry.idx], finalValues[entry.idx]);
          completed++;
          if (completed === shuffled.length && callback) callback();
        }, delay);
      })(shuffled[i], i * STAGGER_DELAY);
    }
  }

  window.YachtGame.Dice = {
    renderDie: renderDie,
    renderAll: renderAll,
    setInteractive: setInteractive,
    animateRoll: animateRoll,
    getDiceValues: getDiceValues,
    staggerStop: staggerStop
  };
})();
