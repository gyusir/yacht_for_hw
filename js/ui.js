// UI management: screens, scorecard, theme, toasts
(function () {
  'use strict';

  window.YachtGame = window.YachtGame || {};

  var scorecardDelegated = false;

  function initScorecardDelegation() {
    if (scorecardDelegated) return;
    var container = document.getElementById('scorecard');
    if (!container) return;
    scorecardDelegated = true;

    container.addEventListener('click', function (e) {
      var cell = e.target.closest('.score-cell.preview');
      if (!cell) return;
      var cat = cell.dataset.category;
      if (!cat || !window.YachtGame.Game) return;

      window.YachtGame.Game.confirmCategory(cat);

      var oldFocus = document.querySelectorAll('.kb-focus');
      for (var j = 0; j < oldFocus.length; j++) oldFocus[j].classList.remove('kb-focus');
      cell.classList.add('kb-focus');

      var previews = container.querySelectorAll('.score-cell.preview');
      for (var k = 0; k < previews.length; k++) {
        if (previews[k] === cell) {
          if (typeof window.YachtGame._setKbFocusIndex === 'function') {
            window.YachtGame._setKbFocusIndex(k);
          }
          break;
        }
      }
    });
  }

  // Screen management
  function showScreen(screenId, gameMode) {
    var screens = document.querySelectorAll('.screen');
    for (var i = 0; i < screens.length; i++) {
      screens[i].classList.remove('active');
    }
    var target = document.getElementById(screenId);
    if (target) target.classList.add('active');

    var titleSpan = document.querySelector('h1 [data-i18n="title_yacht"]') || document.querySelector('h1 [data-i18n="title_yahtzee"]');
    var I18n = window.YachtGame.I18n;
    if (screenId === 'screen-game') {
      document.body.classList.add('in-game');
      if (titleSpan) {
        var gameTitle = I18n ? (gameMode === 'yahtzee' ? I18n.t('title_yahtzee') : I18n.t('title_yacht')) : 'Yacht Dice';
        titleSpan.textContent = gameTitle;
        titleSpan.setAttribute('data-i18n', gameMode === 'yahtzee' ? 'title_yahtzee' : 'title_yacht');
      }
    } else {
      document.body.classList.remove('in-game');
      document.body.classList.remove('is-bot-game');
      document.body.classList.remove('fast-mode');
      if (titleSpan) {
        titleSpan.textContent = I18n ? I18n.t('title_yacht') : 'Yacht Dice';
        titleSpan.setAttribute('data-i18n', 'title_yacht');
      }
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
    var duration = Math.max(3100, 1500 + message.length * 50);
    setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, duration);
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
    if (!btn) return;
    btn.disabled = show;
    if (show) {
      if (!btn.getAttribute('data-original-text')) {
        btn.setAttribute('data-original-text', btn.textContent);
      }
      btn.innerHTML = '<span class="btn-dice-spinner"></span>';
    } else {
      var orig = btn.getAttribute('data-original-text');
      if (orig) {
        btn.textContent = orig;
        btn.removeAttribute('data-original-text');
      }
    }
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
    html += '<colgroup><col style="width:30%"><col style="width:35%"><col style="width:35%"></colgroup>';
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
    initScorecardDelegation();
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

  function showCellLoading(category) {
    var old = document.querySelector('.score-confirm-hint');
    if (old) old.remove();
    var cell = document.querySelector('.score-cell[data-category="' + category + '"]');
    if (!cell) return;
    cell.classList.add('loading');
    cell.classList.remove('pending', 'preview');
    cell.innerHTML = '<span class="btn-dice-spinner"></span>';
  }

  function hideCellLoading() {
    var cells = document.querySelectorAll('.score-cell.loading');
    for (var i = 0; i < cells.length; i++) {
      cells[i].classList.remove('loading');
    }
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
    var currentStreak = stats.currentStreak || 0;
    var html = '<div class="stats-grid">';
    html += '<div class="stat-winrate-streak-col">';
    html += '<div class="stat-card stat-winrate"><div class="stat-value">' + winRate + '%</div><div class="stat-label">' + (I18n ? I18n.t('win_rate') : 'Win Rate') + '</div></div>';
    html += '<div class="stat-card stat-streak"><div class="stat-value">' + currentStreak + '</div><div class="stat-label">' + (I18n ? I18n.t('current_streak') : 'Streak') + '</div></div>';
    html += '</div>';
    html += '<div class="result-criteria-box" style="grid-column: span 3;">';
    html += '<div class="result-criteria-title">' + (I18n ? I18n.t('result_criteria_title') : 'Result Criteria') + '</div>';
    html += '<div class="result-criteria-item"><span class="result-win">' + (I18n ? I18n.t('result_w_label') : 'Win') + '</span>: ' + (I18n ? I18n.t('result_criteria_win') : 'Higher score than opponent') + '</div>';
    html += '<div class="result-criteria-item"><span class="result-loss">' + (I18n ? I18n.t('result_l_label') : 'Loss') + '</span>: ' + (I18n ? I18n.t('result_criteria_loss') : 'Lower score or forfeit') + '</div>';
    html += '<div class="result-criteria-item"><span class="result-tie">' + (I18n ? I18n.t('result_t_label') : 'Tie') + '</span>: ' + (I18n ? I18n.t('result_criteria_tie') : 'Same score as opponent') + '</div>';
    html += '<div class="result-criteria-item"><b>' + (I18n ? I18n.t('result_inv_label') : 'Invalid') + '</b>: ' + (I18n ? I18n.t('result_criteria_invalid') : 'Below min score (Yacht 50 / Yahtzee 100)') + '</div>';
    html += '<div class="result-criteria-note">*' + (I18n ? I18n.t('result_criteria_invalid2') : 'Invalid games not counted in win rate') + '</div>';
    html += '</div>';
    html += '<div class="stat-card"><div class="stat-value">' + stats.totalGames + '</div><div class="stat-label">' + (I18n ? I18n.t('games') : 'Games') + '</div></div>';
    html += '<div class="stat-card stat-win"><div class="stat-value">' + stats.wins + '</div><div class="stat-label">' + (I18n ? I18n.t('wins') : 'Wins') + '</div></div>';
    html += '<div class="stat-card stat-loss"><div class="stat-value">' + stats.losses + '</div><div class="stat-label">' + (I18n ? I18n.t('losses') : 'Losses') + '</div></div>';
    html += '<div class="stat-card"><div class="stat-value">' + stats.ties + '</div><div class="stat-label">' + (I18n ? I18n.t('ties') : 'Ties') + '</div></div>';
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
      var resultClass = g.result === 'win' ? 'result-win' : (g.result === 'loss' ? 'result-loss' : (g.result === 'invalid' ? 'result-invalid' : 'result-tie'));
      var resultText;
      if (g.result === 'win') resultText = I18n ? I18n.t('result_w') : 'W';
      else if (g.result === 'loss') resultText = I18n ? I18n.t('result_l') : 'L';
      else if (g.result === 'invalid') resultText = I18n ? I18n.t('result_inv') : 'INV';
      else resultText = I18n ? I18n.t('result_t') : 'T';
      var modeText = g.mode ? (I18n ? I18n.t('mode_' + g.mode) : g.mode) : '-';
      listHtml += '<tr>';
      listHtml += '<td>' + dateStr + '</td>';
      listHtml += '<td>' + escapeHtml(modeText) + '</td>';
      var oppName = g.opponentName || '-';
      if (I18n) {
        var lang = I18n.getLang();
        if (oppName === 'Basic Bot') oppName = I18n.t('basic_bot');
        else if (oppName === 'Gambler Bot') oppName = I18n.t('gambler_bot');
        else if (oppName === 'Wave Bot') oppName = I18n.t('wave_bot');
        else oppName = (lang === 'ko' ? g.oppNicknameKo : g.oppNicknameEn) || g.oppNicknameKo || g.oppNicknameEn || g.opponentName || '-';
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

  // --- Default confetti helpers ---
  var DEFAULT_COLORS = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#ff6bcb', '#a66cff'];
  function defaultCreateParticles(canvas) {
    var particles = [];
    for (var i = 0; i < 120; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: -10 - Math.random() * canvas.height * 0.5,
        w: 4 + Math.random() * 6,
        h: 6 + Math.random() * 10,
        color: DEFAULT_COLORS[Math.floor(Math.random() * DEFAULT_COLORS.length)],
        vx: (Math.random() - 0.5) * 4,
        vy: 2 + Math.random() * 4,
        rotation: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 10
      });
    }
    return particles;
  }
  function defaultUpdateParticle(p) {
    p.x += p.vx;
    p.vy += 0.08;
    p.y += p.vy;
    p.rotation += p.rotSpeed;
  }
  function defaultRenderParticle(ctx, p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation * Math.PI / 180);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    ctx.restore();
  }

  // --- Skin-specific celebration effects ---
  var CELEBRATION_EFFECTS = {
    // Banana: bouncing monkey & banana emoji
    banana: {
      createParticles: function(canvas) {
        var emojis = ['\uD83D\uDC12', '\uD83C\uDF4C'];
        var particles = [];
        for (var i = 0; i < 80; i++) {
          particles.push({
            x: Math.random() * canvas.width,
            y: -30 - Math.random() * canvas.height * 0.5,
            size: 30 + Math.random() * 18,
            emoji: emojis[Math.floor(Math.random() * emojis.length)],
            vx: (Math.random() - 0.5) * 4,
            vy: 2 + Math.random() * 3,
            rotation: Math.random() * 360,
            rotSpeed: (Math.random() - 0.5) * 8,
            canvasH: canvas.height,
            bounces: 0
          });
        }
        return particles;
      },
      updateParticle: function(p) {
        p.x += p.vx;
        p.vy += 0.12;
        p.y += p.vy;
        p.rotation += p.rotSpeed;
        // Bounce off bottom
        if (p.y > p.canvasH - 20 && p.bounces < 3) {
          p.y = p.canvasH - 20;
          p.vy = -p.vy * 0.55;
          p.bounces++;
        }
      },
      renderParticle: function(ctx, p) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation * Math.PI / 180);
        ctx.font = p.size + 'px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.emoji, 0, 0);
        ctx.restore();
      }
    },

    // Fire: flames rising from bottom + sparks (bigger, brighter, faster)
    fire: {
      createParticles: function(canvas) {
        var colors = ['#ff4500', '#ff5500', '#ff6600', '#ff8c00', '#ffd700', '#ffff00'];
        var particles = [];
        for (var i = 0; i < 120; i++) {
          var isSpark = Math.random() < 0.3;
          particles.push({
            x: Math.random() * canvas.width,
            y: canvas.height + 10 + Math.random() * canvas.height * 0.3,
            size: isSpark ? 3 + Math.random() * 4 : 14 + Math.random() * 18,
            originalSize: 0,
            color: colors[Math.floor(Math.random() * colors.length)],
            vx: (Math.random() - 0.5) * 4,
            vy: -(5 + Math.random() * 7),
            isSpark: isSpark,
            alpha: 1
          });
          particles[particles.length - 1].originalSize = particles[particles.length - 1].size;
        }
        return particles;
      },
      updateParticle: function(p) {
        p.x += p.vx;
        p.y += p.vy;
        p.vx += (Math.random() - 0.5) * 0.5;
        if (!p.isSpark) {
          p.size *= 0.988;
          p.vy *= 0.997;
        } else {
          p.vy += 0.04;
        }
      },
      renderParticle: function(ctx, p) {
        if (p.size < 0.5) return;
        ctx.save();
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        if (!p.isSpark && p.size > 3) {
          var grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
          grad.addColorStop(0, '#ffffff');
          grad.addColorStop(0.2, p.color);
          grad.addColorStop(1, 'rgba(255,69,0,0)');
          ctx.fillStyle = grad;
        } else {
          ctx.fillStyle = p.color;
        }
        ctx.fill();
        ctx.restore();
      }
    },

    // Dragon: dramatic center appearance with fire burst
    dragon: {
      animate: function(canvas, ctx) {
        var cx = canvas.width / 2;
        var cy = canvas.height / 2;
        var maxSize = Math.min(canvas.width, canvas.height) * 0.35;
        var frame = 0;
        var totalFrames = 130;
        var burstParticles = [];

        // Create burst particles at frame 50
        function createBurst() {
          var colors = ['#ff4500', '#ff6600', '#ffd700', '#ff8c00'];
          for (var i = 0; i < 60; i++) {
            var angle = Math.random() * Math.PI * 2;
            var speed = 3 + Math.random() * 6;
            burstParticles.push({
              x: cx, y: cy,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              size: 3 + Math.random() * 5,
              color: colors[Math.floor(Math.random() * colors.length)],
              alpha: 1
            });
          }
        }

        function animate() {
          frame++;
          if (frame > totalFrames) {
            if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
            return;
          }
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          var globalAlpha = frame > totalFrames - 25 ? (totalFrames - frame) / 25 : 1;
          ctx.globalAlpha = globalAlpha;

          // Phase 1 (1-40): Scale up with ease-out
          // Phase 2 (40-60): Pulse glow + shake
          // Phase 3 (50+): Fire burst
          var t, scale, fontSize, offsetX, offsetY;

          if (frame <= 40) {
            t = frame / 40;
            scale = 1 - Math.pow(1 - t, 3); // ease-out cubic
          } else {
            scale = 1;
          }

          fontSize = maxSize * scale;
          offsetX = 0;
          offsetY = 0;

          // Shake effect (frame 40-65)
          if (frame > 40 && frame <= 65) {
            var shakeIntensity = 4 * (1 - (frame - 40) / 25);
            offsetX = (Math.random() - 0.5) * shakeIntensity * 2;
            offsetY = (Math.random() - 0.5) * shakeIntensity * 2;
          }

          // Glow effect
          if (frame > 30 && frame <= 80) {
            var glowT = (frame - 30) / 50;
            var glowSize = 20 + Math.sin(glowT * Math.PI * 3) * 10;
            ctx.shadowColor = '#ff4500';
            ctx.shadowBlur = glowSize;
          } else {
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
          }

          // Draw dragon emoji
          if (fontSize > 1) {
            ctx.save();
            ctx.font = Math.round(fontSize) + 'px serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('\uD83D\uDC09', cx + offsetX, cy + offsetY);
            ctx.restore();
          }

          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;

          // Create burst at frame 50
          if (frame === 50) createBurst();

          // Update & render burst particles
          for (var i = 0; i < burstParticles.length; i++) {
            var bp = burstParticles[i];
            bp.x += bp.vx;
            bp.y += bp.vy;
            bp.vy += 0.08;
            bp.size *= 0.97;
            if (bp.size < 0.3) continue;
            ctx.save();
            ctx.beginPath();
            ctx.arc(bp.x, bp.y, bp.size, 0, Math.PI * 2);
            ctx.fillStyle = bp.color;
            ctx.fill();
            ctx.restore();
          }

          requestAnimationFrame(animate);
        }
        animate();
      }
    },

    // Flower: drifting petals (faster fall)
    flower: {
      createParticles: function(canvas) {
        var colors = ['#ffb7c5', '#ff69b4', '#ff1493', '#fff0f5', '#dda0dd', '#f8c8dc'];
        var particles = [];
        for (var i = 0; i < 80; i++) {
          particles.push({
            x: Math.random() * canvas.width,
            y: -15 - Math.random() * canvas.height * 0.4,
            size: 6 + Math.random() * 8,
            color: colors[Math.floor(Math.random() * colors.length)],
            vx: (Math.random() - 0.5) * 1.5,
            vy: 2 + Math.random() * 2.5,
            rotation: Math.random() * 360,
            rotSpeed: (Math.random() - 0.5) * 3,
            phase: Math.random() * Math.PI * 2,
            age: 0
          });
        }
        return particles;
      },
      updateParticle: function(p, frame) {
        p.age++;
        p.x += p.vx + Math.sin(p.age * 0.04 + p.phase) * 1.2;
        p.vy += 0.03;
        p.y += p.vy;
        p.rotation += p.rotSpeed;
      },
      renderParticle: function(ctx, p) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation * Math.PI / 180);
        ctx.fillStyle = p.color;
        // Draw petal shape using bezier curves
        ctx.beginPath();
        ctx.moveTo(0, -p.size);
        ctx.bezierCurveTo(p.size * 0.8, -p.size * 0.6, p.size * 0.8, p.size * 0.6, 0, p.size);
        ctx.bezierCurveTo(-p.size * 0.8, p.size * 0.6, -p.size * 0.8, -p.size * 0.6, 0, -p.size);
        ctx.fill();
        ctx.restore();
      },
      maxFrames: 180
    },

    // Wave: rain + lightning (bigger, more visible)
    wave: {
      createParticles: function(canvas) {
        var colors = ['#4a90d9', '#5ba3e6', '#87ceeb', '#6db3f2', '#a0d2ff'];
        var particles = [];
        for (var i = 0; i < 120; i++) {
          particles.push({
            x: Math.random() * canvas.width,
            y: -10 - Math.random() * canvas.height,
            len: 18 + Math.random() * 22,
            color: colors[Math.floor(Math.random() * colors.length)],
            vx: -2 + Math.random() * 0.5,
            vy: 10 + Math.random() * 8,
            canvasH: canvas.height,
            canvasW: canvas.width
          });
        }
        particles._lightning = null;
        particles._lightningFrame = 0;
        return particles;
      },
      updateParticle: function(p, frame) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.y > p.canvasH + 20) {
          p.y = -20;
          p.x = Math.random() * p.canvasW;
        }
      },
      renderParticle: function(ctx, p, frame, particles) {
        ctx.save();
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2.5;
        ctx.globalAlpha = ctx.globalAlpha * 0.8;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + p.vx * 2, p.y + p.len);
        ctx.stroke();
        ctx.restore();
      },
      maxFrames: 180,
      afterRender: function(ctx, particles, frame, canvas) {
        // Lightning every ~30 frames, lasts 5 frames
        if (frame % 30 === 0 && frame > 0 && frame < 160) {
          var points = [];
          var lx = canvas.width * 0.15 + Math.random() * canvas.width * 0.7;
          var ly = 0;
          points.push({ x: lx, y: ly });
          while (ly < canvas.height) {
            lx += (Math.random() - 0.5) * 80;
            ly += 15 + Math.random() * 35;
            points.push({ x: lx, y: ly });
          }
          particles._lightning = points;
          particles._lightningFrame = frame;
        }
        if (particles._lightning && frame - particles._lightningFrame < 5) {
          var pts = particles._lightning;
          var lAlpha = 1 - (frame - particles._lightningFrame) * 0.2;
          ctx.save();
          // Outer glow
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 5;
          ctx.shadowColor = '#87ceeb';
          ctx.shadowBlur = 30;
          ctx.globalAlpha = lAlpha;
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (var j = 1; j < pts.length; j++) {
            ctx.lineTo(pts[j].x, pts[j].y);
          }
          ctx.stroke();
          // Bright core
          ctx.strokeStyle = '#e0f0ff';
          ctx.lineWidth = 2;
          ctx.shadowBlur = 0;
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (var k = 1; k < pts.length; k++) {
            ctx.lineTo(pts[k].x, pts[k].y);
          }
          ctx.stroke();
          ctx.restore();
        }
      }
    },

    // Star: shooting stars with thick trails
    star: {
      createParticles: function(canvas) {
        var colors = ['#ffd700', '#fff8dc', '#fffacd', '#f0e68c', '#ffffff'];
        var particles = [];
        for (var i = 0; i < 40; i++) {
          var fromLeft = Math.random() < 0.5;
          var dirX = fromLeft ? (4 + Math.random() * 6) : -(4 + Math.random() * 6);
          particles.push({
            x: fromLeft ? -20 : canvas.width + 20,
            y: Math.random() * canvas.height * 0.6,
            size: 4.5 + Math.random() * 3.5,
            color: colors[Math.floor(Math.random() * colors.length)],
            vx: dirX,
            vy: 2 + Math.random() * 3,
            spawnFrame: Math.floor(Math.random() * 80),
            trail: [],
            active: false
          });
        }
        return particles;
      },
      updateParticle: function(p, frame) {
        if (frame < p.spawnFrame) return;
        p.active = true;
        p.trail.push({ x: p.x, y: p.y });
        if (p.trail.length > 12) p.trail.shift();
        p.x += p.vx;
        p.y += p.vy;
      },
      renderParticle: function(ctx, p) {
        if (!p.active) return;
        ctx.save();
        // Draw trail
        for (var t = 0; t < p.trail.length; t++) {
          var tAlpha = (t + 1) / p.trail.length * 0.6;
          var tSize = p.size * (t + 1) / p.trail.length * 0.7;
          ctx.beginPath();
          ctx.arc(p.trail[t].x, p.trail[t].y, tSize, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.globalAlpha = ctx.globalAlpha * tAlpha;
          ctx.fill();
          ctx.globalAlpha = ctx.globalAlpha / tAlpha;
        }
        // Draw star head
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 15;
        ctx.fill();
        ctx.restore();
      },
      maxFrames: 130
    }
  };

  function showConfetti(overrideSkinId) {
    var existing = document.getElementById('confetti-canvas');
    if (existing) existing.remove();
    var canvas = document.createElement('canvas');
    canvas.id = 'confetti-canvas';
    canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999';
    document.body.appendChild(canvas);
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    var ctx = canvas.getContext('2d');

    var skinId = overrideSkinId || (window.YachtGame.DiceSkins && window.YachtGame.DiceSkins.getCurrentSkin()) || 'classic';
    var effect = CELEBRATION_EFFECTS[skinId];

    // Dragon: fully custom animation
    if (effect && effect.animate) {
      effect.animate(canvas, ctx);
      return;
    }

    var createFn = (effect && effect.createParticles) || defaultCreateParticles;
    var updateFn = (effect && effect.updateParticle) || defaultUpdateParticle;
    var renderFn = (effect && effect.renderParticle) || defaultRenderParticle;
    var afterFn = effect && effect.afterRender;
    var maxFrames = (effect && effect.maxFrames) || 150;

    var particles = createFn(canvas);
    var frame = 0;

    function animate() {
      frame++;
      if (frame > maxFrames) {
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        return;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      var alpha = frame > maxFrames - 30 ? (maxFrames - frame) / 30 : 1;
      ctx.globalAlpha = alpha;
      for (var i = 0; i < particles.length; i++) {
        updateFn(particles[i], frame);
        renderFn(ctx, particles[i], frame, particles);
      }
      if (afterFn) afterFn(ctx, particles, frame, canvas);
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
    showCellLoading: showCellLoading,
    hideCellLoading: hideCellLoading,
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
