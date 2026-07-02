/**
 * Tests for `computeValueArea` — greedy expansion around POC.
 *
 * Algorithm summary (see `valueArea.ts` header for full rationale):
 *   - Seed the VA with the POC bucket.
 *   - Each step compares `buckets[vahIdx+1]` vs `buckets[valIdx-1]` and
 *     annexes the larger side.
 *   - Ties → "expand toward POC" rule: pick the side whose CURRENT boundary
 *     is closer to POC. Equidistant ties → upper side wins.
 *   - Edge POC, boundary exhaustion, zero-volume, percent clamping all
 *     covered by dedicated tests below.
 */

import { describe, it, expect } from 'vitest'

import { findPOCIndex } from '../poc'
import { computeValueArea } from '../valueArea'

function f(arr: number[]): Float64Array {
  return Float64Array.from(arr)
}

describe('computeValueArea — symmetric / skewed distributions', () => {
  it('centres the VA around the middle bucket on a symmetric distribution at target=0.70', () => {
    // Buckets: [5,10,20,30,40,30,20,10,5], n=9, total=170, POC=4.
    // Target = 119. Trace:
    //   start  vaVol=40 (POC)
    //   step1  up=30, down=30 tie, equidist → goUp  → vahIdx=5, vaVol=70
    //   step2  up=20, down=30 → down wins             → valIdx=3, vaVol=100
    //   step3  up=20, down=20 tie, equidist (distUp=1,distDown=1) → goUp
    //                                                  → vahIdx=6, vaVol=120
    //   120 >= 119 → stop.
    const buckets = f([5, 10, 20, 30, 40, 30, 20, 10, 5])
    const poc = findPOCIndex(buckets) // 4
    const res = computeValueArea(buckets, poc, 0.7)
    expect(res.pocIndex).toBe(4)
    expect(res.valIndex).toBe(3)
    expect(res.vahIndex).toBe(6)
    expect(res.totalVolume).toBe(170)
    expect(res.vaVolume).toBe(120)
    expect(res.vaPercent).toBeCloseTo(120 / 170, 9)
  })

  it('captures the heavy right tail on a right-skewed distribution; tie pulls back toward POC', () => {
    // [1,1,1,2,3,5,10,40,20,10], n=10, total=92, POC=7 (value 40).
    // Target = 64.4. Trace:
    //   vaVol=40                                    (valIdx=7, vahIdx=7)
    //   step1 up=buckets[8]=20, down=buckets[6]=10 → up wins  → vahIdx=8, vaVol=60
    //   step2 up=buckets[9]=10, down=buckets[6]=10 → TIE.
    //         distUp = vahIdx - poc = 1; distDown = poc - valIdx = 0.
    //         distDown < distUp → extend the side closer to POC (down).
    //                                                → valIdx=6, vaVol=70
    //   70 >= 64.4 → stop.
    // VA = [6, 8]. The heavy right tail is captured in step 1 (the dominant
    // upper neighbor); the subsequent tie rebalances toward POC per the
    // CME-traditional "expand toward POC" tie-break — see valueArea.ts header.
    const buckets = f([1, 1, 1, 2, 3, 5, 10, 40, 20, 10])
    const poc = findPOCIndex(buckets) // 7
    const res = computeValueArea(buckets, poc, 0.7)
    expect(res.pocIndex).toBe(7)
    expect(res.valIndex).toBe(6)
    expect(res.vahIndex).toBe(8)
    expect(res.vaVolume).toBe(70)
  })
})

describe('computeValueArea — edge POC (only one expansion direction)', () => {
  it('expands only upward when POC is at index 0', () => {
    // POC at the bottom — `canDown` is always false; expansion is forced up.
    // Buckets: [100, 50, 25, 10, 5], total=190, target=133.
    // Start vaVol=100; canDown=false branch picks vahIdx=1 → vaVol=150 >= 133.
    const buckets = f([100, 50, 25, 10, 5])
    const res = computeValueArea(buckets, 0, 0.7)
    expect(res.pocIndex).toBe(0)
    expect(res.valIndex).toBe(0)
    expect(res.vahIndex).toBe(1)
    expect(res.vaVolume).toBe(150)
  })

  it('expands only downward when POC is at index N-1', () => {
    // POC at the top — `canUp` is always false.
    // Buckets: [5, 10, 25, 50, 100], total=190, target=133.
    // Start vaVol=100; canUp=false branch picks valIdx=3 → vaVol=150 >= 133.
    const buckets = f([5, 10, 25, 50, 100])
    const res = computeValueArea(buckets, 4, 0.7)
    expect(res.pocIndex).toBe(4)
    expect(res.vahIndex).toBe(4) // N-1
    expect(res.valIndex).toBe(3)
    expect(res.vaVolume).toBe(150)
  })
})

describe('computeValueArea — tie-breaker behaviour (CME-traditional)', () => {
  it('on an upper==lower tie with asymmetric distances, extends the side whose current boundary is closer to POC', () => {
    // Construct a state where after two forced upward steps a tie occurs
    // with distDown < distUp:
    //
    // Buckets: [5,5,5,5,30,10,8,5,5], n=9, POC=4, total=78, target=0.7*78=54.6
    //
    //   start  vaVol=30  (valIdx=4, vahIdx=4)
    //   step1  up=10, down=5 → up wins → vahIdx=5, vaVol=40
    //   step2  up=buckets[6]=8, down=buckets[3]=5 → up wins → vahIdx=6, vaVol=48
    //          (now distUp=2, distDown=0)
    //   step3  up=buckets[7]=5, down=buckets[3]=5 → TIE.
    //          distUp=2, distDown=0  → distDown < distUp → goDown
    //                                  (closer-to-POC boundary extends away from POC)
    //          → valIdx=3, vaVol=53
    //   step4  up=buckets[7]=5, down=buckets[2]=5 → TIE.
    //          distUp=2, distDown=1  → distDown<distUp → goDown
    //          → valIdx=2, vaVol=58 >= 54.6 ✓
    //
    // Final: valIdx=2, vahIdx=6.
    const buckets = f([5, 5, 5, 5, 30, 10, 8, 5, 5])
    const res = computeValueArea(buckets, 4, 0.7)
    expect(res.pocIndex).toBe(4)
    // The tie was resolved by extending the boundary CLOSER to POC —
    // i.e. the down side, which had distance 0 vs the up side's distance 2.
    // This is the implementation's interpretation of "toward POC".
    expect(res.valIndex).toBe(2)
    expect(res.vahIndex).toBe(6)
    expect(res.vaVolume).toBe(58)
  })

  it('on an equidistant tie, prefers the upper side (documented rule B)', () => {
    // Buckets: [2,5,5,10,5,5,2], n=7, POC=3, total=34, target=23.8.
    //   start  vaVol=10
    //   step1  up=5, down=5 tie, distUp=0, distDown=0 → goUp → vahIdx=4, vaVol=15
    //   step2  up=5, down=5 tie, distUp=1, distDown=1 → goUp → vahIdx=5, vaVol=20
    //   step3  up=2, down=5 → down wins → valIdx=2, vaVol=25 >= 23.8 ✓
    const buckets = f([2, 5, 5, 10, 5, 5, 2])
    const res = computeValueArea(buckets, 3, 0.7)
    expect(res.pocIndex).toBe(3)
    expect(res.vahIndex).toBe(5)
    expect(res.valIndex).toBe(2)
    expect(res.vaVolume).toBe(25)
  })
})

describe('computeValueArea — percent clamping & target sweeps', () => {
  it('sweeps the entire non-zero range at target=1.0', () => {
    // Buckets: [5,10,5], n=3, POC=1, total=20, target=20.
    //   vaVol=10; up=5,down=5 tie equidist → goUp → vahIdx=2, vaVol=15
    //   canUp=false, canDown=true → goDown → valIdx=0, vaVol=20 ✓
    const buckets = f([5, 10, 5])
    const res = computeValueArea(buckets, 1, 1.0)
    expect(res.valIndex).toBe(0)
    expect(res.vahIndex).toBe(2)
    expect(res.vaVolume).toBe(20)
    expect(res.vaPercent).toBeCloseTo(1, 9)
  })

  it('produces a narrower VA at target=0.5 than at target=0.7 (monotonicity)', () => {
    const buckets = f([5, 10, 20, 30, 40, 30, 20, 10, 5])
    const poc = findPOCIndex(buckets) // 4
    const half = computeValueArea(buckets, poc, 0.5)
    const seventy = computeValueArea(buckets, poc, 0.7)
    const halfWidth = half.vahIndex - half.valIndex
    const seventyWidth = seventy.vahIndex - seventy.valIndex
    expect(halfWidth).toBeLessThanOrEqual(seventyWidth)
    // 50% target is 85; 40 + 30 + 30 = 100 reaches it well before 70%
    // does so the difference must be strictly visible.
    expect(halfWidth).toBeLessThan(seventyWidth)
    expect(half.vaPercent).toBeLessThanOrEqual(seventy.vaPercent)
  })

  it('returns the degenerate result for an all-zero histogram', () => {
    // Documented zero-volume behaviour: VA collapses to POC, percent 0.
    const buckets = f([0, 0, 0, 0, 0])
    const res = computeValueArea(buckets, 2, 0.7)
    expect(res.vahIndex).toBe(2)
    expect(res.valIndex).toBe(2)
    expect(res.pocIndex).toBe(2)
    expect(res.totalVolume).toBe(0)
    expect(res.vaVolume).toBe(0)
    expect(res.vaPercent).toBe(0)
  })
})
