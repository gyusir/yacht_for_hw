// History module: save and load game results
(function () {
  'use strict';

  window.YachtGame = window.YachtGame || {};

  function saveResult(firebaseUid, gameData) {
    if (!firebaseUid) return;
    var db = window.YachtGame.db;

    // Push to history
    var historyRef = db.ref('users/' + firebaseUid + '/history');
    historyRef.push({
      date: firebase.database.ServerValue.TIMESTAMP,
      mode: gameData.mode,
      opponentName: gameData.opponentName,
      myScore: gameData.myScore,
      oppScore: gameData.oppScore,
      result: gameData.result,
      roomCode: gameData.roomCode
    });

    // Update stats with transaction
    var statsRef = db.ref('users/' + firebaseUid + '/stats');
    statsRef.transaction(function (stats) {
      if (!stats) {
        stats = { totalGames: 0, wins: 0, losses: 0, ties: 0 };
      }
      stats.totalGames = (stats.totalGames || 0) + 1;
      if (gameData.result === 'win') {
        stats.wins = (stats.wins || 0) + 1;
      } else if (gameData.result === 'loss') {
        stats.losses = (stats.losses || 0) + 1;
      } else {
        stats.ties = (stats.ties || 0) + 1;
      }
      return stats;
    });
  }

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
    saveResult: saveResult,
    loadStats: loadStats,
    loadHistory: loadHistory
  };
})();
