/**
 * Tests for `binBarToBuckets` — bar → bucket volume distribution.
 *
 * Modes covered:
 *   - `typical-price`: drop entire bar volume into the bucket holding
 *     `(high+low+close)/3`; silently skip if the typical price falls outside
 *     `[binMin, binMin + binCount*binSize)`.
 *   - `proportional`: split the bar's volume across every bucket that
 *     overlaps `[low, high]`, weighted by per-bucket overlap.
 *
 * All assertions are anchored to the actual implementation in
 * `binning.ts`; if the algorithm diverges from the brief, the test reflects
 * the implementation (not the brief).
 */

import { describe, expect, it } from 'vitest'

import { binBarToBuckets } from '../impl/binning'
import type { VolumeProfileBar } from '../types'

function makeBuckets(n: number): Float64Array {
  return new Float64Array(n)
}

describe('binBarToBuckets — typical-price mode', () => {
  it('drops the entire bar volume into the bucket containing the typical price', () => {
    // high=100, low=90, close=95 → typical = (100+90+95)/3 = 95
    const bar: VolumeProfileBar = { high: 100, low: 90, close: 95, volume: 1000 }
    // Bucket grid: binMin=90, binSize=1, binCount=10 → buckets cover [90, 100).
    // Typical price 95 → idx = floor((95-90)/1) = 5 → buckets[5].
    const buckets = makeBuckets(10)
    binBarToBuckets(bar, buckets, 90, 1, 10, 'typical-price')
    expect(buckets[5]).toBe(1000)
    // No other buckets touched.
    for (let i = 0; i < 10; i++) {
      if (i !== 5) expect(buckets[i]).toBe(0)
    }
  })

  it('silently drops a bar whose typical price is below binMin', () => {
    // bar fully below the grid: high/low/close all < binMin → typical < binMin.
    const bar: VolumeProfileBar = { high: 10, low: 5, close: 7, volume: 500 }
    const buckets = makeBuckets(10)
    // Grid covers [100, 110).
    binBarToBuckets(bar, buckets, 100, 1, 10, 'typical-price')
    // Nothing should have been written.
    for (let i = 0; i < 10; i++) expect(buckets[i]).toBe(0)
  })

  it('silently drops a bar whose typical price is at/above binMin + binCount*binSize', () => {
    // bar fully above the grid: typical >> binMin + binCount*binSize.
    const bar: VolumeProfileBar = { high: 1000, low: 500, close: 700, volume: 999 }
    const buckets = makeBuckets(10)
    // Grid covers [0, 10).
    binBarToBuckets(bar, buckets, 0, 1, 10, 'typical-price')
    for (let i = 0; i < 10; i++) expect(buckets[i]).toBe(0)
  })
})

describe('binBarToBuckets — proportional mode', () => {
  it('splits a bar covering exactly 2 buckets 500/500 on equal overlap', () => {
    // Grid: binMin=0, binSize=1, binCount=10 → buckets [0,1), [1,2), ...
    // Bar spans [3.0, 5.0) — exactly buckets 3 and 4, each contributing
    // half the range. volume=1000 → 500 / 500.
    const bar: VolumeProfileBar = { high: 5, low: 3, close: 4, volume: 1000 }
    const buckets = makeBuckets(10)
    binBarToBuckets(bar, buckets, 0, 1, 10, 'proportional')
    expect(buckets[3]).toBeCloseTo(500, 9)
    expect(buckets[4]).toBeCloseTo(500, 9)
    // Everything else zero.
    for (let i = 0; i < 10; i++) {
      if (i !== 3 && i !== 4) expect(buckets[i]).toBe(0)
    }
  })

  it('puts all volume into a single bucket when the bar exactly spans one bucket', () => {
    // Bar [4.0, 5.0) exactly equals bucket 4 → all volume there.
    const bar: VolumeProfileBar = { high: 5, low: 4, close: 4.5, volume: 750 }
    const buckets = makeBuckets(10)
    binBarToBuckets(bar, buckets, 0, 1, 10, 'proportional')
    // Implementation note: `hi = 5`, ceil((5-0)/1) - 1 = 4 → lastIdx = 4.
    // firstIdx = floor((4-0)/1) = 4. So only bucket 4 gets volume.
    expect(buckets[4]).toBeCloseTo(750, 9)
    for (let i = 0; i < 10; i++) {
      if (i !== 4) expect(buckets[i]).toBe(0)
    }
  })

  it('splits across 3 buckets proportional to per-bucket overlap', () => {
    // Bar [2.5, 5.5), grid binSize=1: overlaps with buckets 2, 3, 4, 5.
    //   bucket 2 [2, 3): overlap [2.5, 3.0)   = 0.5
    //   bucket 3 [3, 4): overlap [3.0, 4.0)   = 1.0
    //   bucket 4 [4, 5): overlap [4.0, 5.0)   = 1.0
    //   bucket 5 [5, 6): overlap [5.0, 5.5)   = 0.5
    // Total overlap span = 3.0; barHigh - barLow = 3.0; volPerUnit = 900/3 = 300.
    // Distribution: 150 / 300 / 300 / 150.
    const bar: VolumeProfileBar = { high: 5.5, low: 2.5, close: 4, volume: 900 }
    const buckets = makeBuckets(10)
    binBarToBuckets(bar, buckets, 0, 1, 10, 'proportional')
    expect(buckets[2]).toBeCloseTo(150, 9)
    expect(buckets[3]).toBeCloseTo(300, 9)
    expect(buckets[4]).toBeCloseTo(300, 9)
    expect(buckets[5]).toBeCloseTo(150, 9)
    // Sum equals the bar volume (conservation).
    const sum = buckets.reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(900, 9)
  })

  it('drops a bar fully outside the configured price range (both sides)', () => {
    // Below the grid: binMin=100, binCount=10, binSize=1 → grid [100, 110).
    const below: VolumeProfileBar = { high: 50, low: 40, close: 45, volume: 500 }
    const b1 = makeBuckets(10)
    binBarToBuckets(below, b1, 100, 1, 10, 'proportional')
    expect(b1.reduce((a, b) => a + b, 0)).toBe(0)

    // Above the grid.
    const above: VolumeProfileBar = { high: 500, low: 400, close: 450, volume: 500 }
    const b2 = makeBuckets(10)
    binBarToBuckets(above, b2, 100, 1, 10, 'proportional')
    expect(b2.reduce((a, b) => a + b, 0)).toBe(0)
  })

  it('treats a zero-range bar (high === low) like typical-price (lands in one bucket)', () => {
    // Doji: high == low == close = 4.5 → falls in bucket 4.
    const bar: VolumeProfileBar = { high: 4.5, low: 4.5, close: 4.5, volume: 800 }
    const buckets = makeBuckets(10)
    binBarToBuckets(bar, buckets, 0, 1, 10, 'proportional')
    expect(buckets[4]).toBe(800)
    for (let i = 0; i < 10; i++) {
      if (i !== 4) expect(buckets[i]).toBe(0)
    }
  })
})
