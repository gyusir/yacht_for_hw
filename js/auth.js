// Auth module: Google OAuth sign-in/sign-out
(function () {
  'use strict';

  window.YachtGame = window.YachtGame || {};

  var currentUser = null;
  var isGuest = false;
  var guestName = '';

  function signInWithGoogle(callback) {
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
      if (callback) callback(null, currentUser);
    }).catch(function (error) {
      if (callback) callback(error, null);
    });
  }

  function signOut(callback) {
    window.YachtGame.auth.signOut().then(function () {
      currentUser = null;
      isGuest = false;
      guestName = '';
      if (callback) callback();
    });
  }

  function setGuest(name) {
    isGuest = true;
    guestName = name;
    currentUser = null;
  }

  function onAuthStateChanged(callback) {
    window.YachtGame.auth.onAuthStateChanged(function (user) {
      currentUser = user;
      if (user) isGuest = false;
      callback(user);
    });
  }

  function getPlayerName() {
    if (currentUser) return currentUser.displayName || 'Player';
    if (isGuest) return guestName;
    return 'Guest';
  }

  function getPlayerUid() {
    if (currentUser) return currentUser.uid;
    return null;
  }

  function isSignedIn() {
    return !!currentUser;
  }

  function isGuestMode() {
    return isGuest;
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
    getPlayerUid: getPlayerUid,
    isSignedIn: isSignedIn,
    isGuestMode: isGuestMode,
    getPhotoURL: getPhotoURL
  };
})();
