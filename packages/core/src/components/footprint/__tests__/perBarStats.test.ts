/**
 * Per-bar statistics tests — delta / cumulativeDelta / diagonal imbalance.
 */

import { describe, it, expect } from 'vitest'

import {
  computeDelta,
  computeCumulativeDelta,
  computeDiagonalImbalances,
  type FootprintBarCell,
} from '../perBarStats'

const cell = (price: number, askVol: number, bidVol: number): FootprintBarCell => ({
  price,
  askVol,
  bidVol,
})

describe('computeDelta', () => {
  it('pure buy bar → positive delta equals total ask volume', () => {
    const cells = [cell(100, 50, 0), cell(101, 30, 0)]
    expect(computeDelta(cells)).toBe(80)
  })

  it('pure sell bar → negative delta', () => {
    const cells = [cell(100, 0, 50), cell(101, 0, 30)]
    expect(computeDelta(cells)).toBe(-80)
  })

  it('balanced bar → 0', () => {
    const cells = [cell(100, 25, 25), cell(101, 25, 25)]
    expect(computeDelta(cells)).toBe(0)
  })

  it('empty cells → 0', () => {
    expect(computeDelta([])).toBe(0)
  })
})

describe('computeCumulativeDelta', () => {
  it('all positive deltas → strictly monotonic increasing', () => {
    expect(computeCumulativeDelta([10, 20, 30])).toEqual([10, 30, 60])
  })

  it('mixed signs → correct running sum', () => {
    expect(computeCumulativeDelta([10, -5, 8, -3])).toEqual([10, 5, 13, 10])
  })

  it('empty input → []', () => {
    expect(computeCumulativeDelta([])).toEqual([])
  })

  it('single delta → [delta]', () => {
    expect(computeCumulativeDelta([42])).toEqual([42])
  })
})

describe('computeDiagonalImbalances', () => {
  it('buy imbalance detected when ask[i] >= 3 * bid[i-1] and bid[i-1] > 0', () => {
    // cells sorted ascending: i=0 at price 100, i=1 at price 101
    // ask[1]=30, bid[0]=10 → ratio 3, triggers
    const cells = [cell(100, 5, 10), cell(101, 30, 5)]
    const imb = computeDiagonalImbalances(cells, 3)
    const buy = imb.find((x) => x.direction === 'buy-imbalance')
    expect(buy).toBeDefined()
    expect(buy?.priceIndex).toBe(1)
    expect(buy?.ratio).toBeCloseTo(3, 6)
  })

  it('NOT triggered at ratio 2.9x', () => {
    const cells = [cell(100, 5, 10), cell(101, 29, 5)]
    const imb = computeDiagonalImbalances(cells, 3)
    expect(imb.find((x) => x.direction === 'buy-imbalance')).toBeUndefined()
  })

  it('sell imbalance detected when bid[i] >= 3 * ask[i+1] and ask[i+1] > 0', () => {
    const cells = [cell(100, 5, 30), cell(101, 10, 5)]
    // bid[0]=30, ask[1]=10 → ratio 3, sell imbalance at i=0
    const imb = computeDiagonalImbalances(cells, 3)
    const sell = imb.find((x) => x.direction === 'sell-imbalance')
    expect(sell).toBeDefined()
    expect(sell?.priceIndex).toBe(0)
    expect(sell?.ratio).toBeCloseTo(3, 6)
  })

  it('handles boundary cells without crashing (no neighbour above for last, below for first)', () => {
    const cells = [cell(100, 10, 10)]
    expect(() => computeDiagonalImbalances(cells, 3)).not.toThrow()
    expect(computeDiagonalImbalances(cells, 3)).toEqual([])
  })

  it('cell with zero bid/ask does not trigger imbalance (divide-by-zero guard)', () => {
    const cells = [cell(100, 0, 0), cell(101, 100, 0)]
    // bid[0]=0 means we can't compute ask[1]/bid[0] → no buy imbalance
    const imb = computeDiagonalImbalances(cells, 3)
    expect(imb.find((x) => x.direction === 'buy-imbalance')).toBeUndefined()
  })

  it('multiple imbalances in one bar are all reported', () => {
    const cells = [
      cell(100, 5, 10),
      cell(101, 100, 5), // buy imb at 1 (100 / 10 = 10x)
      cell(102, 5, 100), // sell imb at 2 (next ask=10? need cell 3); test:
      cell(103, 10, 5), // sell imb at 2: bid[2]=100, ask[3]=10 → 10x
    ]
    const imb = computeDiagonalImbalances(cells, 3)
    expect(imb.some((x) => x.direction === 'buy-imbalance' && x.priceIndex === 1)).toBe(true)
    expect(imb.some((x) => x.direction === 'sell-imbalance' && x.priceIndex === 2)).toBe(true)
  })

  it('empty cells → empty imbalances', () => {
    expect(computeDiagonalImbalances([], 3)).toEqual([])
  })
})
