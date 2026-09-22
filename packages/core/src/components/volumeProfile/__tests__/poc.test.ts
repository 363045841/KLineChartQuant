/**
 * Tests for `findPOCIndex` — argmax over the bucket histogram with a
 * deterministic lowest-index tie-breaker.
 *
 * Implementation behaviour (see `poc.ts` header for rationale):
 *   - Strictly-greater wins → earlier index is preserved on ties.
 *   - Empty array returns `-1`.
 *   - All zeros returns `0` (first bucket "wins" because no strictly-greater
 *     value is ever found).
 */

import { describe, expect, it } from 'vitest'

import { findPOCIndex } from '../impl/poc'

function f(arr: number[]): Float64Array {
  return Float64Array.from(arr)
}

describe('findPOCIndex', () => {
  it('returns the index of the largest bucket (plain argmax)', () => {
    // Buckets [10, 50, 30, 20] → max=50 at index 1.
    expect(findPOCIndex(f([10, 50, 30, 20]))).toBe(1)
  })

  it('resolves ties to the lowest index', () => {
    // All equal → first index wins because comparator is strict `>`.
    expect(findPOCIndex(f([40, 40, 40]))).toBe(0)
    // Tie between index 2 and 5; the lower (2) wins.
    expect(findPOCIndex(f([1, 2, 99, 3, 4, 99, 5]))).toBe(2)
  })

  it('returns 0 for an all-zero histogram (documented edge case)', () => {
    // bestVol starts at buckets[0] = 0; no later value is strictly greater,
    // so the index sticks at 0. The controller treats this state via the
    // Value-Area total-volume zero branch, not by inspecting the POC.
    expect(findPOCIndex(f([0, 0, 0, 0, 0]))).toBe(0)
  })

  it('returns -1 for an empty array', () => {
    // Sanity for the explicit guard at the top of `findPOCIndex`.
    expect(findPOCIndex(new Float64Array(0))).toBe(-1)
  })
})
