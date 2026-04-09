#!/usr/bin/env node
// Gambler vs Wave bot simulation (Node.js)
// Usage: node tools/simulate.js [games] [mode]
//   games: number of games (default 100)
//   mode:  yacht or yahtzee (default yahtzee)

'use strict';

var fs = require('fs');
var path = require('path');

// ─── Scoring (ported from js/scoring.js) ───

var YACHT_CATEGORIES = [
  'ones','twos','threes','fours','fives','sixes',
  'choice','fourOfAKind','fullHouse','smallStraight','largeStraight','yacht'
];
var YAHTZEE_CATEGORIES = [
  'ones','twos','threes','fours','fives','sixes',
  'threeOfAKind','fourOfAKind','fullHouse','smallStraight','largeStraight','yahtzee','chance'
];
var UPPER_CATEGORIES = ['ones','twos','threes','fours','fives','sixes'];

function getCounts(dice) {
  var c = [0,0,0,0,0,0];
  for (var i = 0; i < dice.length; i++) c[dice[i]-1]++;
  return c;
}
function sumAll(dice) { var s=0; for(var i=0;i<dice.length;i++) s+=dice[i]; return s; }
function sumOfValue(dice,v) { var s=0; for(var i=0;i<dice.length;i++) if(dice[i]===v) s+=dice[i]; return s; }
function hasCount(counts,n) { for(var i=0;i<counts.length;i++) if(counts[i]>=n) return true; return false; }
function isFullHouse(counts) { var h3=false,h2=false; for(var i=0;i<counts.length;i++){if(counts[i]===3)h3=true;if(counts[i]===2)h2=true;} return h3&&h2; }
function longestRun(dice) {
  var seen={}, unique=[];
  for(var i=0;i<dice.length;i++) if(!seen[dice[i]]){seen[dice[i]]=true;unique.push(dice[i]);}
  unique.sort(function(a,b){return a-b;});
  var longest=1,current=1;
  for(var i=1;i<unique.length;i++){if(unique[i]===unique[i-1]+1){current++;if(current>longest)longest=current;}else current=1;}
  return longest;
}

function calculate(dice, category, gameMode) {
  var counts = getCounts(dice), total = sumAll(dice);
  switch(category) {
    case 'ones': return sumOfValue(dice,1);
    case 'twos': return sumOfValue(dice,2);
    case 'threes': return sumOfValue(dice,3);
    case 'fours': return sumOfValue(dice,4);
    case 'fives': return sumOfValue(dice,5);
    case 'sixes': return sumOfValue(dice,6);
    case 'choice': case 'chance': return total;
    case 'threeOfAKind': return hasCount(counts,3)?total:0;
    case 'fourOfAKind':
      if(gameMode==='yacht'){if(!hasCount(counts,4))return 0;for(var i=0;i<counts.length;i++)if(counts[i]>=4)return(i+1)*4;return 0;}
      return hasCount(counts,4)?total:0;
    case 'fullHouse':
      if(gameMode==='yacht') return isFullHouse(counts)?total:0;
      return isFullHouse(counts)?25:0;
    case 'smallStraight':
      if(gameMode==='yacht'){var s=dice.slice().sort(function(a,b){return a-b;});return(s[0]===1&&s[1]===2&&s[2]===3&&s[3]===4&&s[4]===5)?30:0;}
      return longestRun(dice)>=4?30:0;
    case 'largeStraight':
      if(gameMode==='yacht'){var s=dice.slice().sort(function(a,b){return a-b;});return(s[0]===2&&s[1]===3&&s[2]===4&&s[3]===5&&s[4]===6)?30:0;}
      return longestRun(dice)>=5?40:0;
    case 'yacht': case 'yahtzee': return hasCount(counts,5)?50:0;
    default: return 0;
  }
}

function getCategories(gm) { return gm==='yacht'?YACHT_CATEGORIES:YAHTZEE_CATEGORIES; }
function upperSum(scores) { var s=0; for(var i=0;i<UPPER_CATEGORIES.length;i++){var v=scores[UPPER_CATEGORIES[i]];if(v!=null)s+=v;} return s; }
function upperBonus(scores) { return upperSum(scores)>=63?35:0; }
function totalScore(scores,gm,yzBonus) {
  var cats=getCategories(gm),s=0;
  for(var i=0;i<cats.length;i++){var v=scores[cats[i]];if(v!=null)s+=v;}
  if(gm==='yahtzee'){s+=upperBonus(scores);s+=(yzBonus||0);}
  return s;
}

var Scoring = { calculate:calculate, getCategories:getCategories, upperSum:upperSum, upperBonus:upperBonus, totalScore:totalScore };

// ─── Dice Indexing ───

var ALL_DICE = [], DICE_IDX = new Int16Array(16807), FACTORIALS = [1,1,2,6,24,120], NUM_DICE;
for(var i=0;i<16807;i++) DICE_IDX[i]=-1;
for(var a=1;a<=6;a++)for(var b=a;b<=6;b++)for(var c=b;c<=6;c++)for(var d=c;d<=6;d++)for(var e=d;e<=6;e++){
  var idx=ALL_DICE.length; ALL_DICE.push([a,b,c,d,e]);
  DICE_IDX[a+b*7+c*49+d*343+e*2401]=idx;
}
NUM_DICE = ALL_DICE.length;

function pack5(a,b,c,d,e){return a+b*7+c*49+d*343+e*2401;}
function diceToIndex(s){return DICE_IDX[pack5(s[0],s[1],s[2],s[3],s[4])];}
function sortedDice(d){return d.slice().sort(function(a,b){return a-b;});}
function mergeSorted(k,r){var res=[],ki=0,ri=0;while(ki<k.length&&ri<r.length){if(k[ki]<=r[ri])res.push(k[ki++]);else res.push(r[ri++]);}while(ki<k.length)res.push(k[ki++]);while(ri<r.length)res.push(r[ri++]);return res;}

// ─── Roll Outcomes ───

var ROLL_OUTCOMES = [];
(function(){
  function enumMS(cur,minV,rem,cb){if(rem===0){cb(cur);return;}for(var v=minV;v<=6;v++){cur.push(v);enumMS(cur,v,rem-1,cb);cur.pop();}}
  for(var k=0;k<=5;k++){
    var out=[];
    if(k===0){out.push({dice:[],prob:1});}
    else{var tot=Math.pow(6,k);enumMS([],1,k,function(combo){var cnt=[0,0,0,0,0,0];for(var i=0;i<combo.length;i++)cnt[combo[i]-1]++;var ways=FACTORIALS[k];for(var i=0;i<6;i++)ways/=FACTORIALS[cnt[i]];out.push({dice:combo.slice(),prob:ways/tot});});}
    ROLL_OUTCOMES.push(out);
  }
})();

// ─── DP Table ───

var META = {
  yacht:   { numCategories:12, maskStride:1,   upperStride:0, maxUpper:0  },
  yahtzee: { numCategories:13, maskStride:128, upperStride:2, maxUpper:63 }
};

function loadDP(gameMode) {
  var filePath = path.join(__dirname, '..', 'data', 'dp_' + gameMode + '.bin');
  var buf = fs.readFileSync(filePath);
  var ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  var maxValue = new Float32Array(ab, 0, 1)[0];
  var raw = new Uint16Array(ab, 4);
  var dp = new Float64Array(raw.length);
  var scale = maxValue / 65535;
  for (var i = 0; i < raw.length; i++) dp[i] = raw[i] * scale;
  return { dp: dp, meta: META[gameMode] };
}

function dpLookup(entry, mask, upper, yzFlag) {
  if (!entry) return 0;
  var idx = mask * entry.meta.maskStride + upper * entry.meta.upperStride + yzFlag;
  return entry.dp[idx] || 0;
}

// ─── State ───

function scoresToState(scores, gm) {
  var cats = getCategories(gm), mask = 0;
  for (var i = 0; i < cats.length; i++) if (scores[cats[i]] == null) mask |= (1 << i);
  var upper = Math.min(upperSum(scores), 63);
  var yzFlag = (gm === 'yahtzee' && scores.yahtzee === 50) ? 1 : 0;
  return { mask: mask, upper: upper, yzFlag: yzFlag };
}

// ─── Phase Computation (EV-based, for Gambler) ───

function computePhases(mask, upper, yzFlag, gm, entry) {
  var cats = getCategories(gm);
  var isYz = gm === 'yahtzee';
  var yzCatIdx = isYz ? 11 : -1;
  var val0 = new Float64Array(NUM_DICE);
  var val1 = new Float64Array(NUM_DICE);

  for (var di = 0; di < NUM_DICE; di++) {
    var best = -1e30, dice = ALL_DICE[di];
    var isAllSame = dice[0] === dice[4];
    var bonus = (isYz && yzFlag && isAllSame) ? 100 : 0;
    var bits = mask;
    while (bits) {
      var low = bits & (-bits); bits &= bits - 1;
      var ci = 0, tmp = low >>> 1; while (tmp) { ci++; tmp >>>= 1; }
      var catScore = calculate(dice, cats[ci], gm);
      var ts = catScore + bonus;
      var nm = mask ^ low, nu = upper;
      if (isYz && ci < 6) nu = Math.min(upper + catScore, 63);
      var nyz = yzFlag;
      if (isYz && ci === yzCatIdx && catScore === 50) nyz = 1;
      var v = ts + dpLookup(entry, nm, nu, nyz);
      if (v > best) best = v;
    }
    val0[di] = best;
  }

  for (var di = 0; di < NUM_DICE; di++) {
    var bestEV = -1e30, dice = ALL_DICE[di], seen = {};
    for (var hm = 0; hm < 32; hm++) {
      var kept = [], rc = 0;
      for (var b = 0; b < 5; b++) { if (hm & (1 << b)) kept.push(dice[b]); else rc++; }
      var kk = kept.join(','); if (seen[kk]) continue; seen[kk] = true;
      var outcomes = ROLL_OUTCOMES[rc], ev = 0;
      for (var oi = 0; oi < outcomes.length; oi++) {
        var merged = mergeSorted(kept, outcomes[oi].dice);
        ev += outcomes[oi].prob * val0[diceToIndex(merged)];
      }
      if (ev > bestEV) bestEV = ev;
    }
    val1[di] = bestEV;
  }

  return { val0: val0, val1: val1 };
}

// ─── Gambler Bot (EV optimal) ───

function gamblerDecide(dice, scores, gm, rollCount, entry) {
  var state = scoresToState(scores, gm);
  var phases = computePhases(state.mask, state.upper, state.yzFlag, gm, entry);
  var sd = sortedDice(dice);
  var di = diceToIndex(sd);

  if (rollCount >= 3) {
    return { action: 'category', category: gamblerChooseCat(dice, scores, gm, entry) };
  }

  var rollsLeft = 3 - rollCount;
  if (phases.val1[di] - phases.val0[di] > 0.01) {
    // reroll
    var valueTable = rollsLeft >= 2 ? phases.val1 : phases.val0;
    var bestHolds = null, bestEV = -1e30, seen = {};
    for (var hm = 0; hm < 32; hm++) {
      var kept = [], rc = 0;
      for (var b = 0; b < 5; b++) { if (hm & (1 << b)) kept.push(dice[b]); else rc++; }
      var ks = kept.slice().sort(function(a,b){return a-b;}), kk = ks.join(',');
      if (seen[kk] !== undefined) continue; seen[kk] = true;
      var outcomes = ROLL_OUTCOMES[rc], ev = 0;
      for (var oi = 0; oi < outcomes.length; oi++) {
        ev += outcomes[oi].prob * valueTable[diceToIndex(mergeSorted(ks, outcomes[oi].dice))];
      }
      if (ev > bestEV) { bestEV = ev; bestHolds = []; for (var b=0;b<5;b++) bestHolds.push(!!(hm&(1<<b))); }
    }
    return { action: 'reroll', holds: bestHolds };
  } else {
    return { action: 'category', category: gamblerChooseCat(dice, scores, gm, entry) };
  }
}

function gamblerChooseCat(dice, scores, gm, entry) {
  var cats = getCategories(gm), state = scoresToState(scores, gm);
  var isYz = gm === 'yahtzee', yzCatIdx = isYz ? 11 : -1;
  var sd = sortedDice(dice), isAllSame = sd[0] === sd[4];
  var bonus = (isYz && state.yzFlag && isAllSame) ? 100 : 0;
  var bestCat = null, bestVal = -1e30;
  var bits = state.mask;
  while (bits) {
    var low = bits & (-bits); bits &= bits - 1;
    var ci = 0, tmp = low >>> 1; while (tmp) { ci++; tmp >>>= 1; }
    var catScore = calculate(dice, cats[ci], gm);
    var ts = catScore + bonus;
    var nm = state.mask ^ low, nu = state.upper;
    if (isYz && ci < 6) nu = Math.min(state.upper + catScore, 63);
    var nyz = state.yzFlag;
    if (isYz && ci === yzCatIdx && catScore === 50) nyz = 1;
    var v = ts + dpLookup(entry, nm, nu, nyz);
    if (v > bestVal) { bestVal = v; bestCat = cats[ci]; }
  }
  return bestCat;
}

// ─── Wave Bot (Win-probability in endgame, EV otherwise) ───

// ─── Basic Bot (Gambler with mistakes) ───

var CLOSE_THRESHOLD = 8;
var MISTAKE_RATE = 0.25;

function basicDecide(dice, scores, gm, rollCount, entry) {
  var state = scoresToState(scores, gm);
  var phases = computePhases(state.mask, state.upper, state.yzFlag, gm, entry);
  var sd = sortedDice(dice);
  var di = diceToIndex(sd);

  if (rollCount >= 3) {
    return { action: 'category', category: basicChooseCat(dice, scores, gm, entry) };
  }

  // Should reroll? (with mistakes)
  var gap = phases.val1[di] - phases.val0[di];
  var doReroll;
  if (gap > CLOSE_THRESHOLD) doReroll = true;
  else if (gap < -CLOSE_THRESHOLD) doReroll = false;
  else if (Math.random() < MISTAKE_RATE) doReroll = gap <= 0.01;
  else doReroll = gap > 0.01;

  if (doReroll) {
    var rollsLeft = 3 - rollCount;
    var valueTable = rollsLeft >= 2 ? phases.val1 : phases.val0;
    var candidates = [], seen = {};
    for (var hm = 0; hm < 32; hm++) {
      var kept = [], rc = 0;
      for (var b = 0; b < 5; b++) { if (hm & (1 << b)) kept.push(dice[b]); else rc++; }
      var ks = kept.slice().sort(function(a,b){return a-b;}), kk = ks.join(',');
      if (seen[kk] !== undefined) continue; seen[kk] = true;
      var outcomes = ROLL_OUTCOMES[rc], ev = 0;
      for (var oi = 0; oi < outcomes.length; oi++) {
        ev += outcomes[oi].prob * valueTable[diceToIndex(mergeSorted(ks, outcomes[oi].dice))];
      }
      var holds = []; for (var b=0;b<5;b++) holds.push(!!(hm&(1<<b)));
      candidates.push({ holds: holds, ev: ev });
    }
    candidates.sort(function(a,b){return b.ev-a.ev;});
    var pick = candidates[0];
    if (candidates.length > 1) {
      var close = [candidates[0]];
      for (var i=1;i<candidates.length;i++) { if(candidates[0].ev-candidates[i].ev<=CLOSE_THRESHOLD) close.push(candidates[i]); else break; }
      if (close.length > 1 && Math.random() < MISTAKE_RATE) pick = close[1+Math.floor(Math.random()*(close.length-1))];
    }
    return { action: 'reroll', holds: pick.holds };
  } else {
    return { action: 'category', category: basicChooseCat(dice, scores, gm, entry) };
  }
}

function basicChooseCat(dice, scores, gm, entry) {
  var cats = getCategories(gm), state = scoresToState(scores, gm);
  var isYz = gm === 'yahtzee', yzCatIdx = isYz ? 11 : -1;
  var sd = sortedDice(dice), isAllSame = sd[0] === sd[4];
  var bonus = (isYz && state.yzFlag && isAllSame) ? 100 : 0;
  var candidates = [], bits = state.mask;
  while (bits) {
    var low = bits & (-bits); bits &= bits - 1;
    var ci = 0, tmp = low >>> 1; while (tmp) { ci++; tmp >>>= 1; }
    var catScore = calculate(dice, cats[ci], gm);
    var ts = catScore + bonus;
    var nm = state.mask ^ low, nu = state.upper;
    if (isYz && ci < 6) nu = Math.min(state.upper + catScore, 63);
    var nyz = state.yzFlag;
    if (isYz && ci === yzCatIdx && catScore === 50) nyz = 1;
    var v = ts + dpLookup(entry, nm, nu, nyz);
    candidates.push({ cat: cats[ci], val: v });
  }
  candidates.sort(function(a,b){return b.val-a.val;});
  if (candidates.length > 1) {
    var close = [candidates[0]];
    for (var i=1;i<candidates.length;i++) { if(candidates[0].val-candidates[i].val<=CLOSE_THRESHOLD) close.push(candidates[i]); else break; }
    if (close.length > 1 && Math.random() < MISTAKE_RATE) return close[1+Math.floor(Math.random()*(close.length-1))].cat;
  }
  return candidates[0].cat;
}

var ENDGAME_THRESHOLD = 5;

function sigmoid(x) { if(x>20)return 1;if(x<-20)return 0;return 1/(1+Math.exp(-x)); }
function winProb(botFinal, oppFinal, turnsLeft) {
  var delta = botFinal - oppFinal;
  var stdDev = turnsLeft * 15; if (stdDev < 1) stdDev = 1;
  return sigmoid(delta / (stdDev * 0.588));
}

function waveDecide(dice, botScores, oppScores, gm, rollCount, entry) {
  var cats = getCategories(gm);
  var filled = 0;
  for (var i = 0; i < cats.length; i++) if (botScores[cats[i]] != null) filled++;
  var remaining = cats.length - filled;

  if (remaining > ENDGAME_THRESHOLD) {
    // Play like gambler
    return gamblerDecide(dice, botScores, gm, rollCount, entry);
  }

  // Endgame: win-probability maximization
  var botState = scoresToState(botScores, gm);
  var oppState = scoresToState(oppScores, gm);
  var oppCurrent = totalScore(oppScores, gm, oppScores.yahtzeeBonus || 0);
  var oppFutureEV = dpLookup(entry, oppState.mask, oppState.upper, oppState.yzFlag);
  var oppFinal = oppCurrent + oppFutureEV;
  var botCurrent = totalScore(botScores, gm, botScores.yahtzeeBonus || 0);
  var isYz = gm === 'yahtzee', yzCatIdx = isYz ? 11 : -1;

  if (rollCount >= 3) {
    var catResult = wpChooseCat(dice, botState, botCurrent, oppFinal, remaining, cats, gm, entry, isYz, yzCatIdx);
    return { action: 'category', category: catResult.category };
  }

  var stopResult = wpChooseCat(dice, botState, botCurrent, oppFinal, remaining, cats, gm, entry, isYz, yzCatIdx);
  var rerollResult = wpChooseHolds(dice, botState, botCurrent, oppFinal, remaining, 3 - rollCount, cats, gm, entry, isYz, yzCatIdx);

  // Saturated win prob → fallback to EV
  var bestWP = Math.max(stopResult.wp, rerollResult.wp);
  if (bestWP >= 0.99 || bestWP <= 0.01) {
    return gamblerDecide(dice, botScores, gm, rollCount, entry);
  }

  if (rerollResult.wp > stopResult.wp + 0.001) {
    return { action: 'reroll', holds: rerollResult.holds };
  } else {
    return { action: 'category', category: stopResult.category };
  }
}

function wpChooseCat(dice, botState, botCurrent, oppFinal, remaining, cats, gm, entry, isYz, yzCatIdx) {
  var sd = sortedDice(dice), isAllSame = sd[0] === sd[4];
  var bonus = (isYz && botState.yzFlag && isAllSame) ? 100 : 0;
  var bestCat = null, bestWP = -1;
  var bits = botState.mask;
  while (bits) {
    var low = bits & (-bits); bits &= bits - 1;
    var ci = 0, tmp = low >>> 1; while (tmp) { ci++; tmp >>>= 1; }
    var catScore = calculate(dice, cats[ci], gm);
    var ts = catScore + bonus;
    var nm = botState.mask ^ low, nu = botState.upper;
    if (isYz && ci < 6) nu = Math.min(botState.upper + catScore, 63);
    var nyz = botState.yzFlag;
    if (isYz && ci === yzCatIdx && catScore === 50) nyz = 1;
    var futureEV = dpLookup(entry, nm, nu, nyz);
    var wp = winProb(botCurrent + ts + futureEV, oppFinal, remaining - 1);
    if (wp > bestWP) { bestWP = wp; bestCat = cats[ci]; }
  }
  return { category: bestCat, wp: bestWP };
}

function wpChooseHolds(dice, botState, botCurrent, oppFinal, remaining, rollsLeft, cats, gm, entry, isYz, yzCatIdx) {
  // Phase 0: wp for each dice combo
  var wp0 = new Float64Array(NUM_DICE);
  for (var di = 0; di < NUM_DICE; di++) {
    var d = ALL_DICE[di], isAllSame = d[0]===d[4];
    var bonus = (isYz && botState.yzFlag && isAllSame) ? 100 : 0;
    var bestWP = -1, bts = botState.mask;
    while (bts) {
      var low = bts & (-bts); bts &= bts - 1;
      var ci = 0, tmp = low >>> 1; while (tmp) { ci++; tmp >>>= 1; }
      var catScore = calculate(d, cats[ci], gm);
      var ts = catScore + bonus;
      var nm = botState.mask ^ low, nu = botState.upper;
      if (isYz && ci < 6) nu = Math.min(botState.upper + catScore, 63);
      var nyz = botState.yzFlag;
      if (isYz && ci === yzCatIdx && catScore === 50) nyz = 1;
      var futureEV = dpLookup(entry, nm, nu, nyz);
      var wp = winProb(botCurrent + ts + futureEV, oppFinal, remaining - 1);
      if (wp > bestWP) bestWP = wp;
    }
    wp0[di] = bestWP;
  }

  var wp1 = null;
  if (rollsLeft >= 2) {
    wp1 = new Float64Array(NUM_DICE);
    for (var di = 0; di < NUM_DICE; di++) {
      var d = ALL_DICE[di], bestEWP = -1, seen = {};
      for (var hm = 0; hm < 32; hm++) {
        var kept = [], rc = 0;
        for (var b = 0; b < 5; b++) { if (hm & (1 << b)) kept.push(d[b]); else rc++; }
        var kk = kept.join(','); if (seen[kk]) continue; seen[kk] = true;
        var ewp = 0, outcomes = ROLL_OUTCOMES[rc];
        for (var oi = 0; oi < outcomes.length; oi++) ewp += outcomes[oi].prob * wp0[diceToIndex(mergeSorted(kept, outcomes[oi].dice))];
        if (ewp > bestEWP) bestEWP = ewp;
      }
      wp1[di] = bestEWP;
    }
  }

  var valueTable = (rollsLeft >= 2 && wp1) ? wp1 : wp0;
  var bestHolds = null, bestWP2 = -1, seen2 = {};
  for (var hm = 0; hm < 32; hm++) {
    var kept = [], rc = 0;
    for (var b = 0; b < 5; b++) { if (hm & (1 << b)) kept.push(dice[b]); else rc++; }
    var ks = kept.slice().sort(function(a,b2){return a-b2;}), kk = ks.join(',');
    if (seen2[kk] !== undefined) continue; seen2[kk] = true;
    var ewp = 0, outcomes = ROLL_OUTCOMES[rc];
    for (var oi = 0; oi < outcomes.length; oi++) ewp += outcomes[oi].prob * valueTable[diceToIndex(mergeSorted(ks, outcomes[oi].dice))];
    if (ewp > bestWP2) { bestWP2 = ewp; bestHolds = []; for (var b=0;b<5;b++) bestHolds.push(!!(hm&(1<<b))); }
  }
  return { holds: bestHolds, wp: bestWP2 };
}

// ─── Game Simulation ───

function rollDice() { return [1,2,3,4,5].map(function(){return Math.floor(Math.random()*6)+1;}); }

// ─── Wave2 Bot (full-game WP blending + category-aware variance) ───

// Estimate per-turn standard deviation based on remaining category composition
function estimateStdDev(mask, gm) {
  var cats = getCategories(gm);
  // High-variance categories: yacht/yahtzee, largeStraight, fullHouse
  var HIGH_VAR = { yacht:1, yahtzee:1, largeStraight:1, fullHouse:1, smallStraight:1 };
  var totalCats = 0, highVarCats = 0;
  var bits = mask;
  while (bits) {
    var low = bits & (-bits); bits &= bits - 1;
    var ci = 0, tmp = low >>> 1; while (tmp) { ci++; tmp >>>= 1; }
    totalCats++;
    if (HIGH_VAR[cats[ci]]) highVarCats++;
  }
  if (totalCats === 0) return 1;
  // Base: 12 per turn for low-var, 20 for high-var, blend by composition
  var highRatio = highVarCats / totalCats;
  return totalCats * (12 + highRatio * 8);
}

function winProb2(botFinal, oppFinal, stdDev) {
  var delta = botFinal - oppFinal;
  if (stdDev < 1) stdDev = 1;
  return sigmoid(delta / (stdDev * 0.588));
}

function wave2Decide(dice, botScores, oppScores, gm, rollCount, entry) {
  var cats = getCategories(gm);
  var botState = scoresToState(botScores, gm);
  var oppState = scoresToState(oppScores, gm);
  var oppCurrent = totalScore(oppScores, gm, oppScores.yahtzeeBonus || 0);
  var oppFutureEV = dpLookup(entry, oppState.mask, oppState.upper, oppState.yzFlag);
  var oppFinal = oppCurrent + oppFutureEV;
  var botCurrent = totalScore(botScores, gm, botScores.yahtzeeBonus || 0);
  var isYz = gm === 'yahtzee', yzCatIdx = isYz ? 11 : -1;

  var filled = 0;
  for (var i = 0; i < cats.length; i++) if (botScores[cats[i]] != null) filled++;
  var remaining = cats.length - filled;

  var stdDev = estimateStdDev(botState.mask, gm);

  if (rollCount >= 3) {
    var catResult = wp2ChooseCat(dice, botState, botCurrent, oppFinal, stdDev, cats, gm, entry, isYz, yzCatIdx);
    return { action: 'category', category: catResult.category };
  }

  var stopResult = wp2ChooseCat(dice, botState, botCurrent, oppFinal, stdDev, cats, gm, entry, isYz, yzCatIdx);
  var rerollResult = wp2ChooseHolds(dice, botState, botCurrent, oppFinal, stdDev, 3 - rollCount, cats, gm, entry, isYz, yzCatIdx);

  // Saturated → fallback to EV (relaxed threshold: 0.95/0.05)
  var bestWP = Math.max(stopResult.wp, rerollResult.wp);
  if (bestWP >= 0.95 || bestWP <= 0.05) {
    return gamblerDecide(dice, botScores, gm, rollCount, entry);
  }

  if (rerollResult.wp > stopResult.wp + 0.001) {
    return { action: 'reroll', holds: rerollResult.holds };
  } else {
    return { action: 'category', category: stopResult.category };
  }
}

function wp2ChooseCat(dice, botState, botCurrent, oppFinal, stdDev, cats, gm, entry, isYz, yzCatIdx) {
  var sd = sortedDice(dice), isAllSame = sd[0] === sd[4];
  var bonus = (isYz && botState.yzFlag && isAllSame) ? 100 : 0;
  var bestCat = null, bestWP = -1;
  var bits = botState.mask;
  while (bits) {
    var low = bits & (-bits); bits &= bits - 1;
    var ci = 0, tmp = low >>> 1; while (tmp) { ci++; tmp >>>= 1; }
    var catScore = calculate(dice, cats[ci], gm);
    var ts = catScore + bonus;
    var nm = botState.mask ^ low, nu = botState.upper;
    if (isYz && ci < 6) nu = Math.min(botState.upper + catScore, 63);
    var nyz = botState.yzFlag;
    if (isYz && ci === yzCatIdx && catScore === 50) nyz = 1;
    var futureEV = dpLookup(entry, nm, nu, nyz);
    // Use remaining stdDev after this turn (subtract this category's contribution)
    var nextStdDev = estimateStdDev(nm, gm);
    var wp = winProb2(botCurrent + ts + futureEV, oppFinal, nextStdDev);
    if (wp > bestWP) { bestWP = wp; bestCat = cats[ci]; }
  }
  return { category: bestCat, wp: bestWP };
}

function wp2ChooseHolds(dice, botState, botCurrent, oppFinal, stdDev, rollsLeft, cats, gm, entry, isYz, yzCatIdx) {
  var wp0 = new Float64Array(NUM_DICE);
  for (var di = 0; di < NUM_DICE; di++) {
    var d = ALL_DICE[di], isAllSame = d[0]===d[4];
    var bonus = (isYz && botState.yzFlag && isAllSame) ? 100 : 0;
    var bestWP = -1, bts = botState.mask;
    while (bts) {
      var low = bts & (-bts); bts &= bts - 1;
      var ci = 0, tmp = low >>> 1; while (tmp) { ci++; tmp >>>= 1; }
      var catScore = calculate(d, cats[ci], gm);
      var ts = catScore + bonus;
      var nm = botState.mask ^ low, nu = botState.upper;
      if (isYz && ci < 6) nu = Math.min(botState.upper + catScore, 63);
      var nyz = botState.yzFlag;
      if (isYz && ci === yzCatIdx && catScore === 50) nyz = 1;
      var futureEV = dpLookup(entry, nm, nu, nyz);
      var nextStdDev = estimateStdDev(nm, gm);
      var wp = winProb2(botCurrent + ts + futureEV, oppFinal, nextStdDev);
      if (wp > bestWP) bestWP = wp;
    }
    wp0[di] = bestWP;
  }

  var wp1 = null;
  if (rollsLeft >= 2) {
    wp1 = new Float64Array(NUM_DICE);
    for (var di = 0; di < NUM_DICE; di++) {
      var d = ALL_DICE[di], bestEWP = -1, seen = {};
      for (var hm = 0; hm < 32; hm++) {
        var kept = [], rc = 0;
        for (var b = 0; b < 5; b++) { if (hm & (1 << b)) kept.push(d[b]); else rc++; }
        var kk = kept.join(','); if (seen[kk]) continue; seen[kk] = true;
        var ewp = 0, outcomes = ROLL_OUTCOMES[rc];
        for (var oi = 0; oi < outcomes.length; oi++) ewp += outcomes[oi].prob * wp0[diceToIndex(mergeSorted(kept, outcomes[oi].dice))];
        if (ewp > bestEWP) bestEWP = ewp;
      }
      wp1[di] = bestEWP;
    }
  }

  var valueTable = (rollsLeft >= 2 && wp1) ? wp1 : wp0;
  var bestHolds = null, bestWP2 = -1, seen2 = {};
  for (var hm = 0; hm < 32; hm++) {
    var kept = [], rc = 0;
    for (var b = 0; b < 5; b++) { if (hm & (1 << b)) kept.push(dice[b]); else rc++; }
    var ks = kept.slice().sort(function(a,b2){return a-b2;}), kk = ks.join(',');
    if (seen2[kk] !== undefined) continue; seen2[kk] = true;
    var ewp = 0, outcomes = ROLL_OUTCOMES[rc];
    for (var oi = 0; oi < outcomes.length; oi++) ewp += outcomes[oi].prob * valueTable[diceToIndex(mergeSorted(ks, outcomes[oi].dice))];
    if (ewp > bestWP2) { bestWP2 = ewp; bestHolds = []; for (var b=0;b<5;b++) bestHolds.push(!!(hm&(1<<b))); }
  }
  return { holds: bestHolds, wp: bestWP2 };
}

function applyHolds(dice, holds) {
  var next = [];
  for (var i = 0; i < 5; i++) {
    next.push(holds[i] ? dice[i] : Math.floor(Math.random() * 6) + 1);
  }
  return next;
}

function emptyScores(gm) {
  var s = {}, cats = getCategories(gm);
  for (var i = 0; i < cats.length; i++) s[cats[i]] = null;
  if (gm === 'yahtzee') s.yahtzeeBonus = 0;
  return s;
}

function playTurn(scores, oppScores, gm, botType, entry) {
  var dice = rollDice();
  var rollCount = 1;

  for (var r = 0; r < 2; r++) {
    var decision;
    if (botType === 'wave2') {
      decision = wave2Decide(dice, scores, oppScores, gm, rollCount, entry);
    } else if (botType === 'wave') {
      decision = waveDecide(dice, scores, oppScores, gm, rollCount, entry);
    } else if (botType === 'basic') {
      decision = basicDecide(dice, scores, gm, rollCount, entry);
    } else {
      decision = gamblerDecide(dice, scores, gm, rollCount, entry);
    }

    if (decision.action === 'reroll') {
      dice = applyHolds(dice, decision.holds);
      rollCount++;
    } else {
      break;
    }
  }

  // Choose category
  var finalDecision;
  if (botType === 'wave2') {
    finalDecision = wave2Decide(dice, scores, oppScores, gm, rollCount, entry);
  } else if (botType === 'wave') {
    finalDecision = waveDecide(dice, scores, oppScores, gm, rollCount, entry);
  } else if (botType === 'basic') {
    finalDecision = basicDecide(dice, scores, gm, rollCount, entry);
  } else {
    finalDecision = gamblerDecide(dice, scores, gm, rollCount, entry);
  }

  var cat = finalDecision.category;
  if (!cat) cat = gamblerChooseCat(dice, scores, gm, entry);
  var score = calculate(dice, cat, gm);

  // Yahtzee bonus
  if (gm === 'yahtzee' && cat !== 'yahtzee' && hasCount(getCounts(dice), 5) && scores.yahtzee === 50) {
    scores.yahtzeeBonus = (scores.yahtzeeBonus || 0) + 100;
  }

  scores[cat] = score;
  return { cat: cat, score: score, dice: dice };
}

function simulateGame(gm, entry, bot1First, bot1Type, bot2Type) {
  var bot1Scores = emptyScores(gm);
  var bot2Scores = emptyScores(gm);
  var cats = getCategories(gm);
  var numTurns = cats.length;

  for (var t = 0; t < numTurns; t++) {
    if (bot1First) {
      playTurn(bot1Scores, bot2Scores, gm, bot1Type, entry);
      playTurn(bot2Scores, bot1Scores, gm, bot2Type, entry);
    } else {
      playTurn(bot2Scores, bot1Scores, gm, bot2Type, entry);
      playTurn(bot1Scores, bot2Scores, gm, bot1Type, entry);
    }
  }

  var t1 = totalScore(bot1Scores, gm, bot1Scores.yahtzeeBonus || 0);
  var t2 = totalScore(bot2Scores, gm, bot2Scores.yahtzeeBonus || 0);

  return { bot1: t1, bot2: t2 };
}

// ─── Main ───

// ─── Worker Thread Mode ───

var workerThreads = require('worker_threads');

if (!workerThreads.isMainThread) {
  // Worker: run assigned games and return stats
  var wd = workerThreads.workerData;
  var wEntry = loadDP(wd.gameMode);
  var wStats = {
    b1First: { b1W:0, b2W:0, dr:0, b1Sum:0, b2Sum:0, b1Max:0, b2Max:0 },
    b2First: { b1W:0, b2W:0, dr:0, b1Sum:0, b2Sum:0, b1Max:0, b2Max:0 }
  };
  for (var wi = 0; wi < wd.games.length; wi++) {
    var g = wd.games[wi];
    var result = simulateGame(wd.gameMode, wEntry, g.b1First, wd.bot1Type, wd.bot2Type);
    var s = g.b1First ? wStats.b1First : wStats.b2First;
    s.b1Sum += result.bot1; s.b2Sum += result.bot2;
    if (result.bot1 > s.b1Max) s.b1Max = result.bot1;
    if (result.bot2 > s.b2Max) s.b2Max = result.bot2;
    if (result.bot1 > result.bot2) s.b1W++;
    else if (result.bot2 > result.bot1) s.b2W++;
    else s.dr++;
    if ((wi + 1) % 10 === 0) workerThreads.parentPort.postMessage({ type: 'progress', count: 10 });
  }
  workerThreads.parentPort.postMessage({ type: 'done', stats: wStats });
} else {

// ─── Main Thread ───

// Usage: node tools/simulate.js [games] [mode] [bot1] [bot2]
var numGames = parseInt(process.argv[2]) || 100;
var gameMode = process.argv[3] || 'yahtzee';
var bot1Type = process.argv[4] || 'gambler';
var bot2Type = process.argv[5] || 'wave';
var half = Math.floor(numGames / 2);

var bot1Name = bot1Type.charAt(0).toUpperCase() + bot1Type.slice(1);
var bot2Name = bot2Type.charAt(0).toUpperCase() + bot2Type.slice(1);

var numWorkers = require('os').cpus().length;
if (numWorkers > numGames) numWorkers = numGames;

console.log('Loading DP table for ' + gameMode + '...');
var testEntry = loadDP(gameMode);
console.log('DP loaded (' + testEntry.dp.length + ' entries)');
console.log('Using ' + numWorkers + ' worker threads\n');

console.log('=== ' + gameMode.toUpperCase() + ' | ' + bot1Name + ' vs ' + bot2Name + ' | ' + numGames + ' games (each side ' + half + ' first) ===\n');

// Build game list and split across workers
var allGames = [];
for (var g = 0; g < numGames; g++) allGames.push({ b1First: g < half });

var chunks = [];
var chunkSize = Math.ceil(allGames.length / numWorkers);
for (var i = 0; i < numWorkers; i++) {
  chunks.push(allGames.slice(i * chunkSize, (i + 1) * chunkSize));
}

var completed = 0;
var finishedWorkers = 0;
var startTime = Date.now();
var stats = {
  b1First: { b1W:0, b2W:0, dr:0, b1Sum:0, b2Sum:0, b1Max:0, b2Max:0 },
  b2First: { b1W:0, b2W:0, dr:0, b1Sum:0, b2Sum:0, b1Max:0, b2Max:0 }
};

for (var wi = 0; wi < chunks.length; wi++) {
  if (chunks[wi].length === 0) { finishedWorkers++; continue; }
  var w = new workerThreads.Worker(__filename, {
    workerData: { games: chunks[wi], gameMode: gameMode, bot1Type: bot1Type, bot2Type: bot2Type }
  });
  w.on('message', function (msg) {
    if (msg.type === 'progress') {
      completed += msg.count;
      process.stdout.write('\r  ' + completed + '/' + numGames + ' games completed');
    } else if (msg.type === 'done') {
      var ws = msg.stats;
      ['b1First','b2First'].forEach(function(k) {
        stats[k].b1W += ws[k].b1W; stats[k].b2W += ws[k].b2W; stats[k].dr += ws[k].dr;
        stats[k].b1Sum += ws[k].b1Sum; stats[k].b2Sum += ws[k].b2Sum;
        if (ws[k].b1Max > stats[k].b1Max) stats[k].b1Max = ws[k].b1Max;
        if (ws[k].b2Max > stats[k].b2Max) stats[k].b2Max = ws[k].b2Max;
      });
      finishedWorkers++;
      if (finishedWorkers === chunks.length) printResults();
    }
  });
}

function pct(n, d) { return (n / d * 100).toFixed(1); }
function pad(str, len) { while (str.length < len) str = ' ' + str; return str; }

function printResults() {
  process.stdout.write('\r  ' + numGames + '/' + numGames + ' games completed');
  var elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n');

  var b1f = stats.b1First, b2f = stats.b2First;
  var allB1W = b1f.b1W + b2f.b1W, allB2W = b1f.b2W + b2f.b2W, allDr = b1f.dr + b2f.dr;
  var allB1Sum = b1f.b1Sum + b2f.b1Sum, allB2Sum = b1f.b2Sum + b2f.b2Sum;

  console.log('═══════════════════════════════════════════════════════');
  console.log('  Results (' + elapsed + 's, ' + numWorkers + ' threads)');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
  console.log('  ┌─────────────────┬──────────┬──────────┬──────────┐');
  console.log('  │                 │ ' + pad(bot1Name,8) + ' │ ' + pad(bot2Name,8) + ' │  Draw    │');
  console.log('  │                 │  wins    │  wins    │          │');
  console.log('  ├─────────────────┼──────────┼──────────┼──────────┤');
  console.log('  │ ' + pad(bot1Name,7) + ' 1st     │ ' + pad(b1f.b1W+' ('+pct(b1f.b1W,half)+'%)',8) + ' │ ' + pad(b1f.b2W+' ('+pct(b1f.b2W,half)+'%)',8) + ' │ ' + pad(String(b1f.dr),8) + ' │');
  console.log('  │ ' + pad(bot2Name,7) + ' 1st     │ ' + pad(b2f.b1W+' ('+pct(b2f.b1W,half)+'%)',8) + ' │ ' + pad(b2f.b2W+' ('+pct(b2f.b2W,half)+'%)',8) + ' │ ' + pad(String(b2f.dr),8) + ' │');
  console.log('  ├─────────────────┼──────────┼──────────┼──────────┤');
  console.log('  │ Total           │ ' + pad(allB1W+' ('+pct(allB1W,numGames)+'%)',8) + ' │ ' + pad(allB2W+' ('+pct(allB2W,numGames)+'%)',8) + ' │ ' + pad(String(allDr),8) + ' │');
  console.log('  └─────────────────┴──────────┴──────────┴──────────┘');
  console.log('');
  console.log('  ┌─────────────────┬────────────────┬────────────────┐');
  console.log('  │                 │ ' + pad(bot1Name+' avg',14) + ' │ ' + pad(bot2Name+' avg',14) + ' │');
  console.log('  ├─────────────────┼────────────────┼────────────────┤');
  console.log('  │ ' + pad(bot1Name,7) + ' 1st     │ ' + pad((b1f.b1Sum/half).toFixed(1)+' (max '+b1f.b1Max+')',14) + ' │ ' + pad((b1f.b2Sum/half).toFixed(1)+' (max '+b1f.b2Max+')',14) + ' │');
  console.log('  │ ' + pad(bot2Name,7) + ' 1st     │ ' + pad((b2f.b1Sum/half).toFixed(1)+' (max '+b2f.b1Max+')',14) + ' │ ' + pad((b2f.b2Sum/half).toFixed(1)+' (max '+b2f.b2Max+')',14) + ' │');
  console.log('  ├─────────────────┼────────────────┼────────────────┤');
  console.log('  │ Total           │ ' + pad((allB1Sum/numGames).toFixed(1),14) + ' │ ' + pad((allB2Sum/numGames).toFixed(1),14) + ' │');
  console.log('  └─────────────────┴────────────────┴────────────────┘');
  console.log('═══════════════════════════════════════════════════════');

  // Statistical significance
  var nonDraw = allB1W + allB2W;
  if (nonDraw > 0) {
    var expected = nonDraw / 2;
    var stdDev = Math.sqrt(nonDraw * 0.25);
    var winner = allB2W > allB1W ? allB2W : allB1W;
    var winnerName = allB2W > allB1W ? bot2Name : bot1Name;
    var z = (winner - expected) / stdDev;
    var pVal = 2 * (1 - normalCDF(Math.abs(z)));
    console.log('');
    console.log('  Significance: z=' + z.toFixed(2) + ', p=' + pVal.toFixed(4) +
      (pVal < 0.01 ? ' (**p<0.01)' : pVal < 0.05 ? ' (*p<0.05)' : ' (n.s.)'));
    console.log('  ' + winnerName + ' win rate: ' + pct(winner, nonDraw) + '% (excl. draws)');
  }
}

function normalCDF(x) {
  var t = 1 / (1 + 0.2316419 * Math.abs(x));
  var d = 0.3989422804014327;
  var p = d * Math.exp(-x * x / 2) * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.8212560 + t * 1.3302744))));
  return x > 0 ? 1 - p : p;
}

} // end isMainThread
