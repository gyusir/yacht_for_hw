// Bot AI decision engine: hold strategy, category selection, reroll decision
(function () {
  'use strict';

  window.YachtGame = window.YachtGame || {};

  var Scoring = null;
  function getScoring() {
    if (!Scoring) Scoring = window.YachtGame.Scoring;
    return Scoring;
  }

  // ─── Helpers ───

  function getCounts(dice) {
    var counts = [0, 0, 0, 0, 0, 0];
    for (var i = 0; i < dice.length; i++) {
      if (dice[i] >= 1 && dice[i] <= 6) counts[dice[i] - 1]++;
    }
    return counts;
  }

  function sumAll(dice) {
    var s = 0;
    for (var i = 0; i < dice.length; i++) s += dice[i];
    return s;
  }

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

  function bestCategoryScore(dice, scores, gameMode) {
    var S = getScoring();
    var available = getAvailableCategories(scores, gameMode);
    var best = 0;
    for (var i = 0; i < available.length; i++) {
      var sc = S.calculate(dice, available[i], gameMode);
      if (sc > best) best = sc;
    }
    return best;
  }

  // Find longest consecutive run in dice
  function findRun(dice) {
    var seen = {};
    for (var i = 0; i < dice.length; i++) seen[dice[i]] = true;
    var bestStart = 0, bestLen = 0;
    for (var start = 1; start <= 6; start++) {
      if (!seen[start]) continue;
      var len = 0;
      for (var v = start; v <= 6 && seen[v]; v++) len++;
      if (len > bestLen) { bestLen = len; bestStart = start; }
    }
    return { start: bestStart, length: bestLen };
  }

  // ─── Basic Difficulty ───

  function basicChooseHolds(dice, scores, gameMode) {
    var counts = getCounts(dice);
    var holds = [false, false, false, false, false];

    // Find the value with highest count
    var maxVal = -1, maxCnt = 0;
    for (var i = 0; i < 6; i++) {
      if (counts[i] > maxCnt || (counts[i] === maxCnt && (i + 1) > maxVal)) {
        maxCnt = counts[i];
        maxVal = i + 1;
      }
    }

    if (maxCnt >= 3) {
      // Hold all dice matching the most frequent value
      for (var i = 0; i < 5; i++) {
        if (dice[i] === maxVal) holds[i] = true;
      }
    } else if (maxCnt === 2) {
      // Check for two pairs
      var pairs = [];
      for (var i = 0; i < 6; i++) {
        if (counts[i] >= 2) pairs.push(i + 1);
      }
      if (pairs.length >= 2) {
        // Hold only the higher pair (Basic misses full house opportunity ~30%)
        var holdVal = pairs[pairs.length - 1];
        if (Math.random() < 0.3) {
          // 30% chance: hold both pairs (accidentally good play)
          for (var i = 0; i < 5; i++) {
            if (dice[i] === pairs[0] || dice[i] === pairs[1]) holds[i] = true;
          }
        } else {
          for (var i = 0; i < 5; i++) {
            if (dice[i] === holdVal) holds[i] = true;
          }
        }
      } else {
        // Single pair — hold it
        for (var i = 0; i < 5; i++) {
          if (dice[i] === maxVal) holds[i] = true;
        }
      }
    } else {
      // No pairs — check for straight potential
      var run = findRun(dice);
      if (run.length >= 4) {
        // Hold the run (only if starting from 1 or 2 — Basic's limited detection)
        if (run.start <= 2) {
          for (var i = 0; i < 5; i++) {
            if (dice[i] >= run.start && dice[i] < run.start + run.length) holds[i] = true;
          }
        } else {
          // Basic misses interior runs — fallback to high values
          for (var i = 0; i < 5; i++) {
            if (dice[i] >= 4) holds[i] = true;
          }
        }
      } else if (run.length === 3 && run.start <= 2) {
        // Partial straight — hold the run
        for (var i = 0; i < 5; i++) {
          if (dice[i] >= run.start && dice[i] < run.start + run.length) holds[i] = true;
        }
      } else {
        // Fallback: hold high-value dice
        for (var i = 0; i < 5; i++) {
          if (dice[i] >= 4) holds[i] = true;
        }
      }
    }

    // Noise injection: 15% chance to un-hold, 5% chance to hold random
    for (var i = 0; i < 5; i++) {
      if (holds[i] && Math.random() < 0.15) {
        holds[i] = false;
      } else if (!holds[i] && Math.random() < 0.05) {
        holds[i] = true;
      }
    }

    return holds;
  }

  function basicChooseCategory(dice, scores, gameMode) {
    var S = getScoring();
    var available = getAvailableCategories(scores, gameMode);
    if (available.length === 0) return null;

    // Calculate scores for each available category
    var scored = [];
    for (var i = 0; i < available.length; i++) {
      scored.push({
        category: available[i],
        score: S.calculate(dice, available[i], gameMode)
      });
    }

    // Sort descending by score
    scored.sort(function (a, b) { return b.score - a.score; });

    // Always pick Yacht/Yahtzee if it scores 50
    if (scored[0].score === 50 && (scored[0].category === 'yacht' || scored[0].category === 'yahtzee')) {
      return scored[0].category;
    }

    // 70% best, 30% random from top 3
    if (Math.random() < 0.7 || scored.length === 1) {
      return scored[0].category;
    } else {
      var topN = Math.min(3, scored.length);
      var pick = Math.floor(Math.random() * topN);
      return scored[pick].category;
    }
  }

  function basicShouldReroll(dice, scores, gameMode, rollCount) {
    if (rollCount >= 3) return false;

    var S = getScoring();
    var available = getAvailableCategories(scores, gameMode);
    var lowerCats = S.getLowerCategories(gameMode);

    // Check if any available lower category scores >= 25
    for (var i = 0; i < available.length; i++) {
      if (lowerCats.indexOf(available[i]) !== -1) {
        var sc = S.calculate(dice, available[i], gameMode);
        if (sc >= 25) return false; // Good enough, stop
      }
    }

    // 60% chance to reroll
    return Math.random() < 0.6;
  }

  // ─── Gambler Difficulty ───

  // Upper bonus targets per category (3 × face value = par)
  var UPPER_TARGETS = { ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18 };

  // Expected future value for unfilled categories (rough heuristic)
  var CATEGORY_EXPECTED = {
    ones: 2.5, twos: 5, threes: 7.5, fours: 10, fives: 12.5, sixes: 15,
    choice: 21, chance: 21,
    threeOfAKind: 15, fourOfAKind: 10,
    fullHouse: 12, smallStraight: 15, largeStraight: 16,
    yacht: 8, yahtzee: 8
  };

  function gamblerEvaluateDice(dice, scores, gameMode) {
    // Returns the best adjusted score for the given dice across available categories
    var S = getScoring();
    var available = getAvailableCategories(scores, gameMode);
    var bestAdjusted = -Infinity;

    for (var i = 0; i < available.length; i++) {
      var cat = available[i];
      var sc = S.calculate(dice, cat, gameMode);
      var adjusted = gamblerCategoryValue(cat, sc, scores, gameMode);
      if (adjusted > bestAdjusted) bestAdjusted = adjusted;
    }

    return bestAdjusted === -Infinity ? 0 : bestAdjusted;
  }

  function gamblerCategoryValue(category, score, scores, gameMode) {
    var adjusted = score;

    // Upper bonus contribution (Yahtzee mode)
    if (gameMode === 'yahtzee' && UPPER_TARGETS[category] !== undefined) {
      var S = getScoring();
      var currentUpperSum = S.upperSum(scores);
      var target = UPPER_TARGETS[category];
      // If this score helps reach 63 bonus threshold
      if (currentUpperSum < 63 && currentUpperSum + score >= 63) {
        adjusted += 35; // Full bonus value
      } else if (currentUpperSum < 63 && score >= target) {
        // On track for bonus — small boost
        adjusted += (score - target) * 0.5 + 3;
      } else if (currentUpperSum < 63 && score < target) {
        // Below par — penalty for falling behind
        adjusted -= (target - score) * 0.3;
      }
    }

    // Opportunity cost: penalize using high-value categories for 0
    if (score === 0) {
      var futureValue = CATEGORY_EXPECTED[category] || 10;
      adjusted -= futureValue;
    }

    // Bonus for taking high-value fixed scores (full house 25, straights)
    if ((category === 'fullHouse' && score === 25) ||
        (category === 'largeStraight' && (score === 30 || score === 40)) ||
        (category === 'yacht' && score === 50) ||
        (category === 'yahtzee' && score === 50)) {
      adjusted += 5; // Prefer locking in hard-to-get categories
    }

    return adjusted;
  }

  function gamblerChooseHolds(dice, scores, gameMode) {
    var bestHolds = [false, false, false, false, false];
    var bestEV = -Infinity;

    // Enumerate all 32 hold combinations
    for (var mask = 0; mask < 32; mask++) {
      var holds = [];
      var unheldCount = 0;
      for (var b = 0; b < 5; b++) {
        holds.push((mask & (1 << b)) !== 0);
        if (!holds[b]) unheldCount++;
      }

      // If holding everything, EV is just the current best score
      if (unheldCount === 0) {
        var ev = gamblerEvaluateDice(dice, scores, gameMode);
        if (ev > bestEV) { bestEV = ev; bestHolds = holds.slice(); }
        continue;
      }

      // Calculate expected value across reroll outcomes
      var ev;
      if (unheldCount <= 3) {
        ev = gamblerFullEnumerate(dice, holds, unheldCount, scores, gameMode);
      } else {
        ev = gamblerMonteCarlo(dice, holds, unheldCount, scores, gameMode, 500);
      }

      if (ev > bestEV) {
        bestEV = ev;
        bestHolds = holds.slice();
      }
    }

    return bestHolds;
  }

  function gamblerFullEnumerate(dice, holds, unheldCount, scores, gameMode) {
    var unheldIndices = [];
    for (var i = 0; i < 5; i++) {
      if (!holds[i]) unheldIndices.push(i);
    }

    var totalOutcomes = Math.pow(6, unheldCount);
    var totalScore = 0;
    var testDice = dice.slice();

    for (var combo = 0; combo < totalOutcomes; combo++) {
      // Generate dice values for this combination
      var c = combo;
      for (var u = 0; u < unheldIndices.length; u++) {
        testDice[unheldIndices[u]] = (c % 6) + 1;
        c = Math.floor(c / 6);
      }
      totalScore += gamblerEvaluateDice(testDice, scores, gameMode);
    }

    return totalScore / totalOutcomes;
  }

  function gamblerMonteCarlo(dice, holds, unheldCount, scores, gameMode, samples) {
    var unheldIndices = [];
    for (var i = 0; i < 5; i++) {
      if (!holds[i]) unheldIndices.push(i);
    }

    var totalScore = 0;
    var testDice = dice.slice();

    for (var s = 0; s < samples; s++) {
      for (var u = 0; u < unheldIndices.length; u++) {
        testDice[unheldIndices[u]] = Math.floor(Math.random() * 6) + 1;
      }
      totalScore += gamblerEvaluateDice(testDice, scores, gameMode);
    }

    return totalScore / samples;
  }

  function gamblerChooseCategory(dice, scores, gameMode) {
    var S = getScoring();
    var available = getAvailableCategories(scores, gameMode);
    if (available.length === 0) return null;

    var bestCat = available[0];
    var bestValue = -Infinity;

    for (var i = 0; i < available.length; i++) {
      var cat = available[i];
      var sc = S.calculate(dice, cat, gameMode);
      var value = gamblerCategoryValue(cat, sc, scores, gameMode);
      if (value > bestValue) {
        bestValue = value;
        bestCat = cat;
      }
    }

    return bestCat;
  }

  function gamblerShouldReroll(dice, scores, gameMode, rollCount) {
    if (rollCount >= 3) return false;

    // Compare current best score vs expected value of rerolling
    var currentBest = gamblerEvaluateDice(dice, scores, gameMode);

    // Calculate EV of best hold + reroll
    var bestRerollEV = -Infinity;
    for (var mask = 0; mask < 32; mask++) {
      var holds = [];
      var unheldCount = 0;
      for (var b = 0; b < 5; b++) {
        holds.push((mask & (1 << b)) !== 0);
        if (!holds[b]) unheldCount++;
      }
      if (unheldCount === 0) continue; // Skip "hold all" — that's not rerolling

      var ev;
      if (unheldCount <= 3) {
        ev = gamblerFullEnumerate(dice, holds, unheldCount, scores, gameMode);
      } else {
        ev = gamblerMonteCarlo(dice, holds, unheldCount, scores, gameMode, 300);
      }
      if (ev > bestRerollEV) bestRerollEV = ev;
    }

    // Reroll if expected improvement is positive
    return bestRerollEV > currentBest + 1; // +1 threshold to avoid marginal rerolls
  }

  // ─── Public API ───

  function chooseHolds(dice, scores, gameMode, difficulty, rollCount) {
    if (rollCount >= 3) return [true, true, true, true, true]; // No more rolls
    if (difficulty === 'gambler') {
      return gamblerChooseHolds(dice, scores, gameMode);
    }
    return basicChooseHolds(dice, scores, gameMode);
  }

  function chooseCategory(dice, scores, gameMode, difficulty, oppScores) {
    if (difficulty === 'gambler') {
      return gamblerChooseCategory(dice, scores, gameMode);
    }
    return basicChooseCategory(dice, scores, gameMode);
  }

  function shouldReroll(dice, scores, gameMode, difficulty, rollCount) {
    if (difficulty === 'gambler') {
      return gamblerShouldReroll(dice, scores, gameMode, rollCount);
    }
    return basicShouldReroll(dice, scores, gameMode, rollCount);
  }

  window.YachtGame.BotAI = {
    chooseHolds: chooseHolds,
    chooseCategory: chooseCategory,
    shouldReroll: shouldReroll
  };
})();
