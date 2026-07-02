/**
 * alignToBaseIndex tests — forward fill + strict no-lookahead.
 *
 * The lookahead test is the load-bearing one: a naive implementation that
 * uses `floor(t / targetIntervalMs) * targetIntervalMs` to pick the bar
 * would expose future state. This file pins that out.
 */

import { describe, it, expect } from 'vitest'

import { alignToBaseIndex } from '../alignToBaseIndex'

const HOUR = 60 * 60_000
const MIN_5 = 5 * 60_000

const ts = (ms: number): { timestamp: number } => ({ timestamp: ms })

describe('alignToBaseIndex — basic behavior', () => {
  it('empty base bars → []', () => {
    expect(alignToBaseIndex([], [ts(0)], [42], HOUR)).toEqual([])
  })

  it('empty higher-tf series → all nulls', () => {
    const base = [ts(0), ts(MIN_5), ts(2 * MIN_5)]
    expect(alignToBaseIndex(base, [], [], HOUR)).toEqual([null, null, null])
  })

  it('throws if higherTfBars and higherTfValues length differ', () => {
    expect(() => alignToBaseIndex([ts(0)], [ts(0)], [1, 2], HOUR)).toThrow(/length/)
  })

  it('throws on non-positive targetIntervalMs', () => {
    expect(() => alignToBaseIndex([ts(0)], [ts(0)], [1], 0)).toThrow(/positive/)
  })
})

describe('alignToBaseIndex — no-lookahead (critical)', () => {
  it('base bar at hbar.timestamp reads that hbar value', () => {
    const hbars = [ts(HOUR)] // hbar opens at 09:00 in arbitrary epoch terms
    const values = [100]
    const base = [ts(HOUR)]
    expect(alignToBaseIndex(base, hbars, values, HOUR)).toEqual([100])
  })

  it('base bar 1ms BEFORE hbar.timestamp gets null (no lookahead)', () => {
    const hbars = [ts(HOUR)]
    const values = [100]
    const base = [ts(HOUR - 1)]
    expect(alignToBaseIndex(base, hbars, values, HOUR)).toEqual([null])
  })

  it('base bar deep inside hbar interval reads that hbar value', () => {
    const hbars = [ts(HOUR)]
    const values = [100]
    const base = [ts(HOUR + 30 * 60_000)] // 30 min into the hour
    expect(alignToBaseIndex(base, hbars, values, HOUR)).toEqual([100])
  })

  it('base bar at hbar.timestamp + targetIntervalMs (next bucket open) reads NEXT hbar', () => {
    const hbars = [ts(HOUR), ts(2 * HOUR)]
    const values = [100, 200]
    const base = [ts(2 * HOUR)]
    expect(alignToBaseIndex(base, hbars, values, HOUR)).toEqual([200])
  })
})

describe('alignToBaseIndex — forward fill across many base bars', () => {
  it('a 1h hbar covers all 12 of the 5m base bars inside it', () => {
    const hbars = [ts(HOUR)]
    const values = ['hot']
    const base: { timestamp: number }[] = []
    for (let i = 0; i < 12; i++) base.push(ts(HOUR + i * MIN_5))
    const out = alignToBaseIndex(base, hbars, values, HOUR)
    expect(out).toEqual(new Array(12).fill('hot'))
  })

  it('multiple hbars switch correctly at boundaries', () => {
    const hbars = [ts(HOUR), ts(2 * HOUR), ts(3 * HOUR)]
    const values = ['a', 'b', 'c']
    const base = [
      ts(HOUR),
      ts(HOUR + 30 * 60_000),
      ts(2 * HOUR),
      ts(2 * HOUR + 30 * 60_000),
      ts(3 * HOUR),
    ]
    expect(alignToBaseIndex(base, hbars, values, HOUR)).toEqual(['a', 'a', 'b', 'b', 'c'])
  })

  it('gap in hbars — base bars in the gap forward-fill the prior hbar', () => {
    // hbar1 at 09:00, hbar2 at 11:00. base bar at 10:30 → forward-fill 'a'.
    const hbars = [ts(HOUR), ts(3 * HOUR)]
    const values = ['a', 'b']
    const base = [ts(2 * HOUR + 30 * 60_000)]
    expect(alignToBaseIndex(base, hbars, values, HOUR)).toEqual(['a'])
  })

  it('leading base bars before first hbar are all null', () => {
    const hbars = [ts(HOUR)]
    const values = ['x']
    const base = [ts(0), ts(MIN_5), ts(HOUR)]
    expect(alignToBaseIndex(base, hbars, values, HOUR)).toEqual([null, null, 'x'])
  })
})
