// UI management: screens, scorecard, theme, toasts
(function () {
  'use strict';

  window.YachtGame = window.YachtGame || {};

  // Screen management
  function showScreen(screenId, gameMode) {
    var screens = document.querySelectorAll('.screen');
    for (var i = 0; i < screens.length; i++) {
      screens[i].classList.remove('active');
    }
    var target = document.getElementById(screenId);
    if (target) target.classList.add('active');

    var titleEl = document.querySelector('h1');
    var I18n = window.YachtGame.I18n;
    if (screenId === 'screen-game') {
      document.body.classList.add('in-game');
      if (titleEl) {
        titleEl.textContent = I18n ? (gameMode === 'yahtzee' ? I18n.t('title_yahtzee') : I18n.t('title_yacht')) : 'Yacht Dice';
      }
    } else {
      document.body.classList.remove('in-game');
      if (titleEl) titleEl.textContent = I18n ? I18n.t('title_yacht') : 'Yacht Dice';
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

  // Draw proposal overlays
  function showDrawProposal(show) {
    var overlay = document.getElementById('overlay-draw-proposal');
    if (overlay) {
      if (show) overlay.classList.remove('hidden');
      else overlay.classList.add('hidden');
    }
  }

  function showDrawPending(show) {
    var btn = document.getElementById('btn-draw');
    if (btn) btn.disabled = show;
  }

  // Turn indicator (no-op, turn is shown via roll button dimming)
  function updateTurnIndicator(isMyTurn, opponentName) {}

  // Roll counter — updates roll button text
  function updateRollCounter(count) {
    var btn = document.getElementById('btn-roll');
    var I18n = window.YachtGame.I18n;
    if (count >= 3) {
      btn.innerHTML = I18n ? I18n.t('roll_end') : 'Roll End';
    } else {
      btn.innerHTML = (I18n ? I18n.t('lets_roll') : "Let's Roll!") + '<br><small>(' + count + '/3)</small>';
    }
  }

  // Roll button state
  function setRollButtonEnabled(enabled, isMyTurn, rollCount) {
    var btn = document.getElementById('btn-roll');
    var I18n = window.YachtGame.I18n;
    btn.disabled = !enabled;
    if (!isMyTurn) {
      var rc = rollCount || 0;
      btn.innerHTML = (I18n ? I18n.t('foes_turn') : "Foe's turn") + '<br><small>(' + rc + '/3)</small>';
    }
  }

  // Scorecard rendering
  function renderScorecard(player1Scores, player2Scores, gameMode, currentDice, isMyTurn, myPlayerKey, player1Name, player2Name, myLastCat, oppLastCat, hasRolled, myDiceSkin, oppDiceSkin) {
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
    var DiceSkins = window.YachtGame.DiceSkins;
    var myDieHTML = DiceSkins && DiceSkins.renderMiniDieHTML ? DiceSkins.renderMiniDieHTML(myDiceSkin) : '';
    var oppDieHTML = DiceSkins && DiceSkins.renderMiniDieHTML ? DiceSkins.renderMiniDieHTML(oppDiceSkin) : '';

    var I18n = window.YachtGame.I18n;
    html += '<thead><tr>';
    html += '<th>' + (I18n ? I18n.t('category') : 'Category') + '</th>';
    html += '<th class="my-header' + (isMyTurn ? ' current-turn' : '') + '">';
    html += '<span class="header-die-wrap' + (isMyTurn ? ' header-die-spin' : '') + '">' + myDieHTML + '</span> ';
    html += '<span class="name-full">' + escapeHtml(myName || 'You') + '</span>';
    html += '<span class="name-short">' + escapeHtml(shortName(myName) || 'You') + '</span>';
    html += '</th>';
    html += '<th class="opponent-header' + (!isMyTurn ? ' current-turn' : '') + '">';
    html += '<span class="header-die-wrap' + (!isMyTurn ? ' header-die-spin' : '') + '">' + oppDieHTML + '</span> ';
    html += '<span class="name-full">' + escapeHtml(oppName || 'Opponent') + '</span>';
    html += '<span class="name-short">' + escapeHtml(shortName(oppName) || 'Opp') + '</span>';
    html += '</th>';
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
      html += '<td class="category-name">' + (I18n ? I18n.t('bonus') : 'Bonus') + '</td>';
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
      html += '<td class="category-name">' + (I18n ? I18n.t('yahtzee_bonus') : 'Yahtzee Bonus') + '</td>';
      html += '<td class="score-cell mine">' + (myYB > 0 ? '+' + myYB : '-') + '</td>';
      html += '<td class="score-cell opponent">' + (oppYB > 0 ? '+' + oppYB : '-') + '</td>';
      html += '</tr>';
    }

    // Total row
    var myTotal = Scoring.totalScore(myScores, gameMode, myScores.yahtzeeBonus);
    var oppTotal = Scoring.totalScore(oppScores, gameMode, oppScores.yahtzeeBonus);
    html += '<tr class="total-row">';
    html += '<td class="category-name">' + (I18n ? I18n.t('total') : 'Total') + '</td>';
    html += '<td class="score-cell mine">' + myTotal + '</td>';
    html += '<td class="score-cell opponent">' + oppTotal + '</td>';
    html += '</tr>';

    html += '</tbody></table>';
    container.innerHTML = html;

    // Attach click handlers to MY preview cells only
    if (isMyTurn && hasRolled) {
      var myPreviewCells = container.querySelectorAll('.score-cell.preview');
      for (var i = 0; i < myPreviewCells.length; i++) {
        (function (cell, cellIndex) {
          cell.addEventListener('click', function () {
            var cat = cell.dataset.category;
            if (cat && window.YachtGame.Game) {
              window.YachtGame.Game.confirmCategory(cat);
              // Move kb-focus to clicked cell
              var oldFocus = document.querySelectorAll('.kb-focus');
              for (var j = 0; j < oldFocus.length; j++) oldFocus[j].classList.remove('kb-focus');
              cell.classList.add('kb-focus');
              if (typeof window.YachtGame._setKbFocusIndex === 'function') {
                window.YachtGame._setKbFocusIndex(cellIndex);
              }
            }
          });
        })(myPreviewCells[i], i);
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
    var I18n = window.YachtGame.I18n;
    hint.textContent = I18n ? I18n.t('confirm_hint') : 'Tap again to confirm';
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

    var I18n = window.YachtGame.I18n;
    var winnerEl = document.getElementById('winner-text');
    if (winner === 'tie') {
      winnerEl.textContent = I18n ? I18n.t('its_a_tie') : "It's a Tie!";
    } else if (winner === myPlayerKey) {
      winnerEl.textContent = I18n ? I18n.t('you_win') : 'You Win!';
    } else {
      winnerEl.textContent = I18n ? I18n.t('you_lose') : 'You Lose';
    }

    var scoresEl = document.getElementById('final-scores');
    var html = '<table>';
    html += '<thead><tr><th>' + (I18n ? I18n.t('player') : 'Player') + '</th><th>' + (I18n ? I18n.t('score') : 'Score') + '</th></tr></thead>';
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

  // "용감한 여우#42" → "여우#42", "Brave Fox#42" → "Fox#42"
  function shortName(name) {
    if (!name) return name;
    // Only shorten names that match the auto-nickname pattern "adj noun#num"
    var autoNicknamePattern = /^[^\s#]+\s+[^\s#]+#\d+$/;
    if (!autoNicknamePattern.test(name)) return name;
    var idx = name.indexOf(' ');
    return idx >= 0 ? name.substring(idx + 1) : name;
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
      bubble.style.minWidth = rect.width + 'px';
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
  var HISTORY_PAGE_SIZE = 5;
  var historyPage = 0;
  var historyGames = [];
  var historyStats = null;

  function renderHistory(stats, games) {
    historyStats = stats;
    var summaryEl = document.getElementById('stats-summary');
    var listEl = document.getElementById('history-list');
    var I18n = window.YachtGame.I18n;

    // Stats summary
    var winRate = stats.totalGames > 0 ? Math.round((stats.wins / stats.totalGames) * 100) : 0;
    var html = '<div class="stats-grid">';
    html += '<div class="stat-card"><div class="stat-value">' + stats.totalGames + '</div><div class="stat-label">' + (I18n ? I18n.t('games') : 'Games') + '</div></div>';
    html += '<div class="stat-card stat-win"><div class="stat-value">' + stats.wins + '</div><div class="stat-label">' + (I18n ? I18n.t('wins') : 'Wins') + '</div></div>';
    html += '<div class="stat-card stat-loss"><div class="stat-value">' + stats.losses + '</div><div class="stat-label">' + (I18n ? I18n.t('losses') : 'Losses') + '</div></div>';
    html += '<div class="stat-card"><div class="stat-value">' + stats.ties + '</div><div class="stat-label">' + (I18n ? I18n.t('ties') : 'Ties') + '</div></div>';
    html += '<div class="stat-card" style="grid-column: span 2;"><div class="stat-value">' + winRate + '%</div><div class="stat-label">' + (I18n ? I18n.t('win_rate') : 'Win Rate') + '</div></div>';
    html += '</div>';
    summaryEl.innerHTML = html;

    // Store games and reset page
    historyGames = games;
    historyPage = 0;
    renderHistoryPage();
  }

  function renderHistoryPage() {
    var listEl = document.getElementById('history-list');
    var I18n = window.YachtGame.I18n;
    var games = historyGames;

    if (games.length === 0) {
      listEl.innerHTML = '<p class="no-history">' + (I18n ? I18n.t('no_games') : 'No games played yet.') + '</p>';
      return;
    }

    var totalPages = Math.ceil(games.length / HISTORY_PAGE_SIZE);
    var start = historyPage * HISTORY_PAGE_SIZE;
    var end = Math.min(start + HISTORY_PAGE_SIZE, games.length);
    var pageGames = games.slice(start, end);

    var listHtml = '<table class="history-table"><thead><tr><th>' + (I18n ? I18n.t('date') : 'Date') + '</th><th>' + (I18n ? I18n.t('mode') : 'Mode') + '</th><th>' + (I18n ? I18n.t('opponent') : 'Opponent') + '</th><th>' + (I18n ? I18n.t('score') : 'Score') + '</th><th>' + (I18n ? I18n.t('result') : 'Result') + '</th></tr></thead><tbody>';
    for (var i = 0; i < pageGames.length; i++) {
      var g = pageGames[i];
      var dateStr = g.date ? new Date(g.date).toLocaleDateString() : '-';
      var resultClass = g.result === 'win' ? 'result-win' : (g.result === 'loss' ? 'result-loss' : 'result-tie');
      var resultText = g.result === 'win' ? (I18n ? I18n.t('result_w') : 'W') : (g.result === 'loss' ? (I18n ? I18n.t('result_l') : 'L') : (I18n ? I18n.t('result_t') : 'T'));
      var modeText = g.mode ? (I18n ? I18n.t('mode_' + g.mode) : g.mode) : '-';
      listHtml += '<tr>';
      listHtml += '<td>' + dateStr + '</td>';
      listHtml += '<td>' + escapeHtml(modeText) + '</td>';
      var oppName = g.opponentName || '-';
      if (I18n) {
        var lang = I18n.getLang();
        oppName = (lang === 'ko' ? g.oppNicknameKo : g.oppNicknameEn) || g.oppNicknameKo || g.oppNicknameEn || g.opponentName || '-';
      }
      listHtml += '<td>' + escapeHtml(oppName) + '</td>';
      listHtml += '<td>' + g.myScore + ' - ' + g.oppScore + '</td>';
      listHtml += '<td class="' + resultClass + '">' + resultText + '</td>';
      listHtml += '</tr>';
    }
    listHtml += '</tbody></table>';

    // Pagination controls
    if (totalPages > 1) {
      listHtml += '<div class="history-pager">';
      listHtml += '<button class="btn-pager btn-pager-prev"' + (historyPage === 0 ? ' disabled' : '') + '>&larr;</button>';
      listHtml += '<span class="pager-info">' + (historyPage + 1) + ' / ' + totalPages + '</span>';
      listHtml += '<button class="btn-pager btn-pager-next"' + (historyPage >= totalPages - 1 ? ' disabled' : '') + '>&rarr;</button>';
      listHtml += '</div>';
    }

    listEl.innerHTML = listHtml;

    // Bind pager buttons
    var prevBtn = listEl.querySelector('.btn-pager-prev');
    var nextBtn = listEl.querySelector('.btn-pager-next');
    if (prevBtn) prevBtn.addEventListener('click', function () {
      if (historyPage > 0) { historyPage--; renderHistoryPage(); }
    });
    if (nextBtn) nextBtn.addEventListener('click', function () {
      if (historyPage < totalPages - 1) { historyPage++; renderHistoryPage(); }
    });
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
    refreshHistory: function () {
      if (historyStats && historyGames) {
        // Re-render summary with updated language
        var savedPage = historyPage;
        renderHistory(historyStats, historyGames);
        historyPage = Math.min(savedPage, Math.ceil(historyGames.length / HISTORY_PAGE_SIZE) - 1);
        renderHistoryPage();
      }
    },
    showConfetti: showConfetti,
    showDrawProposal: showDrawProposal,
    showDrawPending: showDrawPending
  };
})();
