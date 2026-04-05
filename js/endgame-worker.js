// Endgame Worker: win-probability maximization for final turns (Wave bot)
// Runs in a Web Worker to avoid UI freezing on mobile devices.

var window = self;
window.YachtGame = {};

(function () {
  'use strict';

  var Scoring = null;
  var dpArray = null;    // Float64Array — LUT received via Transferable
  var meta = null;       // { maskStride, upperStride, maxUpper, numCategories }
  var gameMode = '';

  // ─── Dice Indexing Infrastructure (duplicated from bot-ai.js) ───
  // Worker cannot access main thread globals.

  var ALL_DICE = [];         // 252 sorted 5-dice multisets
  var DICE_IDX = null;       // Int16Array(16807), base-7 pack -> index
  var FACTORIALS = [1, 1, 2, 6, 24, 120];
  var NUM_DICE = 0;
  var ROLL_OUTCOMES = [];    // ROLL_OUTCOMES[k] = [{ dice, prob }]

  function pack5(a, b, c, d, e) {
    return a + b * 7 + c * 49 + d * 343 + e * 2401;
  }

  function diceToIndex(sorted) {
    return DICE_IDX[pack5(sorted[0], sorted[1], sorted[2], sorted[3], sorted[4])];
  }

  // Build 252 multisets and reverse lookup
  (function initDiceIndex() {
    DICE_IDX = new Int16Array(16807);
    for (var i = 0; i < 16807; i++) DICE_IDX[i] = -1;

    for (var a = 1; a <= 6; a++)
      for (var b = a; b <= 6; b++)
        for (var c = b; c <= 6; c++)
          for (var d = c; d <= 6; d++)
            for (var e = d; e <= 6; e++) {
              var idx = ALL_DICE.length;
              ALL_DICE.push([a, b, c, d, e]);
              DICE_IDX[pack5(a, b, c, d, e)] = idx;
            }

    NUM_DICE = ALL_DICE.length; // 252
  })();

  // Build roll outcome probability tables for k=0..5 rerolled dice
  (function initRollOutcomes() {
    for (var k = 0; k <= 5; k++) {
      var outcomes = [];
      if (k === 0) {
        outcomes.push({ dice: [], prob: 1.0 });
      } else {
        var total = Math.pow(6, k);
        enumMultisets([], 1, k, function (combo) {
          var cnt = [0, 0, 0, 0, 0, 0];
          for (var i = 0; i < combo.length; i++) cnt[combo[i] - 1]++;
          var ways = FACTORIALS[k];
          for (var i = 0; i < 6; i++) ways /= FACTORIALS[cnt[i]];
          outcomes.push({ dice: combo.slice(), prob: ways / total });
        });
      }
      ROLL_OUTCOMES.push(outcomes);
    }

    function enumMultisets(current, minVal, remaining, callback) {
      if (remaining === 0) { callback(current); return; }
      for (var v = minVal; v <= 6; v++) {
        current.push(v);
        enumMultisets(current, v, remaining - 1, callback);
        current.pop();
      }
    }
  })();

  // ─── Helpers ───

  function mergeSorted(kept, rolled) {
    var result = [];
    var ki = 0, ri = 0;
    while (ki < kept.length && ri < rolled.length) {
      if (kept[ki] <= rolled[ri]) result.push(kept[ki++]);
      else result.push(rolled[ri++]);
    }
    while (ki < kept.length) result.push(kept[ki++]);
    while (ri < rolled.length) result.push(rolled[ri++]);
    return result;
  }

  function sortedDice(dice) {
    return dice.slice().sort(function (a, b) { return a - b; });
  }

  // ─── DP Lookup ───

  function dpLookup(mask, upper, yzFlag) {
    if (!dpArray) return 0;
    var idx = mask * meta.maskStride + upper * meta.upperStride + yzFlag;
    return dpArray[idx] || 0;
  }

  // ─── State Helpers ───

  function scoresToState(scores) {
    var cats = Scoring.getCategories(gameMode);
    var mask = 0;
    for (var i = 0; i < cats.length; i++) {
      if (scores[cats[i]] === null || scores[cats[i]] === undefined) {
        mask |= (1 << i);
      }
    }
    var upper = Math.min(Scoring.upperSum(scores), 63);
    var yzFlag = (gameMode === 'yahtzee' && scores.yahtzee === 50) ? 1 : 0;
    return { mask: mask, upper: upper, yzFlag: yzFlag };
  }

  // ─── Win Probability ───

  function sigmoid(x) {
    if (x > 20) return 1.0;
    if (x < -20) return 0.0;
    return 1.0 / (1.0 + Math.exp(-x));
  }

  function winProb(botFinal, oppFinal, turnsLeft) {
    var delta = botFinal - oppFinal;
    var stdDev = turnsLeft * 15;
    if (stdDev < 1) stdDev = 1;
    return sigmoid(delta / (stdDev * 0.588));
  }

  // ─── Core: Evaluate category choices by win probability ───

  function evalCategoriesWithBase(dice, botState, botCurrentTotal, oppFinal, remainingTurns) {
    var cats = Scoring.getCategories(gameMode);
    var isYahtzeeMode = (gameMode === 'yahtzee');
    var yahtzeeCatIdx = isYahtzeeMode ? 11 : -1;
    var sd = sortedDice(dice);
    var isAllSame = (sd[0] === sd[4]);
    var bonus = (isYahtzeeMode && botState.yzFlag && isAllSame) ? 100 : 0;

    var bestCat = null;
    var bestWP = -1;

    var bits = botState.mask;
    while (bits !== 0) {
      var low = bits & (-bits);
      bits &= bits - 1;
      var ci = 0;
      var tmp = low >>> 1;
      while (tmp) { ci++; tmp >>>= 1; }

      var catScore = Scoring.calculate(dice, cats[ci], gameMode);
      var totalScore = catScore + bonus;

      var nextMask = botState.mask ^ low;
      var nextUpper = botState.upper;
      if (isYahtzeeMode && ci < 6) {
        nextUpper = Math.min(botState.upper + catScore, 63);
      }
      var nextYzFlag = botState.yzFlag;
      if (isYahtzeeMode && ci === yahtzeeCatIdx && catScore === 50) {
        nextYzFlag = 1;
      }

      var futureEV = dpLookup(nextMask, nextUpper, nextYzFlag);
      var botFinal = botCurrentTotal + totalScore + futureEV;
      var wp = winProb(botFinal, oppFinal, remainingTurns - 1);

      if (wp > bestWP) {
        bestWP = wp;
        bestCat = cats[ci];
      }
    }

    return { category: bestCat, wp: bestWP };
  }

  // ─── Core: Evaluate hold masks by win probability ───

  function evalHoldsWithBase(dice, botState, botCurrentTotal, oppFinal, remainingTurns, rollsLeft) {
    var cats = Scoring.getCategories(gameMode);
    var isYahtzeeMode = (gameMode === 'yahtzee');
    var yahtzeeCatIdx = isYahtzeeMode ? 11 : -1;

    // Phase 0: for each dice combo, best win probability from category selection
    var wp0 = new Float64Array(NUM_DICE);
    for (var di = 0; di < NUM_DICE; di++) {
      var d = ALL_DICE[di];
      var isAllSame = (d[0] === d[4]);
      var bonus = (isYahtzeeMode && botState.yzFlag && isAllSame) ? 100 : 0;

      var bestWP = -1;
      var bts = botState.mask;
      while (bts !== 0) {
        var low = bts & (-bts);
        bts &= bts - 1;
        var ci = 0;
        var tmp = low >>> 1;
        while (tmp) { ci++; tmp >>>= 1; }

        var catScore = Scoring.calculate(d, cats[ci], gameMode);
        var totalScore = catScore + bonus;
        var nextMask = botState.mask ^ low;
        var nextUpper = botState.upper;
        if (isYahtzeeMode && ci < 6) {
          nextUpper = Math.min(botState.upper + catScore, 63);
        }
        var nextYzFlag = botState.yzFlag;
        if (isYahtzeeMode && ci === yahtzeeCatIdx && catScore === 50) {
          nextYzFlag = 1;
        }
        var futureEV = dpLookup(nextMask, nextUpper, nextYzFlag);
        var botFinal = botCurrentTotal + totalScore + futureEV;
        var wp = winProb(botFinal, oppFinal, remainingTurns - 1);
        if (wp > bestWP) bestWP = wp;
      }
      wp0[di] = bestWP;
    }

    // Phase 1: if rollsLeft >= 2, compute expected win prob after one more reroll
    var wp1 = null;
    if (rollsLeft >= 2) {
      wp1 = new Float64Array(NUM_DICE);
      for (var di = 0; di < NUM_DICE; di++) {
        var d = ALL_DICE[di];
        var bestEWP = -1;
        var seenKept = {};
        for (var hm = 0; hm < 32; hm++) {
          var kept = [];
          var rerollCount = 0;
          for (var b = 0; b < 5; b++) {
            if (hm & (1 << b)) kept.push(d[b]);
            else rerollCount++;
          }
          var keptKey = kept.join(',');
          if (seenKept[keptKey]) continue;
          seenKept[keptKey] = true;

          var ewp = 0;
          var outcomes = ROLL_OUTCOMES[rerollCount];
          for (var oi = 0; oi < outcomes.length; oi++) {
            var merged = mergeSorted(kept, outcomes[oi].dice);
            var mi = diceToIndex(merged);
            ewp += outcomes[oi].prob * wp0[mi];
          }
          if (ewp > bestEWP) bestEWP = ewp;
        }
        wp1[di] = bestEWP;
      }
    }

    // Evaluate hold masks for the actual current dice
    var valueTable = (rollsLeft >= 2 && wp1) ? wp1 : wp0;
    var bestHolds = null;
    var bestWP2 = -1;

    var seenKept2 = {};
    for (var hm = 0; hm < 32; hm++) {
      var kept = [];
      var rerollCount = 0;
      for (var b = 0; b < 5; b++) {
        if (hm & (1 << b)) kept.push(dice[b]);
        else rerollCount++;
      }
      var keptSorted = kept.slice().sort(function (a, b2) { return a - b2; });
      var keptKey = keptSorted.join(',');
      if (seenKept2[keptKey] !== undefined) continue;
      seenKept2[keptKey] = true;

      var ewp = 0;
      var outcomes = ROLL_OUTCOMES[rerollCount];
      for (var oi = 0; oi < outcomes.length; oi++) {
        var merged = mergeSorted(keptSorted, outcomes[oi].dice);
        var mi = diceToIndex(merged);
        ewp += outcomes[oi].prob * valueTable[mi];
      }

      if (ewp > bestWP2) {
        bestWP2 = ewp;
        bestHolds = [];
        for (var b = 0; b < 5; b++) bestHolds.push((hm & (1 << b)) !== 0);
      }
    }

    return { holds: bestHolds, wp: bestWP2 };
  }

  // ─── Main Decision Function ───

  function decide(msg) {
    var dice = msg.dice;
    var botScores = msg.botScores;
    var oppScores = msg.oppScores;
    var rollCount = msg.rollCount;
    var remainingTurns = msg.remainingTurns;

    var botState = scoresToState(botScores);
    var oppState = scoresToState(oppScores);

    // Opponent's estimated final score
    var oppCurrentTotal = Scoring.totalScore(oppScores, gameMode, oppScores.yahtzeeBonus || 0);
    var oppFutureEV = dpLookup(oppState.mask, oppState.upper, oppState.yzFlag);
    var oppFinal = oppCurrentTotal + oppFutureEV;

    // Bot's current accumulated total
    var botCurrentTotal = Scoring.totalScore(botScores, gameMode, botScores.yahtzeeBonus || 0);

    if (rollCount >= 3) {
      // Must select category — no rerolls left
      var catResult = evalCategoriesWithBase(dice, botState, botCurrentTotal, oppFinal, remainingTurns);
      return { action: 'category', category: catResult.category, winProb: catResult.wp };
    }

    var rollsLeft = 3 - rollCount;

    // Option A: stop and pick best category now
    var stopResult = evalCategoriesWithBase(dice, botState, botCurrentTotal, oppFinal, remainingTurns);

    // Option B: reroll with best hold mask
    var rerollResult = evalHoldsWithBase(dice, botState, botCurrentTotal, oppFinal, remainingTurns, rollsLeft);

    // Win probability saturated — fall back to EV-based play
    var bestWP = Math.max(stopResult.wp, rerollResult.wp);
    if (bestWP >= 0.99 || bestWP <= 0.01) {
      return { action: 'fallback', winProb: bestWP };
    }

    if (rerollResult.wp > stopResult.wp + 0.001) {
      return { action: 'reroll', holds: rerollResult.holds, winProb: rerollResult.wp };
    } else {
      return { action: 'category', category: stopResult.category, winProb: stopResult.wp };
    }
  }

  // ─── Message Handler ───

  self.onmessage = function (e) {
    var msg = e.data;

    if (msg.type === 'init') {
      // Load scoring.js with cache-busting version query
      var version = msg.version || '1';
      importScripts('scoring.js?v=' + version);
      Scoring = self.YachtGame.Scoring;

      // Receive LUT via Transferable (zero-copy ownership transfer)
      dpArray = new Float64Array(msg.dpBuffer);
      meta = msg.meta;
      gameMode = msg.gameMode;

      console.log('[Endgame Worker] Initialized:', gameMode,
        '(' + dpArray.length + ' entries)');
      self.postMessage({ type: 'ready' });

    } else if (msg.type === 'decide') {
      try {
        var result = decide(msg);
        result.type = 'result';
        result.id = msg.id;
        self.postMessage(result);
      } catch (err) {
        self.postMessage({ type: 'error', id: msg.id, message: err.message || String(err) });
      }
    }
  };
})();
