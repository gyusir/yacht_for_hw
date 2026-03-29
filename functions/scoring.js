// Scoring logic for Yacht and Yahtzee (server-side copy)
// IMPORTANT: keep in sync with yacht_for_hw/js/scoring.js
'use strict';

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

function getCounts(dice) {
  var counts = [0, 0, 0, 0, 0, 0];
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

    case 'choice':
      return total;

    case 'chance':
      return total;

    case 'threeOfAKind':
      return hasCount(counts, 3) ? total : 0;

    case 'fourOfAKind':
      if (gameMode === 'yacht') {
        if (!hasCount(counts, 4)) return 0;
        for (var i = 0; i < counts.length; i++) {
          if (counts[i] >= 4) return (i + 1) * 4;
        }
        return 0;
      } else {
        return hasCount(counts, 4) ? total : 0;
      }

    case 'fullHouse':
      if (gameMode === 'yacht') {
        return isFullHouse(counts) ? total : 0;
      } else {
        return isFullHouse(counts) ? 25 : 0;
      }

    case 'smallStraight':
      if (gameMode === 'yacht') {
        var sorted = dice.slice().sort(function (a, b) { return a - b; });
        var isLittle = sorted[0] === 1 && sorted[1] === 2 && sorted[2] === 3 && sorted[3] === 4 && sorted[4] === 5;
        return isLittle ? 30 : 0;
      } else {
        return longestRun(dice) >= 4 ? 30 : 0;
      }

    case 'largeStraight':
      if (gameMode === 'yacht') {
        var sorted = dice.slice().sort(function (a, b) { return a - b; });
        var isBig = sorted[0] === 2 && sorted[1] === 3 && sorted[2] === 4 && sorted[3] === 5 && sorted[4] === 6;
        return isBig ? 30 : 0;
      } else {
        return longestRun(dice) >= 5 ? 40 : 0;
      }

    case 'yacht':
      return hasCount(counts, 5) ? 50 : 0;

    case 'yahtzee':
      return hasCount(counts, 5) ? 50 : 0;

    default:
      return 0;
  }
}

function getCategories(gameMode) {
  return gameMode === 'yacht' ? YACHT_CATEGORIES : YAHTZEE_CATEGORIES;
}

function upperSum(scores) {
  var sum = 0;
  for (var i = 0; i < UPPER_CATEGORIES.length; i++) {
    var val = scores[UPPER_CATEGORIES[i]];
    if (val !== null && val !== undefined) sum += val;
  }
  return sum;
}

function upperBonus(scores) {
  return upperSum(scores) >= 63 ? 35 : 0;
}

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

function allFilled(scores, gameMode) {
  var categories = getCategories(gameMode);
  for (var i = 0; i < categories.length; i++) {
    if (scores[categories[i]] === null || scores[categories[i]] === undefined) return false;
  }
  return true;
}

module.exports = {
  calculate,
  getCategories,
  allFilled,
  totalScore,
  upperBonus,
  upperSum,
  YACHT_CATEGORIES,
  YAHTZEE_CATEGORIES
};
