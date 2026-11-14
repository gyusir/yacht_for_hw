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
    { id: 'fire',      name: 'Fire',      unlockAt: -1, unlockAtStreak: 5 },
    { id: 'star',      name: 'Star',      unlockAt: -1, unlockAtBotWinsTotal: 100 },
    { id: 'dragon',    name: 'Dragon',    unlockAt: -1, unlockAtExactScore: 256 },
    { id: 'flower',    name: 'Flower',    unlockAt: -1, unlockAtYachtStreak: 3 },
    { id: 'siru',      name: 'Siru',      unlockAt: -1, unlockAtWins: 1500 },
    // Ascend: evolves with augment picks in augment games (Lv1 → Lv3). Unlocked by augment-mode wins.
    { id: 'ascend',    name: 'Ascend',    unlockAt: -1, unlockAtAugmentWins: 5 },
    // Claude Ascend: Ascend in Claude colors (ivory + terracotta, spark pips). Worn by the room bot;
    // unlocked by beating it (room 7777) 5 times. The id is a skin token: base skin + '.' + color.
    { id: 'ascend.claude', name: 'Claude', unlockAt: -1, unlockAtClaudeWins: 5 }
  ];

  // ─── Skin tokens ───
  // A stored/synced skin value is a token: '<skin id>' or 'ascend.<color>'. Only Ascend has colors.
  // #dice-area and preview dice get data-dice-skin="<id>" plus data-dice-color="<color>".
  // Clicking the selected Ascend tile again cycles ASCEND_COLORS ('gold' = plain 'ascend').
  var ASCEND_COLORS = ['gold', 'blue', 'red', 'violet', 'green'];
  // Hue shift from the gold original, also used to tint the Ascend celebration canvas.
  var ASCEND_HUE = { gold: 0, blue: 180, red: -40, violet: -110, green: 85, claude: -22 };

  function parseSkin(token) {
    token = String(token || 'classic');
    var dot = token.indexOf('.');
    if (dot === -1) return { id: token, color: null };
    var id = token.slice(0, dot);
    var color = token.slice(dot + 1);
    if (id !== 'ascend' || !ASCEND_HUE.hasOwnProperty(color) || color === 'gold') return { id: id, color: null };
    return { id: id, color: color };
  }

  function skinToken(id, color) {
    return (id === 'ascend' && color && color !== 'gold') ? 'ascend.' + color : id;
  }

  function skinAttrs(token) {
    var s = parseSkin(token);
    return 'data-dice-skin="' + s.id + '"' + (s.color ? ' data-dice-color="' + s.color + '"' : '');
  }

  // Calligraphy characters for Crimson skin
  var CRIMSON_CHARS = { 1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六' };

  var currentSkinId = 'classic';
  var currentSkinColor = null;

  function getSkinDef(skinId) {
    for (var i = 0; i < SKIN_DEFS.length; i++) {
      if (SKIN_DEFS[i].id === skinId) return SKIN_DEFS[i];
    }
    return SKIN_DEFS[0];
  }

  function getUnlockedCount(totalGames, botWins, totalWins, maxStreak, achievements, augmentWins, claudeWins) {
    var count = 0;
    for (var i = 0; i < SKIN_DEFS.length; i++) {
      if (isSkinUnlocked(SKIN_DEFS[i], totalGames, botWins, totalWins, maxStreak, achievements, augmentWins, claudeWins)) count++;
    }
    return count;
  }

  function isSkinUnlocked(def, totalGames, botWins, totalWins, maxStreak, achievements, augmentWins, claudeWins) {
    if (def.unlockAtAugmentWins) {
      return (augmentWins || 0) >= def.unlockAtAugmentWins;
    }
    if (def.unlockAtClaudeWins) {
      return (claudeWins || 0) >= def.unlockAtClaudeWins;
    }
    if (def.unlockBy) {
      var wins = (botWins && botWins[def.unlockBy]) || 0;
      return wins >= BOT_WIN_THRESHOLD;
    }
    if (def.unlockAtWins) {
      return (totalWins || 0) >= def.unlockAtWins;
    }
    if (def.unlockAtBotWinsTotal) {
      var total = 0;
      if (botWins) { for (var k in botWins) { if (botWins.hasOwnProperty(k)) total += botWins[k]; } }
      return total >= def.unlockAtBotWinsTotal;
    }
    if (def.unlockAtStreak) {
      return (maxStreak || 0) >= def.unlockAtStreak;
    }
    if (def.unlockAtExactScore) {
      return !!(achievements && achievements['score' + def.unlockAtExactScore]);
    }
    if (def.unlockAtYachtStreak) {
      return !!(achievements && achievements.yachtStreak3);
    }
    return totalGames >= def.unlockAt;
  }

  function isUnlocked(skinId, totalGames, botWins, totalWins, maxStreak, achievements, augmentWins, claudeWins) {
    var def = getSkinDef(skinId);
    return isSkinUnlocked(def, totalGames, botWins, totalWins, maxStreak, achievements, augmentWins, claudeWins);
  }

  // Accepts a skin token ('ascend.blue' etc.), see parseSkin().
  function applySkin(token) {
    var diceArea = document.getElementById('dice-area');
    if (!diceArea) return;

    var s = parseSkin(token);
    currentSkinId = s.id;
    currentSkinColor = s.color;
    diceArea.setAttribute('data-dice-skin', s.id);
    if (s.color) diceArea.setAttribute('data-dice-color', s.color);
    else diceArea.removeAttribute('data-dice-color');
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

  function renderSkinSelector(containerEl, totalGames, botWins, totalWins, maxStreak, currentStreak, achievements, augmentWins, claudeWins) {
    if (!containerEl) return;
    totalGames = totalGames || 0;
    totalWins = totalWins || 0;
    botWins = botWins || {};
    maxStreak = maxStreak || 0;
    currentStreak = currentStreak || 0;
    achievements = achievements || {};
    augmentWins = augmentWins || 0;
    claudeWins = claudeWins || 0;

    var playContainer = document.getElementById('skin-options-play');
    var botContainer = document.getElementById('skin-options-bot');
    // Fallback: if new containers don't exist, use old single container
    if (!playContainer) playContainer = containerEl;
    if (!botContainer) botContainer = containerEl;
    playContainer.innerHTML = '';
    botContainer.innerHTML = '';

    var unlockedCount = getUnlockedCount(totalGames, botWins, totalWins, maxStreak, achievements, augmentWins, claudeWins);
    var countEl = document.getElementById('skin-unlock-count');
    if (countEl) {
      var I18n = window.YachtGame.I18n;
      countEl.textContent = (unlockedCount - 1) + '/' + (SKIN_DEFS.length - 1) + ' ' + (I18n ? I18n.t('skin_unlocked_count') : 'unlocked');
    }

    for (var i = 0; i < SKIN_DEFS.length; i++) {
      var def = SKIN_DEFS[i];
      var unlocked = isSkinUnlocked(def, totalGames, botWins, totalWins, maxStreak, achievements, augmentWins, claudeWins);
      var targetContainer = (def.unlockBy || def.unlockAtBotWinsTotal) ? botContainer : playContainer;

      var option = document.createElement('div');
      option.className = 'skin-option';
      if (!unlocked) option.classList.add('locked');
      var defSkin = parseSkin(def.id);
      // The Ascend tile stands for every non-Claude color; the Claude tile only for itself.
      var isActive = def.id === 'ascend'
        ? (currentSkinId === 'ascend' && currentSkinColor !== 'claude')
        : (defSkin.id === currentSkinId && defSkin.color === currentSkinColor);
      if (isActive) option.classList.add('active');
      option.setAttribute('data-skin-id', defSkin.id);

      // Mini die preview showing value 5 (the Ascend tile shows the chosen color)
      var miniDie = document.createElement('div');
      miniDie.className = 'skin-preview-die';
      miniDie.setAttribute('data-dice-skin', defSkin.id);
      var previewColor = def.id === 'ascend' ? (isActive ? currentSkinColor : null) : defSkin.color;
      if (previewColor) miniDie.setAttribute('data-dice-color', previewColor);
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
      } else if (def.id === 'dragon') {
        var img = document.createElement('img');
        img.src = 'die_image/dragon/dragon1.png';
        img.className = 'dragon-preview';
        img.alt = 'Dragon 1';
        miniDie.appendChild(img);
      } else if (def.id === 'flower') {
        var img = document.createElement('img');
        img.src = 'die_image/flower/flower5.png';
        img.className = 'flower-preview';
        img.alt = 'Flower 5';
        miniDie.appendChild(img);
      } else if (def.id === 'siru') {
        var img = document.createElement('img');
        img.src = 'die_image/siru/siru1.png';
        img.className = 'siru-preview';
        img.alt = 'Siru 1';
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
        if (def.unlockAtClaudeWins) {
          progressEl.textContent = (I18n ? I18n.t('skin_vs_claude') : 'vs Claude') + ' ' + claudeWins + '/' + def.unlockAtClaudeWins + ' ' + (I18n ? I18n.t('skin_wins_count') : 'wins');
        } else if (def.unlockAtAugmentWins) {
          progressEl.textContent = (I18n ? I18n.t('skin_aug_wins') : 'Augment') + ' ' + augmentWins + '/' + def.unlockAtAugmentWins + ' ' + (I18n ? I18n.t('skin_wins_count') : 'wins');
        } else if (def.unlockBy) {
          var wins = (botWins[def.unlockBy]) || 0;
          var botLabel = def.unlockBy === 'wave' ? (I18n ? I18n.t('wave') : 'Wave') : (def.unlockBy === 'gambler' ? (I18n ? I18n.t('gambler') : 'Gambler') : (I18n ? I18n.t('basic') : 'Basic'));
          progressEl.textContent = (I18n ? I18n.t('skin_vs_bot') : 'vs') + ' ' + botLabel + ' ' + wins + '/' + BOT_WIN_THRESHOLD;
        } else if (def.unlockAtBotWinsTotal) {
          var botTotal = 0;
          if (botWins) { for (var bk in botWins) { if (botWins.hasOwnProperty(bk)) botTotal += botWins[bk]; } }
          progressEl.textContent = (I18n ? I18n.t('skin_bot_total') : 'Bot') + ' ' + botTotal + '/' + def.unlockAtBotWinsTotal + ' ' + (I18n ? I18n.t('skin_wins_count') : 'wins');
        } else if (def.unlockAtExactScore) {
          progressEl.textContent = (I18n ? I18n.t('skin_exact_score') : 'Score') + ' ' + def.unlockAtExactScore;
        } else if (def.unlockAtYachtStreak) {
          progressEl.textContent = 'Yacht ' + def.unlockAtYachtStreak + (I18n ? I18n.t('skin_yacht_streak') : ' in a row');
        } else if (def.unlockAtStreak) {
          progressEl.textContent = currentStreak + '/' + def.unlockAtStreak + ' ' + (I18n ? I18n.t('skin_streak') : 'streak');
        } else if (def.unlockAtWins) {
          progressEl.textContent = totalWins + '/' + def.unlockAtWins + ' ' + (I18n ? I18n.t('skin_wins_count') : 'wins');
        } else {
          progressEl.textContent = totalGames + '/' + def.unlockAt + ' ' + (I18n ? I18n.t('skin_games_count') : 'games');
        }
        option.appendChild(progressEl);
      }

      // Ascend tile: current color name + cycle hint
      var colorEl = null;
      if (def.id === 'ascend' && unlocked) {
        colorEl = document.createElement('span');
        colorEl.className = 'lock-progress skin-color';
        colorEl.textContent = colorLabel(isActive ? (currentSkinColor || 'gold') : 'gold');
        option.appendChild(colorEl);
      }

      // Click handler
      var SPECIAL_EFFECT_SKINS = { banana: 1, fire: 1, dragon: 1, flower: 1, wave: 1, star: 1, siru: 1, ascend: 1 };
      (function (skinDef, skinUnlocked, optionEl, previewEl, labelEl) {
        optionEl.addEventListener('click', function () {
          if (!skinUnlocked) return;
          var token = skinDef.id;
          // Selected Ascend tile clicked again: next color
          if (skinDef.id === 'ascend' && optionEl.classList.contains('active')) {
            var cur = ASCEND_COLORS.indexOf(currentSkinColor || 'gold');
            token = skinToken('ascend', ASCEND_COLORS[(cur + 1) % ASCEND_COLORS.length]);
          }
          var allOptions = document.querySelectorAll('.skin-option.active');
          for (var j = 0; j < allOptions.length; j++) allOptions[j].classList.remove('active');
          optionEl.classList.add('active');
          applySkin(token);
          saveSkin(token);
          if (skinDef.id === 'ascend') {
            if (currentSkinColor) previewEl.setAttribute('data-dice-color', currentSkinColor);
            else previewEl.removeAttribute('data-dice-color');
            if (labelEl) labelEl.textContent = colorLabel(currentSkinColor || 'gold');
          }
          // Play celebration effect preview for special skins
          if (SPECIAL_EFFECT_SKINS[parseSkin(skinDef.id).id] && window.YachtGame.UI && window.YachtGame.UI.showConfetti) {
            window.YachtGame.UI.showConfetti();
          }
        });
      })(def, unlocked, option, miniDie, colorEl);

      targetContainer.appendChild(option);
    }
  }

  function colorLabel(color) {
    var I18n = window.YachtGame.I18n;
    var name = I18n ? I18n.t('skin_color_' + color) : color;
    return name + ' \u21bb';
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

  function renderMiniFaceHTML(token, value) {
    var skinId = parseSkin(token).id;
    var html = '<div class="cube-face skin-preview-die" ' + skinAttrs(token) + ' data-value="' + value + '">';
    if (skinId === 'crimson') {
      html += '<span class="crimson-char">' + (CRIMSON_CHARS[value] || '') + '</span>';
    } else if (skinId === 'banana') {
      html += '<img class="banana-preview" src="die_image/banana/banana' + value + '.png" alt="Banana ' + value + '">';
    } else if (skinId === 'wave') {
      html += '<img class="wave-preview" src="die_image/wave/wave' + value + '.png" alt="Wave ' + value + '">';
    } else if (skinId === 'fire') {
      html += '<img class="fire-preview" src="die_image/fire/fire' + value + '.png" alt="Fire ' + value + '">';
    } else if (skinId === 'dragon') {
      html += '<img class="dragon-preview" src="die_image/dragon/dragon' + value + '.png" alt="Dragon ' + value + '">';
    } else if (skinId === 'flower') {
      html += '<img class="flower-preview" src="die_image/flower/flower' + value + '.png" alt="Flower ' + value + '">';
    } else if (skinId === 'siru') {
      html += '<img class="siru-preview" src="die_image/siru/siru' + value + '.png" alt="Siru ' + value + '">';
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
    html += '<span class="cube-inner" ' + skinAttrs(skinId) + '>';
    html += renderMiniFaceHTML(skinId, 1);  // front
    html += renderMiniFaceHTML(skinId, 6);  // back
    html += renderMiniFaceHTML(skinId, 2);  // right
    html += renderMiniFaceHTML(skinId, 5);  // left
    html += renderMiniFaceHTML(skinId, 3);  // top
    html += renderMiniFaceHTML(skinId, 4);  // bottom
    html += '</span></span>';
    return html;
  }

  // Ascend skin level (1-3) per player = augments that player has picked this game.
  // Picks happen before anyone rolls (dice show classic then), so the visible level
  // only catches up when that player's first roll after the pick stops — both
  // players see the dice evolve. Stored on #dice-area as data-ascend-level.
  var ascendTarget = {}; // playerKey -> level earned
  var ascendShown = {};  // playerKey -> level currently displayed
  var ascendTurn = null;
  var ascendUpTimer = null;

  function clampAscend(level) { return Math.max(1, Math.min(3, level || 1)); }

  function paintAscend() {
    var diceArea = document.getElementById('dice-area');
    if (!diceArea) return;
    var level = (ascendTurn && ascendShown[ascendTurn]) || 1;
    diceArea.setAttribute('data-ascend-level', String(level));
  }

  // levels: { player1: n, player2: m } owned-augment counts, or null to reset (non-augment game).
  function setAscendTargets(levels) {
    if (!levels) {
      ascendTarget = {}; ascendShown = {}; ascendTurn = null;
      var diceArea = document.getElementById('dice-area');
      if (diceArea) diceArea.classList.remove('ascend-up');
      paintAscend();
      return;
    }
    for (var pk in levels) {
      if (!levels.hasOwnProperty(pk)) continue;
      ascendTarget[pk] = clampAscend(levels[pk]);
      // First sighting (game start / rejoin): show the earned level without animation.
      if (ascendShown[pk] == null) ascendShown[pk] = ascendTarget[pk];
    }
    paintAscend();
  }

  function setAscendTurn(playerKey) {
    ascendTurn = playerKey || null;
    paintAscend();
  }

  // Called when a player's roll animation finishes: evolve if they earned a new level.
  function ascendRollStopped(playerKey) {
    if (!playerKey || !ascendTarget[playerKey] || ascendShown[playerKey] >= ascendTarget[playerKey]) return;
    ascendShown[playerKey] = ascendTarget[playerKey];
    paintAscend();
    var diceArea = document.getElementById('dice-area');
    if (!diceArea || currentSkinId !== 'ascend' || ascendTurn !== playerKey) return;
    diceArea.classList.remove('ascend-up');
    void diceArea.offsetWidth; // restart the animation
    diceArea.classList.add('ascend-up');
    clearTimeout(ascendUpTimer);
    ascendUpTimer = setTimeout(function () { diceArea.classList.remove('ascend-up'); }, 1400);
  }

  // Base skin id (for effects and per-skin logic). Use getSkinToken() when storing/syncing.
  function getCurrentSkin() {
    return currentSkinId;
  }

  function getSkinToken() {
    return skinToken(currentSkinId, currentSkinColor);
  }

  // Hue shift (deg) of an Ascend token's color, for tinting the celebration canvas.
  function getAscendHue(token) {
    var s = token ? parseSkin(token) : { color: currentSkinColor };
    return ASCEND_HUE[s.color || 'gold'] || 0;
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
    getSkinToken: getSkinToken,
    parseSkin: parseSkin,
    getAscendHue: getAscendHue,
    setAscendTargets: setAscendTargets,
    setAscendTurn: setAscendTurn,
    ascendRollStopped: ascendRollStopped,
    getCrimsonChar: getCrimsonChar,
    SKIN_DEFS: SKIN_DEFS
  };
})();
