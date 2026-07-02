/**
 * Footprint controller integration tests — trade ingestion, bar bucketing,
 * classifier composition, cumulativeDelta wiring, dispose semantics.
 */

import { describe, it, expect, vi } from 'vitest'

import { createFootprintController } from '../createFootprintController'
import type { FootprintController, FootprintConfig } from '../types'

const baseConfig: FootprintConfig = {
  tickSize: 0.01,
  barIntervalMs: 60_000, // 1m bars
  imbalanceRatio: 3,
  fallbackClassifier: 'tick-rule',
}

function makeController(patch: Partial<FootprintConfig> = {}): FootprintController {
  return createFootprintController({ ...baseConfig, ...patch })
}

describe('createFootprintController — single trade ingestion', () => {
  it('single explicit-flag trade → 1 bar, 1 cell with correct direction', () => {
    const c = makeController()
    c.ingestTrade({ timestamp: 1_000_000, price: 100.05, size: 10, isBuyerMaker: false })
    // buy aggressor → askVol increments at the quantized price
    const bars = c.bars()
    expect(bars).toHaveLength(1)
    expect(bars[0]?.cells).toHaveLength(1)
    const cell = bars[0]!.cells[0]!
    expect(cell.price).toBeCloseTo(100.05, 6)
    expect(cell.askVol).toBe(10)
    expect(cell.bidVol).toBe(0)
  })

  it('same-bar trades at same price → cells aggregate', () => {
    const c = makeController()
    c.ingestTrade({ timestamp: 1_000_000, price: 100.05, size: 10, isBuyerMaker: false })
    c.ingestTrade({ timestamp: 1_000_500, price: 100.05, size: 5, isBuyerMaker: true })
    const bars = c.bars()
    expect(bars).toHaveLength(1)
    const cell = bars[0]!.cells[0]!
    expect(cell.askVol).toBe(10) // first trade buy
    expect(cell.bidVol).toBe(5) // second trade sell
  })

  it('crossing the bar interval boundary → new bar', () => {
    const c = makeController({ barIntervalMs: 1000 })
    c.ingestTrade({ timestamp: 1_000_000, price: 100, size: 10, isBuyerMaker: false })
    c.ingestTrade({ timestamp: 1_001_000, price: 100, size: 10, isBuyerMaker: false })
    const bars = c.bars()
    expect(bars).toHaveLength(2)
  })
})

describe('createFootprintController — classifier fallback chain', () => {
  it('uses explicit flag when present, ignoring fallbackClassifier', () => {
    const c = makeController({ fallbackClassifier: 'tick-rule' })
    c.ingestTrade({ timestamp: 1_000_000, price: 100, size: 5, isBuyerMaker: true })
    // explicit says sell aggressor → bidVol += 5
    const cell = c.bars()[0]!.cells[0]!
    expect(cell.bidVol).toBe(5)
    expect(cell.askVol).toBe(0)
  })

  it('falls back to tick rule when flag is absent', () => {
    const c = makeController({ fallbackClassifier: 'tick-rule' })
    // first trade → tick rule returns unknown; controller drops it from aggregate
    c.ingestTrade({ timestamp: 1_000_000, price: 100, size: 5 })
    c.ingestTrade({ timestamp: 1_000_100, price: 101, size: 5 }) // uptick → buy
    // The first trade was unknown (dropped). The second is buy at price 101.
    const cells = c.bars()[0]!.cells
    const cellAt101 = cells.find((x) => Math.abs(x.price - 101) < 1e-6)
    expect(cellAt101?.askVol).toBe(5)
  })

  it('Lee-Ready fallback uses bid/ask when provided', () => {
    const c = makeController({ fallbackClassifier: 'lee-ready' })
    c.ingestTrade({ timestamp: 1_000_000, price: 100.6, size: 5 }, 100, 101)
    // mid = 100.5, price > mid → buy
    const cell = c.bars()[0]!.cells[0]!
    expect(cell.askVol).toBe(5)
  })
})

describe('createFootprintController — derived stats', () => {
  it('bar.delta updates as trades accumulate', () => {
    const c = makeController()
    c.ingestTrade({ timestamp: 1_000_000, price: 100, size: 10, isBuyerMaker: false })
    c.ingestTrade({ timestamp: 1_000_100, price: 100, size: 4, isBuyerMaker: true })
    const bar = c.bars()[0]!
    expect(bar.delta).toBe(6) // 10 ask - 4 bid
    expect(bar.totalVolume).toBe(14)
  })

  it('cumulativeDelta signal emits running sum across bars', () => {
    const c = makeController({ barIntervalMs: 1000 })
    c.ingestTrade({ timestamp: 1_000_000, price: 100, size: 10, isBuyerMaker: false }) // +10
    c.ingestTrade({ timestamp: 1_001_000, price: 100, size: 4, isBuyerMaker: true }) //  -4
    c.ingestTrade({ timestamp: 1_002_000, price: 100, size: 8, isBuyerMaker: false }) // +8
    expect(c.cumulativeDelta()).toEqual([10, 6, 14])
  })
})

describe('createFootprintController — config + lifecycle', () => {
  it('setConfig with new barIntervalMs invalidates existing bars', () => {
    const c = makeController({ barIntervalMs: 60_000 })
    c.ingestTrade({ timestamp: 1_000_000, price: 100, size: 5, isBuyerMaker: false })
    expect(c.bars()).toHaveLength(1)
    c.setConfig({ barIntervalMs: 1000 })
    expect(c.bars()).toHaveLength(0)
  })

  it('reset clears all bars and cumulativeDelta', () => {
    const c = makeController()
    c.ingestTrade({ timestamp: 1_000_000, price: 100, size: 5, isBuyerMaker: false })
    c.reset()
    expect(c.bars()).toEqual([])
    expect(c.cumulativeDelta()).toEqual([])
  })

  it('dispose silences subsequent mutators and signal emissions', () => {
    const c = makeController()
    const listener = vi.fn()
    c.bars.subscribe(listener)
    c.dispose()
    c.ingestTrade({ timestamp: 1_000_000, price: 100, size: 5, isBuyerMaker: false })
    expect(listener).not.toHaveBeenCalled()
    expect(c.bars()).toEqual([])
  })
})
