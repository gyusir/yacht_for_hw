var SKIN_DEFS = [
  { id: 'classic',   name: 'Classic' },
  { id: 'ornate',    name: 'Ornate' },
  { id: 'bronze',    name: 'Bronze' },
  { id: 'marble',    name: 'Marble' },
  { id: 'crimson',   name: 'Crimson' },
  { id: 'hologram',  name: 'Hologram' },
  { id: 'circuit',   name: 'Circuit' },
  { id: 'carbon',    name: 'Carbon' },
  { id: 'banana',    name: 'Banana' }
];

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

var CRIMSON_CHARS = { 1: '\u4e00', 2: '\u4e8c', 3: '\u4e09', 4: '\u56db', 5: '\u4e94', 6: '\u516d' };

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
    html += '<img class="banana-preview" src="die_image/banana' + value + '.png" alt="Banana ' + value + '">';
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
  var html = '<span class="header-die-wrap header-die-spin"><span class="header-die-cube">';
  html += '<span class="cube-inner" data-dice-skin="' + skinId + '">';
  html += renderMiniFaceHTML(skinId, 1);
  html += renderMiniFaceHTML(skinId, 6);
  html += renderMiniFaceHTML(skinId, 2);
  html += renderMiniFaceHTML(skinId, 5);
  html += renderMiniFaceHTML(skinId, 3);
  html += renderMiniFaceHTML(skinId, 4);
  html += '</span></span></span>';
  return html;
}

function renderDie(skinId, value) {
  var dieEl = document.createElement('div');
  dieEl.className = 'die';
  dieEl.style.width = '72px';
  dieEl.style.height = '72px';

  if (skinId === 'crimson') {
    var charEl = document.createElement('span');
    charEl.className = 'crimson-char';
    charEl.textContent = CRIMSON_CHARS[value];
    dieEl.appendChild(charEl);
    return dieEl;
  }

  if (skinId === 'banana') {
    var img = document.createElement('img');
    img.src = 'die_image/banana' + value + '.png';
    img.className = 'banana-die-img';
    img.alt = value;
    dieEl.appendChild(img);
    return dieEl;
  }

  var layout = PIP_LAYOUTS[value];
  for (var i = 1; i <= 9; i++) {
    var pip = document.createElement('div');
    pip.style.gridRow = GRID_POSITIONS[i].row;
    pip.style.gridColumn = GRID_POSITIONS[i].col;
    pip.className = layout.indexOf(i) !== -1 ? 'pip' : 'pip hidden';
    dieEl.appendChild(pip);
  }
  return dieEl;
}

function renderPreview(skinId) {
  var miniDie = document.createElement('div');
  miniDie.className = 'skin-preview-die';
  miniDie.setAttribute('data-dice-skin', skinId);
  miniDie.setAttribute('data-value', '5');

  if (skinId === 'crimson') {
    var charEl = document.createElement('span');
    charEl.className = 'crimson-char';
    charEl.textContent = CRIMSON_CHARS[5];
    miniDie.appendChild(charEl);
  } else if (skinId === 'banana') {
    var img = document.createElement('img');
    img.src = 'die_image/banana5.png';
    img.className = 'banana-preview';
    img.alt = 'Banana 5';
    miniDie.appendChild(img);
  } else {
    var pipPositions = [1, 3, 5, 7, 9];
    for (var p = 1; p <= 9; p++) {
      var pip = document.createElement('div');
      pip.className = pipPositions.indexOf(p) !== -1 ? 'mini-pip' : 'mini-pip hidden';
      miniDie.appendChild(pip);
    }
  }
  return miniDie;
}

function buildAll() {
  var content = document.getElementById('content');
  content.innerHTML = '';

  for (var s = 0; s < SKIN_DEFS.length; s++) {
    var skin = SKIN_DEFS[s];
    var section = document.createElement('div');
    section.className = 'skin-section';

    var h2 = document.createElement('h2');
    h2.textContent = skin.name;
    section.appendChild(h2);

    // Normal dice (1-6)
    var row = document.createElement('div');
    row.className = 'dice-row';
    var label = document.createElement('div');
    label.className = 'label';
    label.textContent = 'Normal';
    row.appendChild(label);

    var diceArea = document.createElement('div');
    diceArea.setAttribute('data-dice-skin', skin.id);
    diceArea.style.display = 'flex';
    diceArea.style.gap = '8px';

    for (var v = 1; v <= 6; v++) {
      diceArea.appendChild(renderDie(skin.id, v));
    }
    row.appendChild(diceArea);
    section.appendChild(row);

    // Held dice
    var row2 = document.createElement('div');
    row2.className = 'dice-row';
    var label2 = document.createElement('div');
    label2.className = 'label';
    label2.textContent = 'Held';
    row2.appendChild(label2);

    var diceArea2 = document.createElement('div');
    diceArea2.setAttribute('data-dice-skin', skin.id);
    diceArea2.style.display = 'flex';
    diceArea2.style.gap = '8px';

    for (var v = 1; v <= 6; v++) {
      var die = renderDie(skin.id, v);
      die.classList.add('held');
      var check = document.createElement('span');
      check.className = 'held-check';
      check.textContent = '\u2713';
      die.appendChild(check);
      diceArea2.appendChild(die);
    }
    row2.appendChild(diceArea2);
    section.appendChild(row2);

    // 3D Cube
    var row3 = document.createElement('div');
    row3.className = 'dice-row';
    var label3 = document.createElement('div');
    label3.className = 'label';
    label3.textContent = '3D Cube';
    row3.appendChild(label3);

    var cubeWrap = document.createElement('span');
    cubeWrap.innerHTML = renderMiniDieHTML(skin.id);
    row3.appendChild(cubeWrap);
    section.appendChild(row3);

    // Preview
    var previewRow = document.createElement('div');
    previewRow.className = 'preview-row';
    var previewLabel = document.createElement('div');
    previewLabel.className = 'label';
    previewLabel.textContent = 'Preview';
    previewRow.appendChild(previewLabel);
    previewRow.appendChild(renderPreview(skin.id));
    section.appendChild(previewRow);

    content.appendChild(section);
  }
}

function toggleTheme() {
  var html = document.documentElement;
  var btn = document.getElementById('theme-btn');
  if (html.getAttribute('data-theme') === 'dark') {
    html.removeAttribute('data-theme');
    btn.textContent = 'Dark Mode';
  } else {
    html.setAttribute('data-theme', 'dark');
    btn.textContent = 'Light Mode';
  }
}

document.getElementById('theme-btn').addEventListener('click', toggleTheme);
buildAll();
