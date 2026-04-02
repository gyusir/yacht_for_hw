#!/usr/bin/env python3
"""
generate_dp.py — Expectimax DP Lookup Table Generator for Yacht / Yahtzee

Usage: python3 generate_dp.py [yacht|yahtzee]
Dependencies: pip install numpy numba
"""

import sys
import os
import time
import struct
import numpy as np
from itertools import combinations_with_replacement
from math import factorial
from numba import njit, prange

# ============================================================
# Section 0: Configuration
# ============================================================
GAME_MODE = sys.argv[1] if len(sys.argv) > 1 else 'yacht'
if GAME_MODE not in ('yacht', 'yahtzee'):
    print("Usage: python3 generate_dp.py [yacht|yahtzee]")
    sys.exit(1)

YACHT_CATS = [
    'ones', 'twos', 'threes', 'fours', 'fives', 'sixes',
    'choice', 'fourOfAKind', 'fullHouse',
    'smallStraight', 'largeStraight', 'yacht'
]
YAHTZEE_CATS = [
    'ones', 'twos', 'threes', 'fours', 'fives', 'sixes',
    'threeOfAKind', 'fourOfAKind', 'fullHouse',
    'smallStraight', 'largeStraight', 'yahtzee', 'chance'
]

CATEGORIES = YACHT_CATS if GAME_MODE == 'yacht' else YAHTZEE_CATS
NUM_CATS = len(CATEGORIES)
TOTAL_MASKS = 1 << NUM_CATS
MAX_UPPER = 63
YAHTZEE_CAT_IDX = 11 if GAME_MODE == 'yahtzee' else -1

# DP indexing strides
# Yacht:   dp[mask]  (mask_stride=1, upper_stride=0)
# Yahtzee: dp[mask*128 + upper*2 + yz]
if GAME_MODE == 'yahtzee':
    UPPER_STRIDE = 2
    MASK_STRIDE = (MAX_UPPER + 1) * UPPER_STRIDE  # 128
    UPPER_MAX = MAX_UPPER      # iterate 0..63
    YZ_MAX = 1                 # iterate 0..1
else:
    UPPER_STRIDE = 0
    MASK_STRIDE = 1
    UPPER_MAX = 0              # only upper=0
    YZ_MAX = 0                 # only yz=0

FACTORIALS = [1, 1, 2, 6, 24, 120]

print(f"=== Expectimax DP Generator ({GAME_MODE}, {NUM_CATS} cats) ===")
print(f"    Numba parallel enabled, cores: {os.cpu_count()}")

# ============================================================
# Section 1: Dice Enumeration (252 sorted 5-dice multisets)
# ============================================================
ALL_DICE = np.array(
    list(combinations_with_replacement(range(1, 7), 5)),
    dtype=np.int32
)
NUM_DICE = len(ALL_DICE)  # 252

def pack5(d):
    return int(d[0]) + int(d[1]) * 7 + int(d[2]) * 49 + int(d[3]) * 343 + int(d[4]) * 2401

DICE_IDX_LOOKUP = np.full(16807, -1, dtype=np.int32)
for i in range(NUM_DICE):
    DICE_IDX_LOOKUP[pack5(ALL_DICE[i])] = i

# Dice probabilities & yahtzee detection
DICE_PROBS = np.zeros(NUM_DICE, dtype=np.float64)
IS_YZ_DICE = np.zeros(NUM_DICE, dtype=np.int32)

for i in range(NUM_DICE):
    cnt = [0] * 6
    for v in ALL_DICE[i]:
        cnt[v - 1] += 1
    denom = 1
    for c in cnt:
        denom *= FACTORIALS[c]
    DICE_PROBS[i] = (120.0 / denom) / 7776.0
    if max(cnt) == 5:
        IS_YZ_DICE[i] = 1

assert abs(DICE_PROBS.sum() - 1.0) < 1e-12
print(f"  Dice multisets: {NUM_DICE}")

# ============================================================
# Section 2: Kept-Subset Enumeration (462 multisets, size 0..5)
# ============================================================
all_kept_raw = [()]
for sz in range(1, 6):
    all_kept_raw.extend(combinations_with_replacement(range(1, 7), sz))
NUM_KEPT = len(all_kept_raw)  # 462

# Padded to 5 elements for pack5 compatibility
ALL_KEPT_PAD = np.zeros((NUM_KEPT, 5), dtype=np.int32)
ALL_KEPT_SIZES = np.zeros(NUM_KEPT, dtype=np.int32)
for i, k in enumerate(all_kept_raw):
    ALL_KEPT_SIZES[i] = len(k)
    for j, v in enumerate(k):
        ALL_KEPT_PAD[i, j] = v

def pack_kept(arr):
    v = 0
    for x in arr:
        v = v * 7 + x
    return v * 10 + len(arr)

kept_to_idx = {}
for i, k in enumerate(all_kept_raw):
    kept_to_idx[pack_kept(k)] = i

print(f"  Kept multisets: {NUM_KEPT}")

# ============================================================
# Section 3: Dice -> Kept Subsets (flattened for numba)
# ============================================================
def enum_sub_multisets(counts):
    results = []
    def recurse(val, current):
        if val == 6:
            results.append(kept_to_idx[pack_kept(tuple(current))])
            return
        for k in range(counts[val] + 1):
            recurse(val + 1, current + [val + 1] * k)
    recurse(0, [])
    return results

dtk_lists = []
for di in range(NUM_DICE):
    cnt = [0] * 6
    for v in ALL_DICE[di]:
        cnt[v - 1] += 1
    dtk_lists.append(enum_sub_multisets(cnt))

# Flatten
dtk_total = sum(len(x) for x in dtk_lists)
DTK_FLAT = np.zeros(dtk_total, dtype=np.int32)
DTK_OFFSETS = np.zeros(NUM_DICE, dtype=np.int32)
DTK_LENGTHS = np.zeros(NUM_DICE, dtype=np.int32)
off = 0
for di in range(NUM_DICE):
    DTK_OFFSETS[di] = off
    DTK_LENGTHS[di] = len(dtk_lists[di])
    for j, ki in enumerate(dtk_lists[di]):
        DTK_FLAT[off + j] = ki
    off += len(dtk_lists[di])

print(f"  Dice->Kept: {dtk_total} total (avg {dtk_total / NUM_DICE:.1f}/dice)")

# ============================================================
# Section 4: Transition Table (flattened for numba)
# ============================================================
ko_m_lists = []
ko_p_lists = []

for ki in range(NUM_KEPT):
    kept = all_kept_raw[ki]
    k_size = len(kept)
    roll_count = 5 - k_size

    if roll_count == 0:
        mi = int(DICE_IDX_LOOKUP[pack5(ALL_KEPT_PAD[ki])])
        ko_m_lists.append([mi])
        ko_p_lists.append([1.0])
        continue

    total_outcomes = 6 ** roll_count
    merged_l, probs_l = [], []

    for rc in combinations_with_replacement(range(1, 7), roll_count):
        rc_cnt = [0] * 6
        for v in rc:
            rc_cnt[v - 1] += 1
        ways = FACTORIALS[roll_count]
        for c in rc_cnt:
            ways //= FACTORIALS[c]

        merged = sorted(list(kept) + list(rc))
        mi = int(DICE_IDX_LOOKUP[pack5(merged)])
        merged_l.append(mi)
        probs_l.append(ways / total_outcomes)

    ko_m_lists.append(merged_l)
    ko_p_lists.append(probs_l)

# Flatten
ko_total = sum(len(x) for x in ko_m_lists)
KO_MERGED = np.zeros(ko_total, dtype=np.int32)
KO_PROBS = np.zeros(ko_total, dtype=np.float64)
KO_OFFSETS = np.zeros(NUM_KEPT, dtype=np.int32)
KO_LENGTHS = np.zeros(NUM_KEPT, dtype=np.int32)
off = 0
for ki in range(NUM_KEPT):
    KO_OFFSETS[ki] = off
    KO_LENGTHS[ki] = len(ko_m_lists[ki])
    for j in range(len(ko_m_lists[ki])):
        KO_MERGED[off + j] = ko_m_lists[ki][j]
        KO_PROBS[off + j] = ko_p_lists[ki][j]
    off += len(ko_m_lists[ki])

max_err = max(
    abs(KO_PROBS[KO_OFFSETS[ki]:KO_OFFSETS[ki] + KO_LENGTHS[ki]].sum() - 1.0)
    for ki in range(NUM_KEPT)
)
print(f"  Transitions: {ko_total} entries (max prob err: {max_err:.2e})")

# ============================================================
# Section 5: Score Table (flat int32 array for numba)
# ============================================================
SCORE_TABLE = np.zeros(NUM_DICE * NUM_CATS, dtype=np.int32)
IS_YACHT = GAME_MODE == 'yacht'

for di in range(NUM_DICE):
    d = ALL_DICE[di]
    cnt = [0] * 6
    total = 0
    for v in d:
        cnt[v - 1] += 1
        total += int(v)
    mc = max(cnt)
    has3 = any(c == 3 for c in cnt)
    has2 = any(c == 2 for c in cnt)
    is_fh = has3 and has2

    run = longest = 0
    for v in range(6):
        if cnt[v] > 0:
            run += 1
            longest = max(longest, run)
        else:
            run = 0

    base = di * NUM_CATS
    for ci, cat in enumerate(CATEGORIES):
        s = 0
        if   cat == 'ones':    s = cnt[0]
        elif cat == 'twos':    s = cnt[1] * 2
        elif cat == 'threes':  s = cnt[2] * 3
        elif cat == 'fours':   s = cnt[3] * 4
        elif cat == 'fives':   s = cnt[4] * 5
        elif cat == 'sixes':   s = cnt[5] * 6
        elif cat in ('choice', 'chance'):
            s = total
        elif cat == 'threeOfAKind':
            s = total if mc >= 3 else 0
        elif cat == 'fourOfAKind':
            if IS_YACHT:
                if mc >= 4:
                    for v in range(6):
                        if cnt[v] >= 4:
                            s = (v + 1) * 4; break
            else:
                s = total if mc >= 4 else 0
        elif cat == 'fullHouse':
            s = (total if IS_YACHT else 25) if is_fh else 0
        elif cat == 'smallStraight':
            if IS_YACHT:
                s = 30 if list(d) == [1, 2, 3, 4, 5] else 0
            else:
                s = 30 if longest >= 4 else 0
        elif cat == 'largeStraight':
            if IS_YACHT:
                s = 30 if list(d) == [2, 3, 4, 5, 6] else 0
            else:
                s = 40 if longest >= 5 else 0
        elif cat in ('yacht', 'yahtzee'):
            s = 50 if mc == 5 else 0
        SCORE_TABLE[base + ci] = s

print(f"  Score table: {NUM_DICE} x {NUM_CATS}")

# ============================================================
# Section 6: DP Table
# ============================================================
DP_SIZE = TOTAL_MASKS * max(MASK_STRIDE, 1)
dp = np.zeros(DP_SIZE, dtype=np.float64)

# Base case: mask=0
if GAME_MODE == 'yahtzee':
    for u in range(MAX_UPPER + 1):
        bonus = 35.0 if u >= 63 else 0.0
        dp[u * UPPER_STRIDE + 0] = bonus
        dp[u * UPPER_STRIDE + 1] = bonus

print(f"  DP table: {DP_SIZE:,} entries ({DP_SIZE * 8 / 1024 / 1024:.1f} MB)")

# ============================================================
# Section 7: Masks by Popcount
# ============================================================
masks_by_pc = [[] for _ in range(NUM_CATS + 1)]
for mask in range(TOTAL_MASKS):
    masks_by_pc[bin(mask).count('1')].append(mask)
MASKS_BY_PC = [np.array(m, dtype=np.int32) for m in masks_by_pc]

# ============================================================
# Section 8: Numba JIT Core
# ============================================================

@njit(inline='always')
def bit_index(x):
    """Bit position of lowest set bit (x must be power of 2, max 13 bits)."""
    n = 0
    x >>= 1
    while x:
        n += 1
        x >>= 1
    return n


@njit(cache=True)
def compute_turn_ev(
    mask, upper, yz_flag,
    dp_arr, score_table, is_yz_dice, dice_probs,
    dtk_flat, dtk_offsets, dtk_lengths,
    ko_merged, ko_probs, ko_offsets, ko_lengths,
    num_dice, num_cats,
    mask_stride, upper_stride, max_upper, yz_cat_idx
):
    """Expected value of one turn for a given game state."""
    tm = np.empty(num_dice * 3, dtype=np.float64)

    # --- Phase 0: rollsLeft=0 (choose best category) ---
    for di in range(num_dice):
        best = -1e30
        is_yz = is_yz_dice[di]
        bonus = 100 if (yz_flag != 0 and is_yz != 0) else 0
        sb = di * num_cats

        bits = mask
        while bits != 0:
            low = bits & (-bits)
            ci = bit_index(low)
            bits &= bits - 1

            cs = score_table[sb + ci]
            tot = cs + bonus

            nm = mask ^ low
            nu = upper
            if ci < 6:
                nu = upper + cs
                if nu > max_upper:
                    nu = max_upper

            nyz = yz_flag
            if ci == yz_cat_idx and cs == 50:
                nyz = 1

            val = float(tot) + dp_arr[nm * mask_stride + nu * upper_stride + nyz]
            if val > best:
                best = val

        tm[di * 3] = best

    # --- Phase 1: rollsLeft=1 ---
    for di in range(num_dice):
        best_ev = -1e30
        d_off = dtk_offsets[di]
        d_len = dtk_lengths[di]
        for si in range(d_len):
            ki = dtk_flat[d_off + si]
            k_off = ko_offsets[ki]
            k_len = ko_lengths[ki]
            ev = 0.0
            for oi in range(k_len):
                ev += ko_probs[k_off + oi] * tm[ko_merged[k_off + oi] * 3]
            if ev > best_ev:
                best_ev = ev
        tm[di * 3 + 1] = best_ev

    # --- Phase 2: rollsLeft=2 ---
    for di in range(num_dice):
        best_ev = -1e30
        d_off = dtk_offsets[di]
        d_len = dtk_lengths[di]
        for si in range(d_len):
            ki = dtk_flat[d_off + si]
            k_off = ko_offsets[ki]
            k_len = ko_lengths[ki]
            ev = 0.0
            for oi in range(k_len):
                ev += ko_probs[k_off + oi] * tm[ko_merged[k_off + oi] * 3 + 1]
            if ev > best_ev:
                best_ev = ev
        tm[di * 3 + 2] = best_ev

    # --- Weighted average over initial roll ---
    total_ev = 0.0
    for di in range(num_dice):
        total_ev += dice_probs[di] * tm[di * 3 + 2]
    return total_ev


@njit(parallel=True, cache=True)
def compute_level(
    masks, upper_max, yz_max,
    dp_arr, score_table, is_yz_dice, dice_probs,
    dtk_flat, dtk_offsets, dtk_lengths,
    ko_merged, ko_probs, ko_offsets, ko_lengths,
    num_dice, num_cats,
    mask_stride, upper_stride, max_upper, yz_cat_idx
):
    """Process all masks at a popcount level in parallel (numba threading)."""
    n = len(masks)
    for mi in prange(n):
        mask = masks[mi]
        for upper in range(upper_max + 1):
            for yz in range(yz_max + 1):
                ev = compute_turn_ev(
                    mask, upper, yz,
                    dp_arr, score_table, is_yz_dice, dice_probs,
                    dtk_flat, dtk_offsets, dtk_lengths,
                    ko_merged, ko_probs, ko_offsets, ko_lengths,
                    num_dice, num_cats,
                    mask_stride, upper_stride, max_upper, yz_cat_idx
                )
                dp_arr[mask * mask_stride + upper * upper_stride + yz] = ev


# ============================================================
# Section 9: Main Loop (backward induction)
# ============================================================
print("\nStarting backward induction...")
print("  (First call includes numba JIT compilation, ~5-10s)")
start = time.time()

# Convert constants to int32 for numba
_nd   = np.int32(NUM_DICE)
_nc   = np.int32(NUM_CATS)
_ms   = np.int32(MASK_STRIDE)
_us   = np.int32(UPPER_STRIDE)
_mu   = np.int32(MAX_UPPER)
_yci  = np.int32(YAHTZEE_CAT_IDX)
_umax = np.int32(UPPER_MAX)
_ymax = np.int32(YZ_MAX)

for turns_left in range(1, NUM_CATS + 1):
    masks = MASKS_BY_PC[turns_left]
    t0 = time.time()

    compute_level(
        masks, _umax, _ymax,
        dp, SCORE_TABLE, IS_YZ_DICE, DICE_PROBS,
        DTK_FLAT, DTK_OFFSETS, DTK_LENGTHS,
        KO_MERGED, KO_PROBS, KO_OFFSETS, KO_LENGTHS,
        _nd, _nc, _ms, _us, _mu, _yci
    )

    dt = time.time() - t0
    total = time.time() - start

    ev_str = ''
    if turns_left == NUM_CATS:
        full_ev = dp[(TOTAL_MASKS - 1) * MASK_STRIDE]
        ev_str = f'  |  Full-game EV: {full_ev:.2f}'

    print(f"  Turn {turns_left:2d}/{NUM_CATS}: {len(masks):>5d} masks  {dt:6.1f}s  (total {total:7.1f}s){ev_str}")

total_time = time.time() - start
print(f"\nDP complete in {total_time:.1f}s")

# ============================================================
# Section 10: Verification & Output
# ============================================================
full_mask = TOTAL_MASKS - 1
full_ev = dp[full_mask * MASK_STRIDE]

print(f"\n=== Results ===")
print(f"Mode: {GAME_MODE}")
print(f"Full-game optimal EV: {full_ev:.4f}")
print(f"Dice prob sum: {DICE_PROBS.sum():.10f}")

output_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')
os.makedirs(output_dir, exist_ok=True)
output_file = os.path.join(output_dir, f'dp_{GAME_MODE}.bin')

# Quantize to Uint16: [maxValue: Float32LE (4 bytes)] [dp: Uint16LE × N]
if GAME_MODE == 'yacht':
    dp_flat = np.array([float(dp[m]) for m in range(TOTAL_MASKS)], dtype=np.float64)
else:
    dp_flat = dp

max_val = float(dp_flat.max())
quantized = np.round(dp_flat / max_val * 65535).astype(np.uint16)

with open(output_file, 'wb') as f:
    f.write(struct.pack('<f', max_val))
    f.write(quantized.tobytes())

fsize = os.path.getsize(output_file)
unit = 'KB' if fsize < 1024 * 1024 else 'MB'
size_val = fsize / 1024 if unit == 'KB' else fsize / 1024 / 1024
print(f"Saved: {output_file} ({size_val:.0f} {unit})")
print("Done.")
