// Scoring logic for Yacht and Yahtzee
(function () {
  'use strict';

  window.YachtGame = window.YachtGame || {};

  // Category definitions per game mode
  const YACHT_CATEGORIES = [
    'ones', 'twos', 'threes', 'fours', 'fives', 'sixes',
    'choice', 'fourOfAKind', 'fullHouse',
    'smallStraight', 'largeStraight', 'yacht'
  ];

  const YAHTZEE_CATEGORIES = [
    'ones', 'twos', 'threes', 'fours', 'fives', 'sixes',
    'threeOfAKind', 'fourOfAKind', 'fullHouse',
    'smallStraight', 'largeStraight', 'yahtzee', 'chance'
  ];

  const UPPER_CATEGORIES = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];

  const CATEGORY_DISPLAY = {
    ones: 'Ones',
    twos: 'Twos',
    threes: 'Threes',
    fours: 'Fours',
    fives: 'Fives',
    sixes: 'Sixes',
    choice: 'Choice',
    chance: 'Chance',
    threeOfAKind: 'Three of a Kind',
    fourOfAKind: 'Four of a Kind',
    fullHouse: 'Full House',
    smallStraight: 'Sm. Straight',
    largeStraight: 'Lg. Straight',
    yacht: 'Yacht',
    yahtzee: 'Yahtzee'
  };

  // Helper: count occurrences of each die value
  function getCounts(dice) {
    var counts = [0, 0, 0, 0, 0, 0]; // index 0 = value 1, etc.
    for (var i = 0; i < dice.length; i++) {
      counts[dice[i] - 1]++;
    }
    return counts;
  }

  function sumAll(dice) {
    var s = 0;
    for (var i = 0; i < dice.length; i++) s += dice[i];
    return s;
  }

  function sumOfValue(dice, value) {
    var s = 0;
    for (var i = 0; i < dice.length; i++) {
      if (dice[i] === value) s += dice[i];
    }
    return s;
  }

  function maxCount(counts) {
    var m = 0;
    for (var i = 0; i < counts.length; i++) {
      if (counts[i] > m) m = counts[i];
    }
    return m;
  }

  function hasCount(counts, n) {
    for (var i = 0; i < counts.length; i++) {
      if (counts[i] >= n) return true;
    }
    return false;
  }

  function isFullHouse(counts) {
    var has3 = false, has2 = false;
    for (var i = 0; i < counts.length; i++) {
      if (counts[i] === 3) has3 = true;
      if (counts[i] === 2) has2 = true;
    }
    return has3 && has2;
  }

  function longestRun(dice) {
    var unique = [];
    var seen = {};
    for (var i = 0; i < dice.length; i++) {
      if (!seen[dice[i]]) {
        seen[dice[i]] = true;
        unique.push(dice[i]);
      }
    }
    unique.sort(function (a, b) { return a - b; });
    var longest = 1, current = 1;
    for (var i = 1; i < unique.length; i++) {
      if (unique[i] === unique[i - 1] + 1) {
        current++;
        if (current > longest) longest = current;
      } else {
        current = 1;
      }
    }
    return longest;
  }

  // Calculate score for a specific category
  function calculate(dice, category, gameMode) {
    var counts = getCounts(dice);
    var total = sumAll(dice);

    switch (category) {
      case 'ones': return sumOfValue(dice, 1);
      case 'twos': return sumOfValue(dice, 2);
      case 'threes': return sumOfValue(dice, 3);
      case 'fours': return sumOfValue(dice, 4);
      case 'fives': return sumOfValue(dice, 5);
      case 'sixes': return sumOfValue(dice, 6);

      case 'choice': // Yacht mode
        return total;

      case 'chance': // Yahtzee mode
        return total;

      case 'threeOfAKind': // Yahtzee only
        return hasCount(counts, 3) ? total : 0;

      case 'fourOfAKind':
        if (gameMode === 'yacht') {
          // Yacht: sum of the four matching dice only
          if (!hasCount(counts, 4)) return 0;
          for (var i = 0; i < counts.length; i++) {
            if (counts[i] >= 4) return (i + 1) * 4;
          }
          return 0;
        } else {
          // Yahtzee: sum of all 5 dice
          return hasCount(counts, 4) ? total : 0;
        }

      case 'fullHouse':
        if (gameMode === 'yacht') {
          // Yacht: sum of all dice
          return isFullHouse(counts) ? total : 0;
        } else {
          // Yahtzee: fixed 25 points
          return isFullHouse(counts) ? 25 : 0;
        }

      case 'smallStraight':
        if (gameMode === 'yacht') {
          // Yacht: Little Straight = exactly 1,2,3,4,5
          var sorted = dice.slice().sort(function (a, b) { return a - b; });
          var isLittle = sorted[0] === 1 && sorted[1] === 2 && sorted[2] === 3 && sorted[3] === 4 && sorted[4] === 5;
          return isLittle ? 30 : 0;
        } else {
          // Yahtzee: any 4 consecutive
          return longestRun(dice) >= 4 ? 30 : 0;
        }

      case 'largeStraight':
        if (gameMode === 'yacht') {
          // Yacht: Big Straight = exactly 2,3,4,5,6
          var sorted = dice.slice().sort(function (a, b) { return a - b; });
          var isBig = sorted[0] === 2 && sorted[1] === 3 && sorted[2] === 4 && sorted[3] === 5 && sorted[4] === 6;
          return isBig ? 30 : 0;
        } else {
          // Yahtzee: any 5 consecutive
          return longestRun(dice) >= 5 ? 40 : 0;
        }

      case 'yacht': // Yacht mode
        return hasCount(counts, 5) ? 50 : 0;

      case 'yahtzee': // Yahtzee mode
        return hasCount(counts, 5) ? 50 : 0;

      default:
        return 0;
    }
  }

  // Calculate all possible scores for current dice
  function calculateAll(dice, gameMode) {
    var categories = getCategories(gameMode);
    var result = {};
    for (var i = 0; i < categories.length; i++) {
      result[categories[i]] = calculate(dice, categories[i], gameMode);
    }
    return result;
  }

  // Get category list for a game mode
  function getCategories(gameMode) {
    return gameMode === 'yacht' ? YACHT_CATEGORIES : YAHTZEE_CATEGORIES;
  }

  // Get upper section categories
  function getUpperCategories() {
    return UPPER_CATEGORIES;
  }

  // Get lower section categories for a game mode
  function getLowerCategories(gameMode) {
    var cats = getCategories(gameMode);
    return cats.filter(function (c) { return UPPER_CATEGORIES.indexOf(c) === -1; });
  }

  // Calculate upper section sum
  function upperSum(scores) {
    var sum = 0;
    for (var i = 0; i < UPPER_CATEGORIES.length; i++) {
      var val = scores[UPPER_CATEGORIES[i]];
      if (val !== null && val !== undefined) sum += val;
    }
    return sum;
  }

  // Calculate upper bonus (Yahtzee only): +35 if upper sum >= 63
  function upperBonus(scores) {
    return upperSum(scores) >= 63 ? 35 : 0;
  }

  // Calculate total score
  function totalScore(scores, gameMode, yahtzeeBonus) {
    var categories = getCategories(gameMode);
    var sum = 0;
    for (var i = 0; i < categories.length; i++) {
      var val = scores[categories[i]];
      if (val !== null && val !== undefined) sum += val;
    }
    if (gameMode === 'yahtzee') {
      sum += upperBonus(scores);
      sum += (yahtzeeBonus || 0);
    }
    return sum;
  }

  // Check if all categories are filled
  function allFilled(scores, gameMode) {
    var categories = getCategories(gameMode);
    for (var i = 0; i < categories.length; i++) {
      if (scores[categories[i]] === null || scores[categories[i]] === undefined) return false;
    }
    return true;
  }

  // Get display name for a category
  function getDisplayName(category) {
    return CATEGORY_DISPLAY[category] || category;
  }

  window.YachtGame.Scoring = {
    calculate: calculate,
    calculateAll: calculateAll,
    getCategories: getCategories,
    getUpperCategories: getUpperCategories,
    getLowerCategories: getLowerCategories,
    upperSum: upperSum,
    upperBonus: upperBonus,
    totalScore: totalScore,
    allFilled: allFilled,
    getDisplayName: getDisplayName
  };
})();
