// Bot AI decision engine: DP lookup table based optimal play
(function () {
  'use strict';

  window.YachtGame = window.YachtGame || {};

  var Scoring = null;
  function getScoring() {
    if (!Scoring) Scoring = window.YachtGame.Scoring;
    return Scoring;
  }

  // ─── Configuration ───

  var BASIC_NOISE = 4; // ±4 EV noise for Basic difficulty

  // ─── DP Table State ───

  var dpData = {};       // { yacht: { dp, meta }, yahtzee: { dp, meta } }
  var dpLoading = {};    // { yacht: true/false, yahtzee: true/false }
  var dpCallbacks = {};  // { yacht: [cb1, cb2], yahtzee: [...] }

  // Phase cache (recomputed per turn)
  var phaseCache = { mask: -1, upper: -1, yzFlag: -1, gameMode: '', val0: null, val1: null };

  // ─── Dice Indexing Infrastructure ───
  // 252 sorted 5-dice multisets from {1..6}, built once at load time

  var ALL_DICE = [];         // ALL_DICE[i] = [d1,d2,d3,d4,d5] sorted
  var DICE_IDX = null;       // Int16Array(16807), base-7 pack -> index
  var FACTORIALS = [1, 1, 2, 6, 24, 120];

  function pack5(a, b, c, d, e) {
    return a + b * 7 + c * 49 + d * 343 + e * 2401;
  }

  function diceToIndex(sorted) {
    return DICE_IDX[pack5(sorted[0], sorted[1], sorted[2], sorted[3], sorted[4])];
  }

  // Build 252 multisets and lookup table
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
  })();

  var NUM_DICE = ALL_DICE.length; // 252

  // Pre-build roll outcome tables for k=0..5 rerolled dice
  // ROLL_OUTCOMES[k] = [ { dice: sorted array, prob: number }, ... ]
  var ROLL_OUTCOMES = [];

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

  function getAvailableCategories(scores, gameMode) {
    var S = getScoring();
    var cats = S.getCategories(gameMode);
    var available = [];
    for (var i = 0; i < cats.length; i++) {
      if (scores[cats[i]] === null || scores[cats[i]] === undefined) {
        available.push(cats[i]);
      }
    }
    return available;
  }

  function scoresToState(scores, gameMode) {
    var S = getScoring();
    var cats = S.getCategories(gameMode);
    var mask = 0;
    for (var i = 0; i < cats.length; i++) {
      if (scores[cats[i]] === null || scores[cats[i]] === undefined) {
        mask |= (1 << i);
      }
    }
    var upper = Math.min(S.upperSum(scores), 63);
    var yzFlag = (gameMode === 'yahtzee' && scores.yahtzee === 50) ? 1 : 0;
    return { mask: mask, upper: upper, yzFlag: yzFlag };
  }

  function sortedDice(dice) {
    return dice.slice().sort(function (a, b) { return a - b; });
  }

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

  // ─── DP Table Access ───

  function getDPEntry(gameMode) {
    return dpData[gameMode] || null;
  }

  function dpLookup(entry, mask, upper, yzFlag) {
    if (!entry) return 0;
    var idx = mask * entry.meta.maskStride + upper * entry.meta.upperStride + yzFlag;
    return entry.dp[idx] || 0;
  }

  // ─── Score Table (computed on demand per game mode) ───
  // scoreForDice(diceIndex, categoryIndex, gameMode) using Scoring.calculate

  function scoreForDice(di, catName, gameMode) {
    var S = getScoring();
    return S.calculate(ALL_DICE[di], catName, gameMode);
  }

  // ─── Phase Computation ───
  // Precompute val0[252] and val1[252] for current game state

  function computePhases(mask, upper, yzFlag, gameMode) {
    // Check cache
    if (phaseCache.mask === mask && phaseCache.upper === upper &&
        phaseCache.yzFlag === yzFlag && phaseCache.gameMode === gameMode) {
      return phaseCache;
    }

    var S = getScoring();
    var cats = S.getCategories(gameMode);
    var numCats = cats.length;
    var entry = getDPEntry(gameMode);
    var isYahtzeeMode = gameMode === 'yahtzee';
    var yahtzeeCatIdx = isYahtzeeMode ? 11 : -1; // 'yahtzee' is at index 11

    var val0 = new Float64Array(NUM_DICE);
    var val1 = new Float64Array(NUM_DICE);

    // Phase 0: rollsLeft=0 — best category for each dice combo
    for (var di = 0; di < NUM_DICE; di++) {
      var best = -1e30;
      var dice = ALL_DICE[di];
      var isAllSame = (dice[0] === dice[4]); // sorted, so all same iff first == last
      var bonus = (isYahtzeeMode && yzFlag && isAllSame) ? 100 : 0;

      var bits = mask;
      while (bits !== 0) {
        var low = bits & (-bits);
        bits &= bits - 1;
        // Get category index from low bit
        var ci = 0; var tmp = low >>> 1; while (tmp) { ci++; tmp >>>= 1; }

        var catScore = S.calculate(dice, cats[ci], gameMode);
        var totalScore = catScore + bonus;

        var nextMask = mask ^ low;
        var nextUpper = upper;
        if (isYahtzeeMode && ci < 6) {
          nextUpper = upper + catScore;
          if (nextUpper > 63) nextUpper = 63;
        }
        var nextYzFlag = yzFlag;
        if (isYahtzeeMode && ci === yahtzeeCatIdx && catScore === 50) {
          nextYzFlag = 1;
        }

        var futureEV = dpLookup(entry, nextMask, nextUpper, nextYzFlag);
        var val = totalScore + futureEV;
        if (val > best) best = val;
      }
      val0[di] = best;
    }

    // Phase 1: rollsLeft=1 — best hold for each dice combo (using val0)
    for (var di = 0; di < NUM_DICE; di++) {
      var bestEV = -1e30;
      var dice = ALL_DICE[di];

      // Try all 32 hold masks (positional for this sorted dice)
      // Deduplicate by tracking seen kept-dice keys
      var seenKept = {};
      for (var hm = 0; hm < 32; hm++) {
        var kept = [];
        var rollCount = 0;
        for (var b = 0; b < 5; b++) {
          if (hm & (1 << b)) kept.push(dice[b]);
          else rollCount++;
        }
        // Dedup: skip if this kept multiset was already evaluated
        var keptKey = kept.join(',');
        if (seenKept[keptKey]) continue;
        seenKept[keptKey] = true;

        var outcomes = ROLL_OUTCOMES[rollCount];
        var ev = 0;
        for (var oi = 0; oi < outcomes.length; oi++) {
          var merged = mergeSorted(kept, outcomes[oi].dice);
          var mi = diceToIndex(merged);
          ev += outcomes[oi].prob * val0[mi];
        }
        if (ev > bestEV) bestEV = ev;
      }
      val1[di] = bestEV;
    }

    phaseCache.mask = mask;
    phaseCache.upper = upper;
    phaseCache.yzFlag = yzFlag;
    phaseCache.gameMode = gameMode;
    phaseCache.val0 = val0;
    phaseCache.val1 = val1;

    return phaseCache;
  }

  // ─── DP-Based Decision Functions ───

  function addNoise(ev, noise) {
    if (noise <= 0) return ev;
    return ev + (Math.random() * 2 - 1) * noise;
  }

  function dpChooseCategory(dice, scores, gameMode, noise) {
    var S = getScoring();
    var cats = S.getCategories(gameMode);
    var state = scoresToState(scores, gameMode);
    var entry = getDPEntry(gameMode);
    var isYahtzeeMode = gameMode === 'yahtzee';
    var yahtzeeCatIdx = isYahtzeeMode ? 11 : -1;
    var sd = sortedDice(dice);
    var isAllSame = (sd[0] === sd[4]);
    var bonus = (isYahtzeeMode && state.yzFlag && isAllSame) ? 100 : 0;

    var bestCat = null;
    var bestVal = -Infinity;

    var bits = state.mask;
    while (bits !== 0) {
      var low = bits & (-bits);
      bits &= bits - 1;
      var ci = 0; var tmp = low >>> 1; while (tmp) { ci++; tmp >>>= 1; }

      var catScore = S.calculate(dice, cats[ci], gameMode);
      var totalScore = catScore + bonus;

      var nextMask = state.mask ^ low;
      var nextUpper = state.upper;
      if (isYahtzeeMode && ci < 6) {
        nextUpper = Math.min(state.upper + catScore, 63);
      }
      var nextYzFlag = state.yzFlag;
      if (isYahtzeeMode && ci === yahtzeeCatIdx && catScore === 50) {
        nextYzFlag = 1;
      }

      var futureEV = dpLookup(entry, nextMask, nextUpper, nextYzFlag);
      var val = addNoise(totalScore + futureEV, noise);
      if (val > bestVal) {
        bestVal = val;
        bestCat = cats[ci];
      }
    }
    return bestCat;
  }

  function dpChooseHolds(dice, scores, gameMode, rollCount, noise) {
    var state = scoresToState(scores, gameMode);
    var phases = computePhases(state.mask, state.upper, state.yzFlag, gameMode);
    var rollsLeft = 3 - rollCount; // after current roll: 1 or 2 more rolls
    // Use val1 for rollsLeft=2 (2 more rerolls), val0 for rollsLeft=1 (1 more reroll)
    var valueTable = rollsLeft >= 2 ? phases.val1 : phases.val0;

    var bestHolds = [false, false, false, false, false];
    var bestEV = -Infinity;

    var seenKept = {};
    for (var hm = 0; hm < 32; hm++) {
      var kept = [];
      var rerollCount = 0;
      for (var b = 0; b < 5; b++) {
        if (hm & (1 << b)) kept.push(dice[b]);
        else rerollCount++;
      }
      var keptSorted = kept.slice().sort(function (a, b) { return a - b; });
      var keptKey = keptSorted.join(',');
      if (seenKept[keptKey] !== undefined) {
        // Same kept multiset — check if this EV was better
        continue;
      }

      var outcomes = ROLL_OUTCOMES[rerollCount];
      var ev = 0;
      for (var oi = 0; oi < outcomes.length; oi++) {
        var merged = mergeSorted(keptSorted, outcomes[oi].dice);
        var mi = diceToIndex(merged);
        ev += outcomes[oi].prob * valueTable[mi];
      }
      seenKept[keptKey] = true;

      var noisyEV = addNoise(ev, noise);
      if (noisyEV > bestEV) {
        bestEV = noisyEV;
        for (var b = 0; b < 5; b++) bestHolds[b] = (hm & (1 << b)) !== 0;
      }
    }

    return bestHolds;
  }

  function dpShouldReroll(dice, scores, gameMode, rollCount, noise) {
    if (rollCount >= 3) return false;

    var state = scoresToState(scores, gameMode);
    var phases = computePhases(state.mask, state.upper, state.yzFlag, gameMode);
    var sd = sortedDice(dice);
    var di = diceToIndex(sd);

    // val0[di] = best value choosing a category NOW (no more rolls)
    // val1[di] = best value with 1 more reroll available (includes hold-all option)
    // val1[di] >= val0[di] always (since hold-all is one of the options in val1)
    // Reroll if the value with more rolls > value of stopping now
    var currentVal = phases.val0[di];
    var rerollVal = phases.val1[di]; // val1 always includes hold-all = val0

    return addNoise(rerollVal, noise) > addNoise(currentVal, noise) + 0.01;
  }

  // ─── DP Table Loader ───

  function loadDPTable(gameMode, callback) {
    if (dpData[gameMode]) {
      if (callback) callback(true);
      return;
    }
    if (dpLoading[gameMode]) {
      if (callback) {
        if (!dpCallbacks[gameMode]) dpCallbacks[gameMode] = [];
        dpCallbacks[gameMode].push(callback);
      }
      return;
    }

    var META = {
      yacht:   { mode: 'yacht',   numCategories: 12, maskStride: 1,   upperStride: 0, maxUpper: 0  },
      yahtzee: { mode: 'yahtzee', numCategories: 13, maskStride: 128, upperStride: 2, maxUpper: 63 }
    };

    dpLoading[gameMode] = true;
    var url = './data/dp_' + gameMode + '.bin';

    fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.arrayBuffer();
      })
      .then(function (buf) {
        var maxValue = new Float32Array(buf, 0, 1)[0];
        var raw = new Uint16Array(buf, 4);
        var dpArray = new Float64Array(raw.length);
        var scale = maxValue / 65535;
        for (var i = 0; i < raw.length; i++) {
          dpArray[i] = raw[i] * scale;
        }

        dpData[gameMode] = { dp: dpArray, meta: META[gameMode] };
        dpLoading[gameMode] = false;
        console.log('[BotAI] DP table loaded:', gameMode,
          '(' + (dpArray.length) + ' entries,',
          (raw.length * 2 / 1024).toFixed(0) + ' KB transferred)');
        if (callback) callback(true);
        var cbs = dpCallbacks[gameMode] || [];
        for (var i = 0; i < cbs.length; i++) cbs[i](true);
        dpCallbacks[gameMode] = [];
      })
      .catch(function (err) {
        console.error('[BotAI] Failed to load DP table:', err);
        dpLoading[gameMode] = false;
        if (callback) callback(false);
        var cbs = dpCallbacks[gameMode] || [];
        for (var i = 0; i < cbs.length; i++) cbs[i](false);
        dpCallbacks[gameMode] = [];
      });
  }

  function isReady(gameMode) {
    return !!dpData[gameMode];
  }

  // ─── Fallback (when DP not loaded) ───
  // Simple greedy: pick highest immediate score

  function fallbackChooseCategory(dice, scores, gameMode) {
    var S = getScoring();
    var available = getAvailableCategories(scores, gameMode);
    if (available.length === 0) return null;
    var bestCat = available[0];
    var bestScore = -1;
    for (var i = 0; i < available.length; i++) {
      var sc = S.calculate(dice, available[i], gameMode);
      if (sc > bestScore) { bestScore = sc; bestCat = available[i]; }
    }
    return bestCat;
  }

  // ─── Public API ───

  function chooseHolds(dice, scores, gameMode, difficulty, rollCount) {
    if (rollCount >= 3) return [true, true, true, true, true];
    var noise = difficulty === 'gambler' ? 0 : BASIC_NOISE;
    if (!isReady(gameMode)) {
      // Fallback: hold highest-count dice
      return [false, false, false, false, false];
    }
    return dpChooseHolds(dice, scores, gameMode, rollCount, noise);
  }

  function chooseCategory(dice, scores, gameMode, difficulty, oppScores) {
    var noise = difficulty === 'gambler' ? 0 : BASIC_NOISE;
    if (!isReady(gameMode)) {
      return fallbackChooseCategory(dice, scores, gameMode);
    }
    return dpChooseCategory(dice, scores, gameMode, noise);
  }

  function shouldReroll(dice, scores, gameMode, difficulty, rollCount) {
    var noise = difficulty === 'gambler' ? 0 : BASIC_NOISE;
    if (!isReady(gameMode)) {
      return rollCount < 3 && Math.random() < 0.5;
    }
    return dpShouldReroll(dice, scores, gameMode, rollCount, noise);
  }

  window.YachtGame.BotAI = {
    chooseHolds: chooseHolds,
    chooseCategory: chooseCategory,
    shouldReroll: shouldReroll,
    loadDPTable: loadDPTable,
    isReady: isReady
  };
})();
