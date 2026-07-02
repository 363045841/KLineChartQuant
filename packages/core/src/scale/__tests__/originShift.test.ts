import { describe, it, expect } from 'vitest'

import { createOriginShiftPolicy } from '../originShift'

describe('createOriginShiftPolicy', () => {
  it('starts with ref equal to initialRef', () => {
    const p = createOriginShiftPolicy(67000)
    expect(p.ref).toBe(67000)
  })

  it('shift(value) returns value - ref', () => {
    const p = createOriginShiftPolicy(67000)
    expect(p.shift(67000.5)).toBeCloseTo(0.5, 10)
    expect(p.shift(66999.25)).toBeCloseTo(-0.75, 10)
  })

  it('below threshold → no rebase (uses required 0.005 normalized drift, threshold default 0.01)', () => {
    // Visible range 100, mid drifts to 100.5 → drift = 0.5, normalized 0.005 (= 0.5 / 100).
    // Default threshold 0.01 → 0.005 is BELOW → no rebase.
    const p = createOriginShiftPolicy(100)
    const changed = p.maybeRebaseline(100.5, 100)
    expect(changed).toBe(false)
    expect(p.ref).toBe(100)
  })

  it('above threshold → rebase to new mid (uses required 0.02 normalized drift)', () => {
    // Visible range 100, mid drifts to 102 → drift 2, normalized 0.02 (= 2 / 100).
    // 0.02 > 0.01 → REBASE.
    const p = createOriginShiftPolicy(100)
    const changed = p.maybeRebaseline(102, 100)
    expect(changed).toBe(true)
    expect(p.ref).toBe(102)
  })

  it('threshold === 0 → always rebases when there is any drift', () => {
    const p = createOriginShiftPolicy(50, 0)
    // Any drift at all triggers the rebase.
    expect(p.maybeRebaseline(50.0001, 100)).toBe(true)
    expect(p.ref).toBe(50.0001)
    // ...but a zero-drift call still doesn't rebase (division yields 0, which
    // is not > 0).
    expect(p.maybeRebaseline(50.0001, 100)).toBe(false)
  })

  it('threshold === 1 → never rebases for any in-range drift', () => {
    const p = createOriginShiftPolicy(50, 1)
    // Even a near-full-range drift can't exceed 1.
    expect(p.maybeRebaseline(149, 100)).toBe(false)
    expect(p.ref).toBe(50)
  })

  it('multiple maybeRebaseline calls produce monotonic ref tracking the drift', () => {
    const p = createOriginShiftPolicy(0, 0.01)
    const history: number[] = []

    // Walk the mid forward in 0.02 * range steps; each step crosses the threshold.
    let mid = 0
    const range = 100
    for (let i = 0; i < 10; i++) {
      mid += 0.02 * range // +2 per step → 0.02 normalized → above threshold
      if (p.maybeRebaseline(mid, range)) history.push(p.ref)
    }

    expect(history.length).toBe(10)
    // All recorded refs must be strictly increasing.
    for (let i = 1; i < history.length; i++) {
      expect(history[i]).toBeGreaterThan(history[i - 1])
    }
  })

  it('degenerate range (currentRange <= 0) refuses to rebase', () => {
    const p = createOriginShiftPolicy(50)
    expect(p.maybeRebaseline(60, 0)).toBe(false)
    expect(p.maybeRebaseline(60, -10)).toBe(false)
    expect(p.ref).toBe(50)
  })

  it('non-finite inputs do not corrupt ref', () => {
    const p = createOriginShiftPolicy(50)
    expect(p.maybeRebaseline(Number.NaN, 100)).toBe(false)
    expect(p.maybeRebaseline(60, Number.POSITIVE_INFINITY)).toBe(false)
    expect(p.ref).toBe(50)
  })

  it('rejects non-finite initialRef and negative threshold', () => {
    expect(() => createOriginShiftPolicy(Number.NaN)).toThrow(/finite/)
    expect(() => createOriginShiftPolicy(0, -0.1)).toThrow(/threshold/)
  })

  it('exactly at threshold → does NOT rebase (strict `>`)', () => {
    // Important contract: the comparison is `>`, not `>=`. A drift of
    // exactly 1% of range should sit on the fence and not trigger.
    const p = createOriginShiftPolicy(100, 0.01)
    const changed = p.maybeRebaseline(101, 100) // normalized 0.01 === threshold
    expect(changed).toBe(false)
    expect(p.ref).toBe(100)
  })
})
