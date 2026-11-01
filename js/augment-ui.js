// Augment mode UI: pick modal, reveal, augment bar, active-augment sheets,
// score-preview adjustment and roll-cap info. Server rules live in functions/game-rules.js.
(function () {
  'use strict';

  window.YachtGame = window.YachtGame || {};

  var room = null;
  var myKey = null;
  var oppKey = null;
  var doubleArmed = false;
  var pickPending = false;
  var lastRevealKey = null;
  var lastSwapKey = null;
  var lastSealed = null;
  var lastOppFilled = -1;
  var initialized = false;
  var pickFn = null;
  var useFn = null;

  function Aug() { return window.YachtGame.Augments; }
  function t(key, fallback) {
    var I18n = window.YachtGame.I18n;
    var v = I18n ? I18n.t(key) : key;
    return (v && v !== key) ? v : (fallback || key);
  }
  function augName(id) { return t('aug_name_' + id, id); }
  function augDesc(id) { return t('aug_desc_' + id, ''); }
  function catName(c) { return window.YachtGame.Scoring.getDisplayName(c); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  function fns() {
    if (!pickFn) {
      pickFn = window.YachtGame.functions.httpsCallable('pickAugment');
      useFn = window.YachtGame.functions.httpsCallable('useAugment');
    }
  }
  function toArray(v) {
    if (!v) return [];
    if (Array.isArray(v)) return v;
    return Object.keys(v).map(function (k) { return v[k]; });
  }
  function augOf(p) {
    var a = (p && p.aug) || {};
    return { owned: toArray(a.owned), charges: a.charges || {} };
  }
  function isActive() {
    return !!(room && room.augmentMode === true && room.gameMode === 'yacht');
  }
  function filled(scores, c) { return scores && scores[c] !== null && scores[c] !== undefined; }
  function scoresOf(pk) { return (room && room.players && room.players[pk] && room.players[pk].scores) || {}; }
  function diceValues() {
    var out = [];
    for (var i = 0; i < 5; i++) out.push((room.dice && room.dice[i] && room.dice[i].value) || 0);
    return out;
  }
  function isMyTurn() { return room && room.status === 'playing' && room.currentTurn === myKey && !room.augmentPhase; }
  function gameRolling() { return window.YachtGame.Game && window.YachtGame.Game.isRolling && window.YachtGame.Game.isRolling(); }

  // ─── Roll info (used by game.js for the roll button) ───
  function rollInfo(r, pk) {
    r = r || room;
    var rc = (r && r.rollCount) || 0;
    if (!r || r.augmentMode !== true || r.gameMode !== 'yacht') {
      return { cap: 3, canRoll: rc < 3, extra: false, extraLeft: 0 };
    }
    var A = Aug();
    var me = r.players[pk || r.currentTurn];
    var opp = r.players[(pk || r.currentTurn) === 'player1' ? 'player2' : 'player1'];
    var aug = augOf(me);
    var flags = r.turnFlags || {};
    var Scoring = window.YachtGame.Scoring;
    var cap = rc === 0
      ? A.rollCap(aug, Scoring.totalScore((me && me.scores) || {}, 'yacht'), Scoring.totalScore((opp && opp.scores) || {}, 'yacht'))
      : (flags.rollCap || 3);
    var extraLeft = A.charge(aug, 'extraRoll');
    var extra = rc >= cap && rc < A.MAX_ROLLS && extraLeft > 0;
    var canRoll = !r.augmentPhase && !flags.locked && (rc < cap || extra);
    return { cap: cap, canRoll: canRoll, extra: extra, extraLeft: extraLeft, locked: !!flags.locked };
  }

  // ─── Score previews (ui.js renderScorecard hook) ───
  function adjustPreviews(previews, currentDice) {
    if (!isActive() || !room.currentTurn || !previews) return previews;
    var A = Aug();
    var pk = room.currentTurn;
    var p = room.players[pk];
    var aug = augOf(p);
    var flags = room.turnFlags || {};
    var out = {};
    for (var c in previews) {
      if (!previews.hasOwnProperty(c)) continue;
      if (c === 'yacht' && flags.noYacht) continue; // blocked: rendered as '-' and not clickable
      var useDouble = pk === myKey && doubleArmed && c !== 'yacht';
      out[c] = A.finalScore(currentDice, c, { aug: aug, sealed: p.sealed, useDouble: useDouble }).score;
    }
    return out;
  }

  // Marks sealed cells after the scorecard is rendered (rows carry data-cat).
  function decorateScorecard(container) {
    if (!isActive() || !container) return;
    var pairs = [[myKey, 1], [oppKey, 2]];
    for (var i = 0; i < pairs.length; i++) {
      var p = room.players[pairs[i][0]];
      if (!p || !p.sealed) continue;
      var row = container.querySelector('tr[data-cat="' + p.sealed + '"]');
      if (!row || !row.children[pairs[i][1]]) continue;
      var cell = row.children[pairs[i][1]];
      cell.classList.add('aug-sealed');
      cell.setAttribute('title', augName('seal'));
    }
  }

  // ─── Overlays ───
  function overlay(id) {
    var el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      el.className = 'overlay hidden aug-overlay';
      el.innerHTML = '<div class="overlay-content aug-sheet"></div>';
      document.body.appendChild(el);
    }
    return el;
  }
  function closeOverlay(id) {
    var el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  }

  function renderPickModal() {
    var el = overlay('aug-pick');
    var phase = room.augmentPhase;
    if (!phase || room.status !== 'playing') { el.classList.add('hidden'); pickPending = false; return; }
    var offers = toArray(phase.offers && phase.offers[myKey]);
    var ready = phase.ready && phase.ready[myKey];
    var oppReady = phase.ready && phase.ready[oppKey];
    var html = '<div class="aug-tier-badge tier-' + phase.tier + '">' + esc(t('aug_tier_' + phase.tier)) + '</div>';
    html += '<h3 class="aug-title">' + esc(t('aug_pick_title')) + '</h3>';
    if (ready || pickPending) {
      html += '<p class="aug-sub">' + esc(t('aug_waiting_opp')) + '</p><div class="spinner"></div>';
    } else {
      html += '<p class="aug-sub">' + esc(t('aug_pick_sub')) + (oppReady ? ' ✓' : '') + '</p>';
      html += '<div class="aug-cards">';
      for (var i = 0; i < offers.length; i++) {
        html += '<button class="aug-card tier-' + phase.tier + '" data-aug="' + esc(offers[i]) + '">' +
          '<span class="aug-card-name">' + esc(augName(offers[i])) + '</span>' +
          '<span class="aug-card-desc">' + esc(augDesc(offers[i])) + '</span></button>';
      }
      html += '</div>';
    }
    el.firstChild.innerHTML = html;
    el.classList.remove('hidden');
    var cards = el.querySelectorAll('.aug-card');
    for (var j = 0; j < cards.length; j++) {
      cards[j].addEventListener('click', onPick);
    }
  }

  function onPick(e) {
    var id = e.currentTarget.getAttribute('data-aug');
    if (!id || pickPending || !room) return;
    fns();
    pickPending = true;
    renderPickModal();
    pickFn({ roomCode: currentRoomCode(), augmentId: id }).catch(function (err) {
      pickPending = false;
      window.YachtGame.UI.showToast(err.message || 'Error');
      renderPickModal();
    });
  }

  function renderReveal() {
    var rv = room.augmentReveal;
    if (!rv) return;
    var key = rv.tier + ':' + rv.player1 + ':' + rv.player2;
    if (key === lastRevealKey) return;
    var first = lastRevealKey === null && !initialized;
    lastRevealKey = key;
    if (first) return; // already revealed before this client attached
    pickPending = false;
    var el = overlay('aug-reveal');
    var html = '<div class="aug-tier-badge tier-' + rv.tier + '">' + esc(t('aug_tier_' + rv.tier)) + '</div>';
    html += '<h3 class="aug-title">' + esc(t('aug_revealed')) + '</h3><div class="aug-reveal-grid">';
    var rows = [[t('aug_you'), rv[myKey], 'mine'], [t('aug_opp'), rv[oppKey], 'opp']];
    for (var i = 0; i < rows.length; i++) {
      html += '<div class="aug-reveal-row ' + rows[i][2] + '"><span class="aug-reveal-who">' + esc(rows[i][0]) + '</span>' +
        '<span class="aug-card-name">' + esc(augName(rows[i][1])) + '</span>' +
        '<span class="aug-card-desc">' + esc(augDesc(rows[i][1])) + '</span></div>';
    }
    html += '</div><button class="btn-primary aug-close">' + esc(t('aug_ok')) + '</button>';
    el.firstChild.innerHTML = html;
    el.classList.remove('hidden');
    el.querySelector('.aug-close').addEventListener('click', function () { closeOverlay('aug-reveal'); });
  }

  // ─── Augment bar ───
  function chipState(id, aug) {
    var A = Aug();
    var def = A.DEFS[id];
    var flags = room.turnFlags || {};
    var rc = room.rollCount || 0;
    var my = isMyTurn();
    var left = def.pool ? A.charge(aug, def.pool) : null;
    var usable = false;
    if (def.kind === 'dieEdit') {
      var cats = window.YachtGame.Scoring.getCategories('yacht');
      var needNonYacht = id === 'copy' || id === 'wild';
      var hasNonYacht = cats.some(function (c) { return c !== 'yacht' && !filled(scoresOf(myKey), c); });
      usable = my && left > 0 && rc >= 1 && !flags.dieEdited && (!needNonYacht || hasNonYacht);
    } else if (id === 'seal') {
      usable = my && left > 0 && !room.players[oppKey].sealed && sealTargets().length > 0;
    } else if (id === 'swap') {
      usable = my && left > 0 && swapTargets().length > 0;
    } else if (id === 'double') {
      usable = my && left > 0;
    }
    return { def: def, left: left, usable: usable };
  }

  function renderBar() {
    var bar = document.getElementById('augment-bar');
    if (!bar) return;
    if (!isActive()) { bar.classList.add('hidden'); bar.innerHTML = ''; return; }
    var mine = augOf(room.players[myKey]);
    var theirs = augOf(room.players[oppKey]);
    var html = '<div class="aug-row mine">';
    if (!mine.owned.length) html += '<span class="aug-empty">' + esc(t('aug_you')) + ' —</span>';
    var seenPools = {};
    for (var i = 0; i < mine.owned.length; i++) {
      var id = mine.owned[i];
      var st = chipState(id, mine);
      var poolShared = st.def.pool && seenPools[st.def.pool];
      if (st.def.pool) seenPools[st.def.pool] = true;
      var badge = st.left !== null && !poolShared ? '<span class="aug-badge">' + st.left + '</span>' : '';
      var interactive = st.def.kind === 'dieEdit' || st.def.kind === 'target' || st.def.kind === 'toggle';
      var cls = 'aug-chip tier-' + st.def.tier + (interactive ? ' active-kind' : '') +
        (id === 'double' && doubleArmed ? ' armed' : '') + (st.left === 0 ? ' spent' : '');
      if (interactive) {
        html += '<button class="' + cls + '" data-aug="' + id + '"' + (st.usable ? '' : ' disabled') +
          ' title="' + esc(augDesc(id)) + '">' + esc(augName(id)) + badge + '</button>';
      } else {
        html += '<span class="' + cls + '" title="' + esc(augDesc(id)) + '">' + esc(augName(id)) + badge + '</span>';
      }
    }
    html += '</div><div class="aug-row opp"><span class="aug-row-label">' + esc(t('aug_opp')) + '</span>';
    for (var j = 0; j < theirs.owned.length; j++) {
      var oid = theirs.owned[j];
      var od = Aug().DEFS[oid];
      var ol = od.pool ? Aug().charge(theirs, od.pool) : null;
      html += '<span class="aug-chip opp-chip tier-' + od.tier + (ol === 0 ? ' spent' : '') + '" title="' + esc(augDesc(oid)) + '">' +
        esc(augName(oid)) + (ol !== null ? '<span class="aug-badge">' + ol + '</span>' : '') + '</span>';
    }
    html += '</div>';
    bar.innerHTML = html;
    bar.classList.remove('hidden');
    var btns = bar.querySelectorAll('button.aug-chip');
    for (var k = 0; k < btns.length; k++) btns[k].addEventListener('click', onChip);
  }

  function onChip(e) {
    if (gameRolling()) return; // dice still animating; state will settle on the next snapshot
    var id = e.currentTarget.getAttribute('data-aug');
    var def = Aug().DEFS[id];
    if (id === 'double') {
      doubleArmed = !doubleArmed;
      window.YachtGame.UI.showToast(t(doubleArmed ? 'aug_double_on' : 'aug_double_off'));
      renderBar();
      if (window.YachtGame.Game && window.YachtGame.Game.refreshUI) window.YachtGame.Game.refreshUI();
      return;
    }
    if (def.kind === 'dieEdit') openDieSheet(id === 'nudge' ? 'nudge' : id === 'fineTune' ? 'adjust' : id);
    else if (id === 'seal') openTargetSheet('seal');
    else if (id === 'swap') openTargetSheet('swap');
  }

  // ─── Active augment sheets ───
  function sealTargets() {
    var opp = scoresOf(oppKey);
    return window.YachtGame.Scoring.getCategories('yacht').filter(function (c) { return !filled(opp, c); });
  }
  function swapTargets() {
    var me = scoresOf(myKey), opp = scoresOf(oppKey);
    return Aug().UPPER.filter(function (c) { return filled(me, c) && filled(opp, c) && me[c] !== opp[c]; });
  }

  function dieFace(v) { return '<span class="aug-die">' + (v || '?') + '</span>'; }

  // type: copy | adjust | nudge | wild
  function openDieSheet(type) {
    var el = overlay('aug-sheet');
    var dice = diceValues();
    var state = { die: null };
    function draw() {
      var html = '<h3 class="aug-title">' + esc(augName(type === 'adjust' ? 'fineTune' : type)) + '</h3>';
      if (state.die === null) {
        html += '<p class="aug-sub">' + esc(t('aug_choose_die')) + '</p><div class="aug-choice-row">';
        for (var i = 0; i < 5; i++) {
          var ok = type !== 'nudge' || dice[i] < 6;
          if (type === 'copy') ok = dice.some(function (v, j) { return j !== i && v !== dice[i]; });
          html += '<button class="aug-choice" data-die="' + i + '"' + (ok ? '' : ' disabled') + '>' + dieFace(dice[i]) + '</button>';
        }
        html += '</div>';
      } else {
        var cur = dice[state.die];
        html += '<p class="aug-sub">' + esc(t(type === 'copy' ? 'aug_choose_source' : 'aug_choose_value')) + '</p><div class="aug-choice-row">';
        if (type === 'copy') {
          for (var j = 0; j < 5; j++) {
            if (j === state.die || dice[j] === cur) continue;
            html += '<button class="aug-choice" data-from="' + j + '">' + dieFace(dice[j]) + '</button>';
          }
        } else {
          var vals = type === 'adjust' ? [cur - 1, cur + 1] : type === 'nudge' ? [cur + 1] : [1, 2, 3, 4, 5, 6];
          for (var k = 0; k < vals.length; k++) {
            if (vals[k] < 1 || vals[k] > 6 || vals[k] === cur) continue;
            html += '<button class="aug-choice" data-value="' + vals[k] + '">' + dieFace(vals[k]) + '</button>';
          }
        }
        html += '</div>';
      }
      html += '<button class="btn-secondary aug-close">' + esc(t('aug_cancel')) + '</button>';
      el.firstChild.innerHTML = html;
      el.classList.remove('hidden');
      el.querySelector('.aug-close').addEventListener('click', function () { closeOverlay('aug-sheet'); });
      var choices = el.querySelectorAll('.aug-choice');
      for (var m = 0; m < choices.length; m++) choices[m].addEventListener('click', onChoice);
    }
    function onChoice(e) {
      var b = e.currentTarget;
      if (b.hasAttribute('data-die')) {
        state.die = parseInt(b.getAttribute('data-die'), 10);
        if (type === 'nudge') return submit({ type: 'nudge', die: state.die });
        return draw();
      }
      if (b.hasAttribute('data-from')) return submit({ type: 'copy', die: state.die, from: parseInt(b.getAttribute('data-from'), 10) });
      var v = parseInt(b.getAttribute('data-value'), 10);
      if (type === 'adjust') return submit({ type: 'adjust', die: state.die, delta: v - dice[state.die] });
      return submit({ type: 'wild', die: state.die, value: v });
    }
    draw();
  }

  function openTargetSheet(type) {
    var el = overlay('aug-sheet');
    var targets = type === 'seal' ? sealTargets() : swapTargets();
    var me = scoresOf(myKey), opp = scoresOf(oppKey);
    var html = '<h3 class="aug-title">' + esc(augName(type)) + '</h3>';
    html += '<p class="aug-sub">' + esc(t(type === 'seal' ? 'aug_choose_seal' : 'aug_choose_swap')) + '</p>';
    if (!targets.length) html += '<p class="aug-sub">' + esc(t('aug_no_target')) + '</p>';
    html += '<div class="aug-target-list">';
    for (var i = 0; i < targets.length; i++) {
      var c = targets[i];
      var extra = type === 'swap' ? ' <span class="aug-swap-vals">' + me[c] + ' ⇄ ' + opp[c] + '</span>' : '';
      html += '<button class="aug-target" data-cat="' + c + '">' + esc(catName(c)) + extra + '</button>';
    }
    html += '</div><button class="btn-secondary aug-close">' + esc(t('aug_cancel')) + '</button>';
    el.firstChild.innerHTML = html;
    el.classList.remove('hidden');
    el.querySelector('.aug-close').addEventListener('click', function () { closeOverlay('aug-sheet'); });
    var btns = el.querySelectorAll('.aug-target');
    for (var j = 0; j < btns.length; j++) {
      btns[j].addEventListener('click', function (e) {
        submit({ type: type, category: e.currentTarget.getAttribute('data-cat') });
      });
    }
  }

  function submit(action) {
    fns();
    var el = document.getElementById('aug-sheet');
    if (el) {
      var b = el.querySelectorAll('button');
      for (var i = 0; i < b.length; i++) b[i].disabled = true;
    }
    useFn({ roomCode: currentRoomCode(), action: action }).then(function () {
      closeOverlay('aug-sheet');
      if (action.type === 'swap') {
        window.YachtGame.UI.showToast(t('aug_swap_toast_me') + catName(action.category));
      }
    }).catch(function (err) {
      closeOverlay('aug-sheet');
      window.YachtGame.UI.showToast(err.message || 'Error');
    });
  }

  // ─── Notifications driven by room changes ───
  function notify(prev) {
    var UI = window.YachtGame.UI;
    var me = room.players[myKey] || {};
    var opp = room.players[oppKey] || {};
    // Opponent sealed one of my categories
    if (me.sealed && me.sealed !== lastSealed && initialized) {
      UI.showToast(t('aug_sealed_toast') + catName(me.sealed));
    }
    lastSealed = me.sealed || null;
    // Opponent swap
    var sw = room.lastSwap;
    var swKey = sw ? sw.by + ':' + sw.category + ':' + sw.ts : null;
    if (sw && swKey !== lastSwapKey && initialized && sw.by === oppKey) {
      UI.showToast(t('aug_swap_toast_opp') + catName(sw.category));
    }
    lastSwapKey = swKey;
    // Opponent scoring effects
    var oppFilled = window.YachtGame.Scoring.getCategories('yacht').filter(function (c) { return filled(opp.scores, c); }).length;
    if (initialized && oppFilled > lastOppFilled && lastOppFilled >= 0) {
      var eff = toArray(opp.lastEffects);
      if (eff.length) UI.showToast(t('aug_opp_effect') + eff.map(function (x) { return t('aug_effect_' + x, x); }).join(', '));
    }
    lastOppFilled = oppFilled;
  }

  // Result of my own selectCategory call.
  function onSelectResult(data) {
    doubleArmed = false;
    var eff = (data && data.effects) || [];
    if (eff.length) {
      window.YachtGame.UI.showToast(eff.map(function (x) { return t('aug_effect_' + x, x); }).join(', '));
    }
  }

  function renderGameOverExtras(r, pk) {
    room = r; myKey = pk; oppKey = pk === 'player1' ? 'player2' : 'player1';
    var host = document.getElementById('final-scores');
    if (!host || !isActive()) return;
    var html = '<div class="aug-gameover">';
    var log = toArray(room.stealLog);
    for (var i = 0; i < log.length; i++) {
      var who = log[i].by === myKey ? t('aug_you') : t('aug_opp');
      html += '<p>' + esc(who + t('aug_steal_line') + catName(log[i].category) + ' +' + log[i].amount) + '</p>';
    }
    html += '<p class="aug-note">' + esc(t('aug_game_note')) + '</p></div>';
    host.insertAdjacentHTML('beforeend', html);
  }

  var roomCodeGetter = null;
  function currentRoomCode() { return roomCodeGetter ? roomCodeGetter() : null; }

  // Called by game.js on every room snapshot (before its own re-render checks).
  function update(r, prev, pk) {
    room = r;
    myKey = pk;
    oppKey = pk === 'player1' ? 'player2' : 'player1';
    if (!isActive() || !room.players || !room.players[myKey] || !room.players[oppKey]) {
      var bar = document.getElementById('augment-bar');
      if (bar) bar.classList.add('hidden');
      return;
    }
    if (room.currentTurn !== myKey || room.status !== 'playing') doubleArmed = false;
    if (room.status !== 'playing') { closeOverlay('aug-pick'); closeOverlay('aug-sheet'); }
    renderPickModal();
    renderReveal();
    notify(prev);
    renderBar();
    initialized = true;
  }

  // Signature of augment-only state, so game.js re-renders when it changes.
  function signature(r) {
    if (!r || r.augmentMode !== true) return '';
    var p = r.players || {};
    return JSON.stringify([r.augmentPhase || null, r.turnFlags || null,
      p.player1 && p.player1.aug, p.player2 && p.player2.aug,
      p.player1 && p.player1.sealed, p.player2 && p.player2.sealed]);
  }

  function reset(getRoomCode) {
    room = null; myKey = null; oppKey = null;
    doubleArmed = false; pickPending = false; initialized = false;
    lastRevealKey = null; lastSwapKey = null; lastSealed = null; lastOppFilled = -1;
    roomCodeGetter = getRoomCode || null;
    closeOverlay('aug-pick'); closeOverlay('aug-sheet'); closeOverlay('aug-reveal');
    var bar = document.getElementById('augment-bar');
    if (bar) { bar.classList.add('hidden'); bar.innerHTML = ''; }
  }

  window.YachtGame.AugmentUI = {
    update: update,
    reset: reset,
    signature: signature,
    rollInfo: rollInfo,
    adjustPreviews: adjustPreviews,
    decorateScorecard: decorateScorecard,
    isActive: isActive,
    isDoubleArmed: function () { return isActive() && doubleArmed; },
    onSelectResult: onSelectResult,
    renderGameOverExtras: renderGameOverExtras,
    refresh: function () { if (room && isActive()) { renderBar(); renderPickModal(); } }
  };
})();
