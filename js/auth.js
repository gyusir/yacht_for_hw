// Auth module: Google OAuth sign-in/sign-out
(function () {
  'use strict';

  window.YachtGame = window.YachtGame || {};

  var currentUser = null;
  var isGuest = false;
  var guestName = '';
  var nicknames = null; // { ko: '...', en: '...' }

  // Emulator: create account if needed, then sign in with email/password
  function signInEmulatorTest(email, displayName, callback) {
    var auth = window.YachtGame.auth;
    var password = 'testpass123';

    function onSignedIn(result) {
      currentUser = result.user;
      isGuest = false;
      // Ensure displayName is set
      var p = currentUser.displayName ? Promise.resolve() : currentUser.updateProfile({ displayName: displayName });
      p.then(function () {
        var db = window.YachtGame.db;
        db.ref('users/' + currentUser.uid).update({
          displayName: displayName,
          photoURL: null
        });
        window.YachtGame.Nickname.ensureNickname(currentUser.uid, function (nicks) {
          nicknames = nicks;
          if (callback) callback(null, currentUser);
        });
      });
    }

    // Try sign in first, create if not found
    auth.signInWithEmailAndPassword(email, password).then(onSignedIn).catch(function () {
      auth.createUserWithEmailAndPassword(email, password).then(onSignedIn).catch(function (error) {
        console.error('Emulator sign-in error:', error);
        if (callback) callback(error, null);
      });
    });
  }

  function signInWithGoogle(callback) {
    // Emulator: show test account picker instead of Google popup
    if (window.YachtGame.isEmulator) {
      showEmulatorAccountPicker(callback);
      return;
    }

    var auth = window.YachtGame.auth;
    var provider = window.YachtGame.googleProvider;

    auth.signInWithPopup(provider).then(function (result) {
      currentUser = result.user;
      isGuest = false;
      // Save profile to DB
      var db = window.YachtGame.db;
      db.ref('users/' + currentUser.uid).update({
        displayName: currentUser.displayName,
        photoURL: currentUser.photoURL || null
      });
      window.YachtGame.Nickname.ensureNickname(currentUser.uid, function (nicks) {
        nicknames = nicks;
        if (callback) callback(null, currentUser);
      });
    }).catch(function (error) {
      console.error('Google sign-in error:', error.code, error.message);
      // Popup blocked or failed — fall back to redirect
      if (error.code === 'auth/popup-blocked' ||
          error.code === 'auth/popup-closed-by-user' ||
          error.code === 'auth/cancelled-popup-request') {
        auth.signInWithRedirect(provider);
        return;
      }
      if (callback) callback(error, null);
    });
  }

  function showEmulatorAccountPicker(callback) {
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9999';
    var box = document.createElement('div');
    box.style.cssText = 'background:#fff;border-radius:12px;padding:24px;min-width:280px;font-family:sans-serif';
    box.innerHTML = '<h3 style="margin:0 0 16px;font-size:1.1rem">🧪 Emulator 테스트 계정</h3>';
    var accounts = [
      { email: 'emu-testuser@test.com', name: 'testuser' },
      { email: 'emu-longname@test.com', name: 'testforlongusername' }
    ];
    accounts.forEach(function (acc) {
      var btn = document.createElement('button');
      btn.textContent = acc.name + ' (' + acc.email + ')';
      btn.style.cssText = 'display:block;width:100%;padding:10px;margin:6px 0;border:1px solid #ddd;border-radius:8px;background:#f8f8f8;cursor:pointer;font-size:0.9rem';
      btn.onmouseover = function () { btn.style.background = '#e8e8e8'; };
      btn.onmouseout = function () { btn.style.background = '#f8f8f8'; };
      btn.onclick = function () {
        document.body.removeChild(overlay);
        signInEmulatorTest(acc.email, acc.name, callback);
      };
      box.appendChild(btn);
    });
    var cancelBtn = document.createElement('button');
    cancelBtn.textContent = '취소';
    cancelBtn.style.cssText = 'display:block;width:100%;padding:8px;margin-top:12px;border:none;background:none;color:#888;cursor:pointer;font-size:0.85rem';
    cancelBtn.onclick = function () { document.body.removeChild(overlay); };
    box.appendChild(cancelBtn);
    overlay.appendChild(box);
    overlay.onclick = function (e) { if (e.target === overlay) document.body.removeChild(overlay); };
    document.body.appendChild(overlay);
  }

  // Handle redirect result (fallback from popup blocked)
  window.YachtGame.auth.getRedirectResult().then(function (result) {
    if (result.user) {
      currentUser = result.user;
      isGuest = false;
      var db = window.YachtGame.db;
      db.ref('users/' + currentUser.uid).update({
        displayName: currentUser.displayName,
        photoURL: currentUser.photoURL || null
      });
      window.YachtGame.Nickname.ensureNickname(currentUser.uid, function (nicks) {
        nicknames = nicks;
      });
    }
  }).catch(function (error) {
    console.error('Redirect sign-in error:', error.code, error.message);
  });

  function signOut(callback) {
    window.YachtGame.auth.signOut().then(function () {
      currentUser = null;
      isGuest = false;
      guestName = '';
      nicknames = null;
      if (callback) callback();
    });
  }

  function setGuest(name, callback) {
    guestName = name;
    // Use Anonymous Auth so guests get a uid for Security Rules
    window.YachtGame.auth.signInAnonymously().then(function (result) {
      currentUser = result.user;
      isGuest = true;
      if (callback) callback(null);
    }).catch(function (error) {
      // Anonymous auth is required — cannot play without a uid
      console.error('Anonymous auth failed:', error);
      isGuest = false;
      currentUser = null;
      if (callback) callback(error);
    });
  }

  function onAuthStateChanged(callback) {
    window.YachtGame.auth.onAuthStateChanged(function (user) {
      currentUser = user;
      if (user && !user.isAnonymous) {
        isGuest = false;
        // Non-blocking: fire callback immediately, load nicknames in background
        callback(user);
        window.YachtGame.Nickname.ensureNickname(user.uid, function (nicks) {
          nicknames = nicks;
          if (window.YachtGame.onNicknameReady) window.YachtGame.onNicknameReady(nicks);
        });
      } else if (user && user.isAnonymous) {
        isGuest = true;
        nicknames = null;
        callback(user);
      } else {
        isGuest = false;
        guestName = '';
        nicknames = null;
        callback(user);
      }
    });
  }

  function getPlayerName() {
    if (isGuest && guestName) return guestName;
    if (currentUser && currentUser.isAnonymous) return guestName || 'Guest';
    if (currentUser) {
      var name = null;
      if (nicknames) {
        var lang = (window.YachtGame.I18n && window.YachtGame.I18n.getLang) ? window.YachtGame.I18n.getLang() : 'en';
        name = nicknames[lang] || nicknames.ko || nicknames.en;
      }
      name = name || currentUser.displayName || 'Player';
      return name.length > 20 ? name.substring(0, 20) : name;
    }
    return 'Guest';
  }

  function getNickname() {
    if (!nicknames) return null;
    var lang = (window.YachtGame.I18n && window.YachtGame.I18n.getLang) ? window.YachtGame.I18n.getLang() : 'en';
    return nicknames[lang] || nicknames.ko || nicknames.en;
  }

  function getNicknames() {
    return nicknames;
  }

  function getPlayerUid() {
    if (currentUser) return currentUser.uid;
    return null;
  }

  function isSignedIn() {
    return !!currentUser && !currentUser.isAnonymous;
  }

  function isGuestMode() {
    return isGuest || (currentUser && currentUser.isAnonymous);
  }

  function getPhotoURL() {
    return currentUser ? (currentUser.photoURL || null) : null;
  }

  window.YachtGame.Auth = {
    signInWithGoogle: signInWithGoogle,
    signOut: signOut,
    setGuest: setGuest,
    onAuthStateChanged: onAuthStateChanged,
    getPlayerName: getPlayerName,
    getNickname: getNickname,
    getNicknames: getNicknames,
    getPlayerUid: getPlayerUid,
    isSignedIn: isSignedIn,
    isGuestMode: isGuestMode,
    getPhotoURL: getPhotoURL
  };
})();
