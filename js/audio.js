// BGM manager: HTMLAudioElement-based loop with mobile autoplay-policy handling.
(function () {
  'use strict';

  window.YachtGame = window.YachtGame || {};

  var BGM_SRC = 'assets/audio/bgm-bossa.mp3';
  var STORAGE_KEY = 'yacht-bgm-muted';
  var VOLUME = 0.35;

  var audioEl = null;
  // Default to muted; user must opt in via the toggle. Stored value '0' means
  // the user explicitly enabled music previously.
  var muted = localStorage.getItem(STORAGE_KEY) !== '0';
  var unlocked = false;
  var listeners = [];

  function ensureEl() {
    if (audioEl) return audioEl;
    audioEl = new Audio(BGM_SRC);
    audioEl.loop = true;
    audioEl.volume = VOLUME;
    audioEl.preload = 'auto';
    return audioEl;
  }

  // Browsers block autoplay until a user gesture. Wire one-shot listeners that
  // try playback on first interaction; if the user has muted the BGM we still
  // unlock so toggling on later starts immediately.
  function unlockOnFirstInteraction() {
    if (unlocked) return;
    var events = ['pointerdown', 'keydown', 'touchstart'];
    var handler = function () {
      unlocked = true;
      events.forEach(function (ev) { document.removeEventListener(ev, handler, true); });
      if (!muted) playInternal();
    };
    events.forEach(function (ev) { document.addEventListener(ev, handler, true); });
  }

  function playInternal() {
    var el = ensureEl();
    var p = el.play();
    if (p && typeof p.catch === 'function') {
      p.catch(function () { /* autoplay blocked — stays paused until next gesture */ });
    }
  }

  function setMuted(next) {
    muted = !!next;
    localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
    if (muted) {
      if (audioEl) audioEl.pause();
    } else if (unlocked) {
      playInternal();
    }
    listeners.forEach(function (fn) { try { fn(muted); } catch (e) {} });
  }

  function isMuted() { return muted; }

  function onChange(fn) { if (typeof fn === 'function') listeners.push(fn); }

  window.YachtGame.Audio = {
    init: unlockOnFirstInteraction,
    setMuted: setMuted,
    toggleMuted: function () { setMuted(!muted); },
    isMuted: isMuted,
    onChange: onChange
  };
})();
