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

    if (screenId === 'screen-game') {
      document.body.classList.add('in-game');
    } else {
      document.body.classList.remove('in-game');
    }
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
    }, 3100);
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

  // Turn indicator (no-op, turn is shown via roll button dimming)
  function updateTurnIndicator(isMyTurn, opponentName) {}

  // Roll counter — updates roll button text
  function updateRollCounter(count) {
    var btn = document.getElementById('btn-roll');
    btn.innerHTML = 'Roll<br><small>(' + count + '/3)</small>';
  }

  // Roll button state
  function setRollButtonEnabled(enabled, isMyTurn) {
    var btn = document.getElementById('btn-roll');
    btn.disabled = !enabled;
    if (!isMyTurn) {
      btn.innerHTML = 'Not your turn';
    }
  }

  // Scorecard rendering
  function renderScorecard(player1Scores, player2Scores, gameMode, currentDice, isMyTurn, myPlayerKey, player1Name, player2Name, myLastCat, oppLastCat, hasRolled) {
    var container = document.getElementById('scorecard');
    var Scoring = window.YachtGame.Scoring;
    var categories = Scoring.getCategories(gameMode);
    var upperCats = Scoring.getUpperCategories();
    var lowerCats = Scoring.getLowerCategories(gameMode);

    // Calculate previews for whoever's turn it is (both players see them)
    var previews = {};
    if (hasRolled && currentDice && currentDice[0] > 0) {
      previews = Scoring.calculateAll(currentDice, gameMode);
    }

    var myScores = myPlayerKey === 'player1' ? player1Scores : player2Scores;
    var oppScores = myPlayerKey === 'player1' ? player2Scores : player1Scores;
    var myName = myPlayerKey === 'player1' ? player1Name : player2Name;
    var oppName = myPlayerKey === 'player1' ? player2Name : player1Name;

    var html = '<table>';
    html += '<colgroup><col style="width:40%"><col style="width:30%"><col style="width:30%"></colgroup>';
    html += '<thead><tr>';
    html += '<th>Category</th>';
    html += '<th class="my-header' + (isMyTurn ? ' current-turn' : '') + '">' + escapeHtml(myName || 'You') + '</th>';
    html += '<th class="opponent-header' + (!isMyTurn ? ' current-turn' : '') + '">' + escapeHtml(oppName || 'Opponent') + '</th>';
    html += '</tr></thead>';
    html += '<tbody>';

    // Upper categories
    for (var i = 0; i < upperCats.length; i++) {
      html += renderCategoryRow(upperCats[i], myScores, oppScores, previews, isMyTurn, gameMode, myLastCat, oppLastCat, '');
    }

    // Upper bonus row (Yahtzee only)
    if (gameMode === 'yahtzee') {
      var myUpperSum = Scoring.upperSum(myScores);
      var oppUpperSum = Scoring.upperSum(oppScores);
      var myBonus = Scoring.upperBonus(myScores);
      var oppBonus = Scoring.upperBonus(oppScores);
      html += '<tr class="bonus-row">';
      html += '<td class="category-name">Bonus</td>';
      html += '<td class="score-cell mine">' + myUpperSum + '/63' + (myBonus ? ' +35' : '') + '</td>';
      html += '<td class="score-cell opponent">' + oppUpperSum + '/63' + (oppBonus ? ' +35' : '') + '</td>';
      html += '</tr>';
    }

    // Lower categories (with lower-row class for background distinction)
    for (var i = 0; i < lowerCats.length; i++) {
      html += renderCategoryRow(lowerCats[i], myScores, oppScores, previews, isMyTurn, gameMode, myLastCat, oppLastCat, 'lower-row');
    }

    // Yahtzee bonus row
    if (gameMode === 'yahtzee') {
      var myYB = myScores.yahtzeeBonus || 0;
      var oppYB = oppScores.yahtzeeBonus || 0;
      html += '<tr class="bonus-row">';
      html += '<td class="category-name">Yahtzee Bonus</td>';
      html += '<td class="score-cell mine">' + (myYB > 0 ? '+' + myYB : '-') + '</td>';
      html += '<td class="score-cell opponent">' + (oppYB > 0 ? '+' + oppYB : '-') + '</td>';
      html += '</tr>';
    }

    // Total row
    var myTotal = Scoring.totalScore(myScores, gameMode, myScores.yahtzeeBonus);
    var oppTotal = Scoring.totalScore(oppScores, gameMode, oppScores.yahtzeeBonus);
    html += '<tr class="total-row">';
    html += '<td class="category-name">Total</td>';
    html += '<td class="score-cell mine">' + myTotal + '</td>';
    html += '<td class="score-cell opponent">' + oppTotal + '</td>';
    html += '</tr>';

    html += '</tbody></table>';
    container.innerHTML = html;

    // Attach click handlers to MY preview cells only
    if (isMyTurn && hasRolled) {
      var myPreviewCells = container.querySelectorAll('.score-cell.preview');
      for (var i = 0; i < myPreviewCells.length; i++) {
        (function (cell) {
          cell.addEventListener('click', function () {
            var cat = cell.dataset.category;
            if (cat && window.YachtGame.Game) {
              window.YachtGame.Game.confirmCategory(cat);
            }
          });
        })(myPreviewCells[i]);
      }
    }
  }

  function showScoreConfirmHint(category) {
    // Remove any existing hint
    var old = document.querySelector('.score-confirm-hint');
    if (old) old.remove();

    // Clear previous pending highlight
    var allPending = document.querySelectorAll('.score-cell.pending');
    for (var i = 0; i < allPending.length; i++) {
      allPending[i].classList.remove('pending');
    }

    // Find the target cell
    var cell = document.querySelector('.score-cell.preview[data-category="' + category + '"]');
    if (!cell) return;

    cell.classList.add('pending');

    // Create hint popup
    var hint = document.createElement('div');
    hint.className = 'score-confirm-hint';
    hint.textContent = 'Tap again to confirm';
    cell.appendChild(hint);

    // Auto fade-out after 1.5s
    setTimeout(function () {
      hint.classList.add('fade-out');
      hint.addEventListener('animationend', function () {
        if (hint.parentNode) hint.remove();
      });
    }, 1500);
  }

  function renderCategoryRow(category, myScores, oppScores, previews, isMyTurn, gameMode, myLastCat, oppLastCat, rowClass) {
    var Scoring = window.YachtGame.Scoring;
    var displayName = Scoring.getDisplayName(category);
    var myVal = myScores[category];
    var oppVal = oppScores[category];
    var isMyLast = category === myLastCat;
    var isOppLast = category === oppLastCat;
    var html = '<tr' + (rowClass ? ' class="' + rowClass + '"' : '') + '>';

    html += '<td class="category-name">' + displayName + '</td>';

    // My score cell
    if (myVal !== null && myVal !== undefined) {
      html += '<td class="score-cell mine filled' + (isMyLast ? ' last-scored' : '') + '">' + myVal + '</td>';
    } else if (isMyTurn && previews[category] !== undefined) {
      html += '<td class="score-cell preview" data-category="' + category + '">' + previews[category] + '</td>';
    } else {
      html += '<td class="score-cell">-</td>';
    }

    // Opponent score cell
    if (oppVal !== null && oppVal !== undefined) {
      html += '<td class="score-cell opponent filled' + (isOppLast ? ' last-scored' : '') + '">' + oppVal + '</td>';
    } else if (!isMyTurn && previews[category] !== undefined) {
      html += '<td class="score-cell opponent preview-opp">' + previews[category] + '</td>';
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

  // Emote bubbles
  var emoteBubbleTimers = { mine: null, opp: null };
  function showEmoteBubble(target, msg) {
    var bubbleId = target === 'mine' ? 'emote-bubble-mine' : 'emote-bubble-opp';
    var anchorClass = target === 'mine' ? '.my-header' : '.opponent-header';
    var bubble = document.getElementById(bubbleId);

    bubble.innerHTML = escapeHtml(msg);
    bubble.classList.remove('hidden');

    var anchor = document.querySelector(anchorClass);
    if (anchor) {
      var rect = anchor.getBoundingClientRect();
      bubble.style.position = 'absolute';
      bubble.style.left = (rect.left + rect.width / 2) + 'px';
      bubble.style.top = (rect.top + window.scrollY + rect.height / 2) + 'px';
      bubble.style.transform = 'translate(-50%, -50%)';
    }

    bubble.style.animation = 'none';
    bubble.offsetHeight;
    bubble.style.animation = '';
    clearTimeout(emoteBubbleTimers[target]);
    emoteBubbleTimers[target] = setTimeout(function () {
      bubble.classList.add('hidden');
    }, 2500);
  }

  // Rules overlay
  function showRulesOverlay(gameMode) {
    var overlay = document.getElementById('overlay-rules');
    var yachtRules = document.getElementById('rules-yacht');
    var yahtzeeRules = document.getElementById('rules-yahtzee');
    yachtRules.hidden = gameMode !== 'yacht';
    yahtzeeRules.hidden = gameMode !== 'yahtzee';
    overlay.classList.remove('hidden');
  }

  function hideRulesOverlay() {
    document.getElementById('overlay-rules').classList.add('hidden');
  }

  // Shortcut overlay
  function showShortcutOverlay() {
    document.getElementById('overlay-shortcut').classList.remove('hidden');
  }

  function hideShortcutOverlay() {
    document.getElementById('overlay-shortcut').classList.add('hidden');
  }

  // History / Stats rendering
  function renderHistory(stats, games) {
    var summaryEl = document.getElementById('stats-summary');
    var listEl = document.getElementById('history-list');

    // Stats summary
    var winRate = stats.totalGames > 0 ? Math.round((stats.wins / stats.totalGames) * 100) : 0;
    var html = '<div class="stats-grid">';
    html += '<div class="stat-card"><div class="stat-value">' + stats.totalGames + '</div><div class="stat-label">Games</div></div>';
    html += '<div class="stat-card stat-win"><div class="stat-value">' + stats.wins + '</div><div class="stat-label">Wins</div></div>';
    html += '<div class="stat-card stat-loss"><div class="stat-value">' + stats.losses + '</div><div class="stat-label">Losses</div></div>';
    html += '<div class="stat-card"><div class="stat-value">' + stats.ties + '</div><div class="stat-label">Ties</div></div>';
    html += '<div class="stat-card" style="grid-column: span 2;"><div class="stat-value">' + winRate + '%</div><div class="stat-label">Win Rate</div></div>';
    html += '</div>';
    summaryEl.innerHTML = html;

    // Game history list
    if (games.length === 0) {
      listEl.innerHTML = '<p class="no-history">No games played yet.</p>';
      return;
    }

    var listHtml = '<table class="history-table"><thead><tr><th>Date</th><th>Mode</th><th>Opponent</th><th>Score</th><th>Result</th></tr></thead><tbody>';
    for (var i = 0; i < games.length; i++) {
      var g = games[i];
      var dateStr = g.date ? new Date(g.date).toLocaleDateString() : '-';
      var resultClass = g.result === 'win' ? 'result-win' : (g.result === 'loss' ? 'result-loss' : 'result-tie');
      var resultText = g.result === 'win' ? 'W' : (g.result === 'loss' ? 'L' : 'T');
      listHtml += '<tr>';
      listHtml += '<td>' + dateStr + '</td>';
      listHtml += '<td>' + escapeHtml(g.mode || '-') + '</td>';
      listHtml += '<td>' + escapeHtml(g.opponentName || '-') + '</td>';
      listHtml += '<td>' + g.myScore + ' - ' + g.oppScore + '</td>';
      listHtml += '<td class="' + resultClass + '">' + resultText + '</td>';
      listHtml += '</tr>';
    }
    listHtml += '</tbody></table>';
    listEl.innerHTML = listHtml;
  }

  function showConfetti() {
    var existing = document.getElementById('confetti-canvas');
    if (existing) existing.remove();
    var canvas = document.createElement('canvas');
    canvas.id = 'confetti-canvas';
    canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999';
    document.body.appendChild(canvas);
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    var ctx = canvas.getContext('2d');

    var colors = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#ff6bcb', '#a66cff'];
    var particles = [];
    for (var i = 0; i < 120; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: -10 - Math.random() * canvas.height * 0.5,
        w: 4 + Math.random() * 6,
        h: 6 + Math.random() * 10,
        color: colors[Math.floor(Math.random() * colors.length)],
        vx: (Math.random() - 0.5) * 4,
        vy: 2 + Math.random() * 4,
        rotation: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 10
      });
    }

    var frame = 0;
    var maxFrames = 150;
    function animate() {
      frame++;
      if (frame > maxFrames) {
        document.body.removeChild(canvas);
        return;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      var alpha = frame > maxFrames - 30 ? (maxFrames - frame) / 30 : 1;
      ctx.globalAlpha = alpha;
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        p.x += p.vx;
        p.vy += 0.08;
        p.y += p.vy;
        p.rotation += p.rotSpeed;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation * Math.PI / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      requestAnimationFrame(animate);
    }
    animate();
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
    showScoreConfirmHint: showScoreConfirmHint,
    renderGameOver: renderGameOver,
    showRulesOverlay: showRulesOverlay,
    hideRulesOverlay: hideRulesOverlay,
    showShortcutOverlay: showShortcutOverlay,
    hideShortcutOverlay: hideShortcutOverlay,
    showEmoteBubble: showEmoteBubble,
    renderHistory: renderHistory,
    showConfetti: showConfetti
  };
})();
