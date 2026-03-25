// UI management: screens, scorecard, theme, toasts
(function () {
  'use strict';

  window.YachtGame = window.YachtGame || {};

  // Screen management
  function showScreen(screenId) {
    var screens = document.querySelectorAll('.screen');
    for (var i = 0; i < screens.length; i++) {
      screens[i].classList.remove('active');
    }
    var target = document.getElementById(screenId);
    if (target) target.classList.add('active');
  }

  // Theme toggle
  function initTheme() {
    var saved = localStorage.getItem('yacht-theme');
    if (saved === 'dark') {
      document.documentElement.dataset.theme = 'dark';
    }
  }

  function toggleTheme() {
    var current = document.documentElement.dataset.theme;
    if (current === 'dark') {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('yacht-theme', 'light');
    } else {
      document.documentElement.dataset.theme = 'dark';
      localStorage.setItem('yacht-theme', 'dark');
    }
  }

  // Toast notifications
  function showToast(message) {
    var container = document.getElementById('toast-container');
    var toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 3000);
  }

  // Disconnect overlay
  function showDisconnectOverlay(show) {
    var overlay = document.getElementById('overlay-disconnect');
    if (show) {
      overlay.classList.remove('hidden');
    } else {
      overlay.classList.add('hidden');
    }
  }

  // Turn indicator
  function updateTurnIndicator(isMyTurn, opponentName) {
    var el = document.getElementById('turn-indicator');
    if (isMyTurn) {
      el.textContent = 'Your Turn';
      el.className = 'turn-indicator my-turn';
    } else {
      el.textContent = (opponentName || 'Opponent') + "'s Turn";
      el.className = 'turn-indicator opponent-turn';
    }
  }

  // Roll counter
  function updateRollCounter(count) {
    var el = document.getElementById('roll-counter');
    el.textContent = 'Rolls: ' + count + ' / 3';
  }

  // Roll button state
  function setRollButtonEnabled(enabled) {
    var btn = document.getElementById('btn-roll');
    btn.disabled = !enabled;
  }

  // Scorecard rendering
  function renderScorecard(player1Scores, player2Scores, gameMode, currentDice, isMyTurn, myPlayerKey, player1Name, player2Name) {
    var container = document.getElementById('scorecard');
    var Scoring = window.YachtGame.Scoring;
    var categories = Scoring.getCategories(gameMode);
    var upperCats = Scoring.getUpperCategories();
    var lowerCats = Scoring.getLowerCategories(gameMode);

    // Calculate previews if it's my turn and we have dice
    var previews = {};
    if (isMyTurn && currentDice && currentDice[0] > 0) {
      previews = Scoring.calculateAll(currentDice, gameMode);
    }

    var myScores = myPlayerKey === 'player1' ? player1Scores : player2Scores;
    var oppScores = myPlayerKey === 'player1' ? player2Scores : player1Scores;
    var myName = myPlayerKey === 'player1' ? player1Name : player2Name;
    var oppName = myPlayerKey === 'player1' ? player2Name : player1Name;

    var html = '<table>';
    html += '<thead><tr>';
    html += '<th>' + escapeHtml(myName || 'You') + '</th>';
    html += '<th>Category</th>';
    html += '<th>' + escapeHtml(oppName || 'Opponent') + '</th>';
    html += '</tr></thead>';
    html += '<tbody>';

    // Upper section header
    html += '<tr class="section-header"><td colspan="3">Upper Section</td></tr>';

    for (var i = 0; i < upperCats.length; i++) {
      html += renderCategoryRow(upperCats[i], myScores, oppScores, previews, isMyTurn, gameMode);
    }

    // Upper bonus row (Yahtzee only)
    if (gameMode === 'yahtzee') {
      var myUpperSum = Scoring.upperSum(myScores);
      var oppUpperSum = Scoring.upperSum(oppScores);
      var myBonus = Scoring.upperBonus(myScores);
      var oppBonus = Scoring.upperBonus(oppScores);
      html += '<tr class="bonus-row">';
      html += '<td class="score-cell mine">' + myUpperSum + '/63' + (myBonus ? ' +35' : '') + '</td>';
      html += '<td class="category-name">Bonus</td>';
      html += '<td class="score-cell opponent">' + oppUpperSum + '/63' + (oppBonus ? ' +35' : '') + '</td>';
      html += '</tr>';
    }

    // Lower section header
    html += '<tr class="section-header"><td colspan="3">Lower Section</td></tr>';

    for (var i = 0; i < lowerCats.length; i++) {
      html += renderCategoryRow(lowerCats[i], myScores, oppScores, previews, isMyTurn, gameMode);
    }

    // Yahtzee bonus row
    if (gameMode === 'yahtzee') {
      var myYB = myScores.yahtzeeBonus || 0;
      var oppYB = oppScores.yahtzeeBonus || 0;
      html += '<tr class="bonus-row">';
      html += '<td class="score-cell mine">' + (myYB > 0 ? '+' + myYB : '-') + '</td>';
      html += '<td class="category-name">Yahtzee Bonus</td>';
      html += '<td class="score-cell opponent">' + (oppYB > 0 ? '+' + oppYB : '-') + '</td>';
      html += '</tr>';
    }

    // Total row
    var myTotal = Scoring.totalScore(myScores, gameMode, myScores.yahtzeeBonus);
    var oppTotal = Scoring.totalScore(oppScores, gameMode, oppScores.yahtzeeBonus);
    html += '<tr class="total-row">';
    html += '<td class="score-cell mine">' + myTotal + '</td>';
    html += '<td class="category-name">Total</td>';
    html += '<td class="score-cell opponent">' + oppTotal + '</td>';
    html += '</tr>';

    html += '</tbody></table>';
    container.innerHTML = html;

    // Attach click handlers to preview cells
    if (isMyTurn) {
      var previewCells = container.querySelectorAll('.score-cell.preview');
      for (var i = 0; i < previewCells.length; i++) {
        (function (cell) {
          cell.addEventListener('click', function () {
            var cat = cell.dataset.category;
            if (cat && window.YachtGame.Game) {
              window.YachtGame.Game.selectCategory(cat);
            }
          });
        })(previewCells[i]);
      }
    }
  }

  function renderCategoryRow(category, myScores, oppScores, previews, isMyTurn, gameMode) {
    var Scoring = window.YachtGame.Scoring;
    var displayName = Scoring.getDisplayName(category);
    var myVal = myScores[category];
    var oppVal = oppScores[category];
    var html = '<tr>';

    // My score cell
    if (myVal !== null && myVal !== undefined) {
      html += '<td class="score-cell mine filled">' + myVal + '</td>';
    } else if (isMyTurn && previews[category] !== undefined) {
      html += '<td class="score-cell preview" data-category="' + category + '">' + previews[category] + '</td>';
    } else {
      html += '<td class="score-cell">-</td>';
    }

    html += '<td class="category-name">' + displayName + '</td>';

    // Opponent score cell
    if (oppVal !== null && oppVal !== undefined) {
      html += '<td class="score-cell opponent filled">' + oppVal + '</td>';
    } else {
      html += '<td class="score-cell">-</td>';
    }

    html += '</tr>';
    return html;
  }

  // Render game over screen
  function renderGameOver(player1Name, player2Name, player1Scores, player2Scores, gameMode, winner, myPlayerKey) {
    var Scoring = window.YachtGame.Scoring;
    var p1Total = Scoring.totalScore(player1Scores, gameMode, player1Scores.yahtzeeBonus);
    var p2Total = Scoring.totalScore(player2Scores, gameMode, player2Scores.yahtzeeBonus);

    var winnerEl = document.getElementById('winner-text');
    if (winner === 'tie') {
      winnerEl.textContent = "It's a Tie!";
    } else if (winner === myPlayerKey) {
      winnerEl.textContent = 'You Win!';
    } else {
      winnerEl.textContent = 'You Lose';
    }

    var scoresEl = document.getElementById('final-scores');
    var html = '<table>';
    html += '<thead><tr><th>Player</th><th>Score</th></tr></thead>';
    html += '<tbody>';
    html += '<tr' + (winner === 'player1' ? ' class="winner-score"' : '') + '>';
    html += '<td>' + escapeHtml(player1Name) + '</td>';
    html += '<td>' + p1Total + '</td></tr>';
    html += '<tr' + (winner === 'player2' ? ' class="winner-score"' : '') + '>';
    html += '<td>' + escapeHtml(player2Name) + '</td>';
    html += '<td>' + p2Total + '</td></tr>';
    html += '</tbody></table>';
    scoresEl.innerHTML = html;
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  window.YachtGame.UI = {
    showScreen: showScreen,
    initTheme: initTheme,
    toggleTheme: toggleTheme,
    showToast: showToast,
    showDisconnectOverlay: showDisconnectOverlay,
    updateTurnIndicator: updateTurnIndicator,
    updateRollCounter: updateRollCounter,
    setRollButtonEnabled: setRollButtonEnabled,
    renderScorecard: renderScorecard,
    renderGameOver: renderGameOver
  };
})();
