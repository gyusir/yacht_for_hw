// History module: save and load game results
(function () {
  'use strict';

  window.YachtGame = window.YachtGame || {};

  // saveResult is now handled server-side by the onGameFinished Cloud Function trigger

  function loadStats(firebaseUid, callback) {
    if (!firebaseUid) { callback(null); return; }
    var db = window.YachtGame.db;
    db.ref('users/' + firebaseUid + '/stats').once('value', function (snap) {
      callback(snap.val() || { totalGames: 0, wins: 0, losses: 0, ties: 0 });
    });
  }

  function loadHistory(firebaseUid, limit, callback) {
    if (!firebaseUid) { callback([]); return; }
    var db = window.YachtGame.db;
    db.ref('users/' + firebaseUid + '/history')
      .orderByChild('date')
      .limitToLast(limit || 20)
      .once('value', function (snap) {
        var games = [];
        snap.forEach(function (child) {
          games.push(child.val());
        });
        // Reverse so most recent is first
        games.reverse();
        callback(games);
      });
  }

  window.YachtGame.History = {
    loadStats: loadStats,
    loadHistory: loadHistory
  };
})();
