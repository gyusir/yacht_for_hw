// SFX manager: Web Audio API for low-latency, polyphonic effects.
// Mute state is shared with the BGM module — a single ♪ toggle controls both.
(function () {
  'use strict';

  window.YachtGame = window.YachtGame || {};

  var SOURCES = {
    roll: 'assets/audio/sfx/dice-roll.ogg',
    hold: 'assets/audio/sfx/dice-hold.ogg',
    confirm: 'assets/audio/sfx/category-confirm.ogg'
  };
  var VOLUMES = {
    roll: 0.5,
    hold: 0.25,
    confirm: 0.5
  };
  var DEFAULT_VOLUME = 0.5;

  var ctx = null;
  var buffers = {};
  var unlocked = false;

  function ensureCtx() {
    if (ctx) return ctx;
    var Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    return ctx;
  }

  function preload() {
    var c = ensureCtx();
    if (!c) return;
    Object.keys(SOURCES).forEach(function (name) {
      if (buffers[name]) return;
      fetch(SOURCES[name])
        .then(function (r) { return r.arrayBuffer(); })
        .then(function (buf) {
          // Older Safari uses callback API for decodeAudioData
          return new Promise(function (resolve, reject) {
            try {
              var p = c.decodeAudioData(buf, resolve, reject);
              if (p && typeof p.then === 'function') p.then(resolve, reject);
            } catch (e) { reject(e); }
          });
        })
        .then(function (audioBuf) { buffers[name] = audioBuf; })
        .catch(function () { /* leave slot empty; play() will no-op */ });
    });
  }

  function unlock() {
    var c = ensureCtx();
    if (!c) return;
    if (c.state === 'suspended' && typeof c.resume === 'function') c.resume();
    unlocked = true;
    preload();
  }

  // Wire one-shot listeners that resume the AudioContext on first user gesture.
  function init() {
    if (unlocked) return;
    var events = ['pointerdown', 'keydown', 'touchstart'];
    var handler = function () {
      events.forEach(function (ev) { document.removeEventListener(ev, handler, true); });
      unlock();
    };
    events.forEach(function (ev) { document.addEventListener(ev, handler, true); });
  }

  function isMuted() {
    var BGM = window.YachtGame.Audio;
    return BGM ? BGM.isMuted() : false;
  }

  function play(name) {
    if (!unlocked || isMuted()) return;
    var c = ctx;
    var buf = buffers[name];
    if (!c || !buf) return;
    var src = c.createBufferSource();
    src.buffer = buf;
    var gain = c.createGain();
    gain.gain.value = VOLUMES[name] != null ? VOLUMES[name] : DEFAULT_VOLUME;
    src.connect(gain).connect(c.destination);
    try { src.start(0); } catch (e) { /* ignore double-start in older Safari */ }
  }

  window.YachtGame.SFX = {
    init: init,
    play: play
  };
})();
