// Dice Skins: definitions, unlock logic, selection, persistence
(function () {
  'use strict';

  window.YachtGame = window.YachtGame || {};

  // Skin definitions in unlock order
  // unlockAt: number of totalGames required (0 = always available)
  var SKIN_DEFS = [
    {
      id: 'classic',
      name: 'Classic',
      unlockAt: 0,
      vars: {}
    },
    {
      id: 'ornate',
      name: 'Ornate',
      unlockAt: 3,
      vars: {
        '--die-bg': 'linear-gradient(145deg, #e8e8ec, #c8c8d0, #d8d8e0)',
        '--die-border-color': '#b87333',
        '--pip-color': '#0d6b3a'
      }
    },
    {
      id: 'bronze',
      name: 'Bronze',
      unlockAt: 6,
      vars: {
        '--die-bg': 'linear-gradient(145deg, #3a3a42, #2a2a32, #333338)',
        '--die-border-color': '#4a4a52',
        '--pip-color': '#c9935a'
      }
    },
    {
      id: 'marble',
      name: 'Marble',
      unlockAt: 9,
      vars: {
        '--die-bg': 'linear-gradient(145deg, #f5f5f0, #e8e6e0, #eeedea)',
        '--die-border-color': '#a8a8b0',
        '--pip-color': '#1f3d7a'
      }
    },
    {
      id: 'crimson',
      name: 'Crimson',
      unlockAt: 12,
      vars: {
        '--die-bg': 'linear-gradient(145deg, #c0272d, #a01520, #b52228)',
        '--die-border-color': '#c4917a',
        '--pip-color': '#1a0a08'
      }
    },
    {
      id: 'hologram',
      name: 'Hologram',
      unlockAt: 15,
      vars: {
        '--die-bg': 'linear-gradient(145deg, rgba(200, 210, 230, 0.55), rgba(180, 195, 220, 0.45))',
        '--die-border-color': 'rgba(0, 210, 230, 0.40)',
        '--pip-color': '#008b8b'
      }
    }
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

  function getUnlockedCount(totalGames) {
    var count = 0;
    for (var i = 0; i < SKIN_DEFS.length; i++) {
      if (totalGames >= SKIN_DEFS[i].unlockAt) count++;
    }
    return count;
  }

  function isUnlocked(skinId, totalGames) {
    var def = getSkinDef(skinId);
    return totalGames >= def.unlockAt;
  }

  function applySkin(skinId) {
    var diceArea = document.getElementById('dice-area');
    if (!diceArea) return;

    currentSkinId = skinId || 'classic';
    diceArea.setAttribute('data-dice-skin', currentSkinId);

    // Apply CSS variable overrides as inline styles
    var def = getSkinDef(currentSkinId);
    // Clear previous skin inline styles
    diceArea.style.removeProperty('--skin-die-bg');
    diceArea.style.removeProperty('--skin-die-border');
    diceArea.style.removeProperty('--skin-pip-color');

    if (def.vars['--die-bg']) {
      diceArea.style.setProperty('--skin-die-bg', def.vars['--die-bg']);
    }
    if (def.vars['--die-border-color']) {
      diceArea.style.setProperty('--skin-die-border', def.vars['--die-border-color']);
    }
    if (def.vars['--pip-color']) {
      diceArea.style.setProperty('--skin-pip-color', def.vars['--pip-color']);
    }
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

  function renderSkinSelector(containerEl, totalGames) {
    if (!containerEl) return;
    containerEl.innerHTML = '';
    totalGames = totalGames || 0;

    var unlockedCount = getUnlockedCount(totalGames);
    var countEl = document.getElementById('skin-unlock-count');
    if (countEl) {
      // -1 because classic doesn't count as "unlocked bonus"
      countEl.textContent = (unlockedCount - 1) + '/5 unlocked';
    }

    for (var i = 0; i < SKIN_DEFS.length; i++) {
      var def = SKIN_DEFS[i];
      var unlocked = totalGames >= def.unlockAt;
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

      // Apply skin-specific inline styles for preview
      if (def.vars['--die-bg']) miniDie.style.setProperty('--skin-die-bg', def.vars['--die-bg']);
      if (def.vars['--die-border-color']) miniDie.style.setProperty('--skin-die-border', def.vars['--die-border-color']);
      if (def.vars['--pip-color']) miniDie.style.setProperty('--skin-pip-color', def.vars['--pip-color']);

      // For crimson, show calligraphy character
      if (def.id === 'crimson') {
        var charEl = document.createElement('span');
        charEl.className = 'crimson-char';
        charEl.textContent = CRIMSON_CHARS[5];
        miniDie.appendChild(charEl);
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

      // Lock overlay
      if (!unlocked) {
        var lockEl = document.createElement('div');
        lockEl.className = 'lock-overlay';
        var gamesNeeded = def.unlockAt - totalGames;
        lockEl.title = gamesNeeded + ' more game' + (gamesNeeded > 1 ? 's' : '') + ' to unlock';
        lockEl.textContent = '\uD83D\uDD12'; // 🔒
        option.appendChild(lockEl);
      }

      // Click handler
      (function (skinDef, isUnlocked, optionEl) {
        optionEl.addEventListener('click', function () {
          if (!isUnlocked) return;
          // Deselect previous
          var prev = containerEl.querySelector('.skin-option.active');
          if (prev) prev.classList.remove('active');
          optionEl.classList.add('active');
          applySkin(skinDef.id);
          saveSkin(skinDef.id);
        });
      })(def, unlocked, option);

      containerEl.appendChild(option);
    }
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
    getCurrentSkin: getCurrentSkin,
    getCrimsonChar: getCrimsonChar,
    SKIN_DEFS: SKIN_DEFS
  };
})();
