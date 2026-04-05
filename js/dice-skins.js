// Dice Skins: definitions, unlock logic, selection, persistence
//
// How to add a new skin:
// 1. Add { id, name, unlockAt } to SKIN_DEFS below (id = kebab-case)
// 2. If the skin has custom rendering (not standard pips), add a branch
//    in dice.js renderDie() and in renderSkinSelector() below
// 3. Define ALL visual styles in css/style.css only (no inline color values here)
//    Required CSS blocks: see CLAUDE.md "Dice Skin Addition Checklist"
// 4. Update the unlock count denominator in renderSkinSelector() below
(function () {
  'use strict';

  window.YachtGame = window.YachtGame || {};

  // Skin definitions in unlock order
  // unlockAt: number of totalGames required (0 = always available, -1 = bot unlock)
  // unlockBy: bot difficulty to beat for unlock (requires BOT_WIN_THRESHOLD wins)
  var BOT_WIN_THRESHOLD = 5;

  var SKIN_DEFS = [
    { id: 'classic',   name: 'Classic',   unlockAt: 0 },
    { id: 'ornate',    name: 'Ornate',    unlockAt: 3 },
    { id: 'bronze',    name: 'Bronze',    unlockAt: 6 },
    { id: 'marble',    name: 'Marble',    unlockAt: 9 },
    { id: 'crimson',   name: 'Crimson',   unlockAt: 12 },
    { id: 'hologram',  name: 'Hologram',  unlockAt: 15 },
    { id: 'circuit',   name: 'Circuit',   unlockAt: -1, unlockBy: 'basic' },
    { id: 'banana',    name: 'Banana',    unlockAt: -1, unlockAtWins: 25 },
    { id: 'carbon',    name: 'Carbon',    unlockAt: -1, unlockBy: 'gambler' },
    { id: 'wave',      name: 'Wave',      unlockAt: -1, unlockBy: 'wave' },
    { id: 'fire',      name: 'Fire',      unlockAt: -1, unlockAtStreak: 5 }
  ];

  // Calligraphy characters for Crimson skin
  var CRIMSON_CHARS = { 1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六' };

  var currentSkinId = 'classic';

  function getSkinDef(skinId) {
    for (var i = 0; i < SKIN_DEFS.length; i++) {
      if (SKIN_DEFS[i].id === skinId) return SKIN_DEFS[i];
    }
    return SKIN_DEFS[0];
  }

  function getUnlockedCount(totalGames, botWins, totalWins, maxStreak) {
    var count = 0;
    for (var i = 0; i < SKIN_DEFS.length; i++) {
      if (isSkinUnlocked(SKIN_DEFS[i], totalGames, botWins, totalWins, maxStreak)) count++;
    }
    return count;
  }

  function isSkinUnlocked(def, totalGames, botWins, totalWins, maxStreak) {
    if (def.unlockBy) {
      var wins = (botWins && botWins[def.unlockBy]) || 0;
      return wins >= BOT_WIN_THRESHOLD;
    }
    if (def.unlockAtWins) {
      return (totalWins || 0) >= def.unlockAtWins;
    }
    if (def.unlockAtStreak) {
      return (maxStreak || 0) >= def.unlockAtStreak;
    }
    return totalGames >= def.unlockAt;
  }

  function isUnlocked(skinId, totalGames, botWins, totalWins, maxStreak) {
    var def = getSkinDef(skinId);
    return isSkinUnlocked(def, totalGames, botWins, totalWins, maxStreak);
  }

  function applySkin(skinId) {
    var diceArea = document.getElementById('dice-area');
    if (!diceArea) return;

    currentSkinId = skinId || 'classic';
    diceArea.setAttribute('data-dice-skin', currentSkinId);
  }

  function saveSkin(skinId) {
    localStorage.setItem('yacht-dice-skin', skinId);
    var Auth = window.YachtGame.Auth;
    if (Auth && Auth.isSignedIn()) {
      var uid = Auth.getPlayerUid();
      if (uid) {
        window.YachtGame.db.ref('users/' + uid + '/preferences/diceSkin').set(skinId);
      }
    }
  }

  function loadSkin(callback) {
    var Auth = window.YachtGame.Auth;
    var cached = localStorage.getItem('yacht-dice-skin');

    // Guest: always use classic, ignore cached skin from previous account
    if (!Auth || !Auth.isSignedIn()) {
      applySkin('classic');
      if (callback) callback('classic');
      return;
    }

    // Signed in: apply cached immediately, then override from Firebase
    if (cached) {
      applySkin(cached);
    }

    if (Auth.isSignedIn()) {
      var uid = Auth.getPlayerUid();
      if (uid) {
        window.YachtGame.db.ref('users/' + uid + '/preferences/diceSkin').once('value', function (snap) {
          var fbSkin = snap.val();
          if (fbSkin) {
            applySkin(fbSkin);
            localStorage.setItem('yacht-dice-skin', fbSkin);
          }
          if (callback) callback(fbSkin || cached || 'classic');
        });
        return;
      }
    }
    if (callback) callback(cached || 'classic');
  }

  function renderSkinSelector(containerEl, totalGames, botWins, totalWins, maxStreak, currentStreak) {
    if (!containerEl) return;
    totalGames = totalGames || 0;
    totalWins = totalWins || 0;
    botWins = botWins || {};
    maxStreak = maxStreak || 0;
    currentStreak = currentStreak || 0;

    var playContainer = document.getElementById('skin-options-play');
    var botContainer = document.getElementById('skin-options-bot');
    // Fallback: if new containers don't exist, use old single container
    if (!playContainer) playContainer = containerEl;
    if (!botContainer) botContainer = containerEl;
    playContainer.innerHTML = '';
    botContainer.innerHTML = '';

    var unlockedCount = getUnlockedCount(totalGames, botWins, totalWins, maxStreak);
    var countEl = document.getElementById('skin-unlock-count');
    if (countEl) {
      var I18n = window.YachtGame.I18n;
      countEl.textContent = (unlockedCount - 1) + '/10 ' + (I18n ? I18n.t('skin_unlocked_count') : 'unlocked');
    }

    for (var i = 0; i < SKIN_DEFS.length; i++) {
      var def = SKIN_DEFS[i];
      var unlocked = isSkinUnlocked(def, totalGames, botWins, totalWins, maxStreak);
      var targetContainer = def.unlockBy ? botContainer : playContainer;

      var option = document.createElement('div');
      option.className = 'skin-option';
      if (!unlocked) option.classList.add('locked');
      if (def.id === currentSkinId) option.classList.add('active');
      option.setAttribute('data-skin-id', def.id);

      // Mini die preview showing value 5
      var miniDie = document.createElement('div');
      miniDie.className = 'skin-preview-die';
      miniDie.setAttribute('data-dice-skin', def.id);
      miniDie.setAttribute('data-value', '5');

      // For crimson, show calligraphy character
      if (def.id === 'crimson') {
        var charEl = document.createElement('span');
        charEl.className = 'crimson-char';
        charEl.textContent = CRIMSON_CHARS[5];
        miniDie.appendChild(charEl);
      } else if (def.id === 'banana') {
        var img = document.createElement('img');
        img.src = 'die_image/banana/banana5.png';
        img.className = 'banana-preview';
        img.alt = 'Banana 5';
        miniDie.appendChild(img);
      } else if (def.id === 'wave') {
        var img = document.createElement('img');
        img.src = 'die_image/wave/wave5.png';
        img.className = 'wave-preview';
        img.alt = 'Wave 5';
        miniDie.appendChild(img);
      } else if (def.id === 'fire') {
        var img = document.createElement('img');
        img.src = 'die_image/fire/fire5.png';
        img.className = 'fire-preview';
        img.alt = 'Fire 5';
        miniDie.appendChild(img);
      } else {
        // Render 5 pips in mini format
        var pipPositions = [1, 3, 5, 7, 9]; // value 5 layout
        for (var p = 1; p <= 9; p++) {
          var pip = document.createElement('div');
          pip.className = pipPositions.indexOf(p) !== -1 ? 'mini-pip' : 'mini-pip hidden';
          miniDie.appendChild(pip);
        }
      }

      option.appendChild(miniDie);

      // Skin name
      var nameEl = document.createElement('span');
      nameEl.className = 'skin-name';
      nameEl.textContent = def.name;
      option.appendChild(nameEl);

      // Lock icon (on die) + progress text (below name)
      if (!unlocked) {
        var lockEl = document.createElement('div');
        lockEl.className = 'lock-overlay';
        lockEl.textContent = '\uD83D\uDD12';
        option.appendChild(lockEl);

        var progressEl = document.createElement('span');
        progressEl.className = 'lock-progress';
        var I18n = window.YachtGame.I18n;
        if (def.unlockBy) {
          var wins = (botWins[def.unlockBy]) || 0;
          var botLabel = def.unlockBy === 'wave' ? (I18n ? I18n.t('wave') : 'Wave') : (def.unlockBy === 'gambler' ? (I18n ? I18n.t('gambler') : 'Gambler') : (I18n ? I18n.t('basic') : 'Basic'));
          progressEl.textContent = (I18n ? I18n.t('skin_vs_bot') : 'vs') + ' ' + botLabel + ' ' + wins + '/' + BOT_WIN_THRESHOLD;
        } else if (def.unlockAtStreak) {
          progressEl.textContent = currentStreak + '/' + def.unlockAtStreak + ' ' + (I18n ? I18n.t('skin_streak') : 'streak');
        } else if (def.unlockAtWins) {
          progressEl.textContent = totalWins + '/' + def.unlockAtWins + ' ' + (I18n ? I18n.t('skin_wins_count') : 'wins');
        } else {
          progressEl.textContent = totalGames + '/' + def.unlockAt + ' ' + (I18n ? I18n.t('skin_games_count') : 'games');
        }
        option.appendChild(progressEl);
      }

      // Click handler
      (function (skinDef, skinUnlocked, optionEl) {
        optionEl.addEventListener('click', function () {
          if (!skinUnlocked) return;
          var allOptions = containerEl.querySelectorAll('.skin-option.active');
          for (var j = 0; j < allOptions.length; j++) allOptions[j].classList.remove('active');
          optionEl.classList.add('active');
          applySkin(skinDef.id);
          saveSkin(skinDef.id);
        });
      })(def, unlocked, option);

      targetContainer.appendChild(option);
    }
  }

  // Pip layouts for mini dice faces: maps value → array of visible pip positions (1-9 grid)
  var MINI_PIP_LAYOUTS = {
    1: [5],
    2: [3, 7],
    3: [3, 5, 7],
    4: [1, 3, 7, 9],
    5: [1, 3, 5, 7, 9],
    6: [1, 3, 4, 6, 7, 9]
  };

  function renderMiniFaceHTML(skinId, value) {
    var html = '<div class="cube-face skin-preview-die" data-dice-skin="' + skinId + '" data-value="' + value + '">';
    if (skinId === 'crimson') {
      html += '<span class="crimson-char">' + (CRIMSON_CHARS[value] || '') + '</span>';
    } else if (skinId === 'banana') {
      html += '<img class="banana-preview" src="die_image/banana/banana' + value + '.png" alt="Banana ' + value + '">';
    } else if (skinId === 'wave') {
      html += '<img class="wave-preview" src="die_image/wave/wave' + value + '.png" alt="Wave ' + value + '">';
    } else if (skinId === 'fire') {
      html += '<img class="fire-preview" src="die_image/fire/fire' + value + '.png" alt="Fire ' + value + '">';
    } else {
      var positions = MINI_PIP_LAYOUTS[value] || [];
      for (var p = 1; p <= 9; p++) {
        html += '<div class="mini-pip' + (positions.indexOf(p) === -1 ? ' hidden' : '') + '"></div>';
      }
    }
    html += '</div>';
    return html;
  }

  function renderMiniDieHTML(skinId) {
    skinId = skinId || 'classic';
    var html = '<span class="header-die-cube">';
    html += '<span class="cube-inner" data-dice-skin="' + skinId + '">';
    html += renderMiniFaceHTML(skinId, 1);  // front
    html += renderMiniFaceHTML(skinId, 6);  // back
    html += renderMiniFaceHTML(skinId, 2);  // right
    html += renderMiniFaceHTML(skinId, 5);  // left
    html += renderMiniFaceHTML(skinId, 3);  // top
    html += renderMiniFaceHTML(skinId, 4);  // bottom
    html += '</span></span>';
    return html;
  }

  function getCurrentSkin() {
    return currentSkinId;
  }

  function getCrimsonChar(value) {
    return CRIMSON_CHARS[value] || '';
  }

  window.YachtGame.DiceSkins = {
    applySkin: applySkin,
    saveSkin: saveSkin,
    loadSkin: loadSkin,
    renderSkinSelector: renderSkinSelector,
    renderMiniDieHTML: renderMiniDieHTML,
    getCurrentSkin: getCurrentSkin,
    getCrimsonChar: getCrimsonChar,
    SKIN_DEFS: SKIN_DEFS
  };
})();
