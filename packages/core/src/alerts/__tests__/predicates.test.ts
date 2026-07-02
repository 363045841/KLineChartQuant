import { describe, it, expect } from 'vitest'

import { evaluatePredicate } from '../predicates'
import type { AlertPredicate, MarketSnapshot } from '../types'

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function snap(
  overrides: Partial<MarketSnapshot> & { close?: number; volume?: number } = {},
): MarketSnapshot {
  const close = overrides.close ?? 100
  const volume = overrides.volume ?? 1000
  return {
    bar: {
      timestamp: 1,
      open: close - 1,
      high: close + 1,
      low: close - 2,
      close,
      volume,
    },
    indicators: overrides.indicators ?? {},
    rollingVolume: overrides.rollingVolume ?? {},
    volumeProfile: overrides.volumeProfile,
    orderBook: overrides.orderBook,
    footprint: overrides.footprint,
  }
}

// ---------------------------------------------------------------------------
// price-cross
// ---------------------------------------------------------------------------

describe('predicate: price-cross', () => {
  it('fires up-cross when prev < threshold and curr >= threshold', () => {
    const pred: AlertPredicate = { kind: 'price-cross', price: 100, direction: 'up' }
    const prev = snap({ close: 99 })
    const curr = snap({ close: 100 })
    expect(evaluatePredicate(pred, curr, prev)).toBe(true)
  })

  it('does not fire up-cross when both prev and curr are above threshold', () => {
    const pred: AlertPredicate = { kind: 'price-cross', price: 100, direction: 'up' }
    const prev = snap({ close: 101 })
    const curr = snap({ close: 102 })
    expect(evaluatePredicate(pred, curr, prev)).toBe(false)
  })

  it('fires down-cross when prev > threshold and curr <= threshold', () => {
    const pred: AlertPredicate = { kind: 'price-cross', price: 100, direction: 'down' }
    const prev = snap({ close: 101 })
    const curr = snap({ close: 100 })
    expect(evaluatePredicate(pred, curr, prev)).toBe(true)
  })

  it('does not fire on first-evaluation (prev=null) even if curr equals threshold', () => {
    const pred: AlertPredicate = { kind: 'price-cross', price: 100, direction: 'any' }
    const curr = snap({ close: 100 })
    expect(evaluatePredicate(pred, curr, null)).toBe(false)
  })

  it("direction='any' fires on either up or down cross", () => {
    const pred: AlertPredicate = { kind: 'price-cross', price: 100, direction: 'any' }
    const upPrev = snap({ close: 99 })
    const upCurr = snap({ close: 100 })
    const downPrev = snap({ close: 101 })
    const downCurr = snap({ close: 99 })
    expect(evaluatePredicate(pred, upCurr, upPrev)).toBe(true)
    expect(evaluatePredicate(pred, downCurr, downPrev)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// price-in-range / price-out-of-range
// ---------------------------------------------------------------------------

describe('predicate: price-in-range', () => {
  it('fires when close lies inside the closed interval', () => {
    const pred: AlertPredicate = { kind: 'price-in-range', min: 90, max: 110 }
    expect(evaluatePredicate(pred, snap({ close: 100 }), null)).toBe(true)
  })

  it('does not fire when close is below min', () => {
    const pred: AlertPredicate = { kind: 'price-in-range', min: 90, max: 110 }
    expect(evaluatePredicate(pred, snap({ close: 89 }), null)).toBe(false)
  })

  it('boundary values count as inside (>=, <=)', () => {
    const pred: AlertPredicate = { kind: 'price-in-range', min: 90, max: 110 }
    expect(evaluatePredicate(pred, snap({ close: 90 }), null)).toBe(true)
    expect(evaluatePredicate(pred, snap({ close: 110 }), null)).toBe(true)
  })

  it('returns false when bar is null', () => {
    const pred: AlertPredicate = { kind: 'price-in-range', min: 90, max: 110 }
    const s: MarketSnapshot = {
      bar: null,
      indicators: {},
      rollingVolume: {},
    }
    expect(evaluatePredicate(pred, s, null)).toBe(false)
  })
})

describe('predicate: price-out-of-range', () => {
  it('fires when close is above max', () => {
    const pred: AlertPredicate = {
      kind: 'price-out-of-range',
      min: 90,
      max: 110,
    }
    expect(evaluatePredicate(pred, snap({ close: 111 }), null)).toBe(true)
  })

  it('does not fire when close is exactly on a boundary', () => {
    const pred: AlertPredicate = {
      kind: 'price-out-of-range',
      min: 90,
      max: 110,
    }
    expect(evaluatePredicate(pred, snap({ close: 90 }), null)).toBe(false)
    expect(evaluatePredicate(pred, snap({ close: 110 }), null)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// indicator-cross
// ---------------------------------------------------------------------------

describe('predicate: indicator-cross', () => {
  it('fires when indicator crosses up through threshold', () => {
    const pred: AlertPredicate = {
      kind: 'indicator-cross',
      indicatorId: 'rsi',
      threshold: 70,
      direction: 'up',
    }
    const prev = snap({ indicators: { rsi: 69 } })
    const curr = snap({ indicators: { rsi: 71 } })
    expect(evaluatePredicate(pred, curr, prev)).toBe(true)
  })

  it('does not fire when indicator does not exist on snapshot', () => {
    const pred: AlertPredicate = {
      kind: 'indicator-cross',
      indicatorId: 'rsi',
      threshold: 70,
      direction: 'any',
    }
    expect(evaluatePredicate(pred, snap({ indicators: {} }), null)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// indicator-cross-indicator
// ---------------------------------------------------------------------------

describe('predicate: indicator-cross-indicator', () => {
  it("fires 'a-above-b' when A goes from <= B to > B", () => {
    const pred: AlertPredicate = {
      kind: 'indicator-cross-indicator',
      aId: 'fast',
      bId: 'slow',
      direction: 'a-above-b',
    }
    const prev = snap({ indicators: { fast: 9, slow: 10 } })
    const curr = snap({ indicators: { fast: 11, slow: 10 } })
    expect(evaluatePredicate(pred, curr, prev)).toBe(true)
  })

  it("does not fire 'a-above-b' if A was already above B", () => {
    const pred: AlertPredicate = {
      kind: 'indicator-cross-indicator',
      aId: 'fast',
      bId: 'slow',
      direction: 'a-above-b',
    }
    const prev = snap({ indicators: { fast: 11, slow: 10 } })
    const curr = snap({ indicators: { fast: 12, slow: 10 } })
    expect(evaluatePredicate(pred, curr, prev)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// volume-spike
// ---------------------------------------------------------------------------

describe('predicate: volume-spike', () => {
  it('fires when volume meets the multiple-of-average threshold', () => {
    const pred: AlertPredicate = {
      kind: 'volume-spike',
      multipleOfAvg: 3,
      lookbackBars: 20,
    }
    const s = snap({ volume: 6000, rollingVolume: { 20: 2000 } })
    expect(evaluatePredicate(pred, s, null)).toBe(true)
  })

  it('does not fire when volume is below the multiple', () => {
    const pred: AlertPredicate = {
      kind: 'volume-spike',
      multipleOfAvg: 3,
      lookbackBars: 20,
    }
    const s = snap({ volume: 5999, rollingVolume: { 20: 2000 } })
    expect(evaluatePredicate(pred, s, null)).toBe(false)
  })

  it('does not fire when the lookback average is missing', () => {
    const pred: AlertPredicate = {
      kind: 'volume-spike',
      multipleOfAvg: 3,
      lookbackBars: 20,
    }
    const s = snap({ volume: 9999, rollingVolume: {} })
    expect(evaluatePredicate(pred, s, null)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// volume-profile-poc-touch
// ---------------------------------------------------------------------------

describe('predicate: volume-profile-poc-touch', () => {
  it('fires when close is within the band of POC', () => {
    const pred: AlertPredicate = {
      kind: 'volume-profile-poc-touch',
      bandPercent: 0.005, // 0.5%
    }
    const s = snap({
      close: 100,
      volumeProfile: { poc: 100.3, vah: 101, val: 99 },
    })
    expect(evaluatePredicate(pred, s, null)).toBe(true)
  })

  it('does not fire when close is outside the POC band', () => {
    const pred: AlertPredicate = {
      kind: 'volume-profile-poc-touch',
      bandPercent: 0.001, // 0.1%
    }
    const s = snap({
      close: 100,
      volumeProfile: { poc: 102, vah: 103, val: 99 },
    })
    expect(evaluatePredicate(pred, s, null)).toBe(false)
  })

  it('returns false when volumeProfile is not on the snapshot', () => {
    const pred: AlertPredicate = {
      kind: 'volume-profile-poc-touch',
      bandPercent: 0.005,
    }
    expect(evaluatePredicate(pred, snap({ close: 100 }), null)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// order-book-wall
// ---------------------------------------------------------------------------

describe('predicate: order-book-wall', () => {
  it('fires when max bid >= median bid * multiple', () => {
    const pred: AlertPredicate = {
      kind: 'order-book-wall',
      sizeMultipleOfMedian: 10,
    }
    const s = snap({
      orderBook: {
        medianBidSize: 5,
        medianAskSize: 5,
        maxBidSize: 60,
        maxAskSize: 6,
      },
    })
    expect(evaluatePredicate(pred, s, null)).toBe(true)
  })

  it('does not fire when median is zero (degenerate book)', () => {
    const pred: AlertPredicate = {
      kind: 'order-book-wall',
      sizeMultipleOfMedian: 10,
    }
    const s = snap({
      orderBook: {
        medianBidSize: 0,
        medianAskSize: 0,
        maxBidSize: 9999,
        maxAskSize: 9999,
      },
    })
    // We refuse to "fire" when there's no baseline to compare against —
    // any multiple of 0 is 0, which is meaningless.
    expect(evaluatePredicate(pred, s, null)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// footprint-imbalance
// ---------------------------------------------------------------------------

describe('predicate: footprint-imbalance', () => {
  it('fires when ratio and consecutive levels both clear thresholds', () => {
    const pred: AlertPredicate = {
      kind: 'footprint-imbalance',
      minImbalanceRatio: 3,
      consecutivePriceLevels: 3,
    }
    const s = snap({
      footprint: {
        latestBarMaxImbalanceRatio: 4.2,
        latestBarImbalanceCount: 5,
      },
    })
    expect(evaluatePredicate(pred, s, null)).toBe(true)
  })

  it('does not fire when consecutive levels falls below cutoff', () => {
    const pred: AlertPredicate = {
      kind: 'footprint-imbalance',
      minImbalanceRatio: 3,
      consecutivePriceLevels: 3,
    }
    const s = snap({
      footprint: {
        latestBarMaxImbalanceRatio: 4.2,
        latestBarImbalanceCount: 2,
      },
    })
    expect(evaluatePredicate(pred, s, null)).toBe(false)
  })

  it('does not fire when the ratio falls below cutoff', () => {
    const pred: AlertPredicate = {
      kind: 'footprint-imbalance',
      minImbalanceRatio: 3,
      consecutivePriceLevels: 3,
    }
    const s = snap({
      footprint: {
        latestBarMaxImbalanceRatio: 2.9,
        latestBarImbalanceCount: 5,
      },
    })
    expect(evaluatePredicate(pred, s, null)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// custom
// ---------------------------------------------------------------------------

describe('predicate: custom', () => {
  it("respects the user's boolean return value", () => {
    const truePred: AlertPredicate = { kind: 'custom', evaluate: () => true }
    const falsePred: AlertPredicate = { kind: 'custom', evaluate: () => false }
    expect(evaluatePredicate(truePred, snap(), null)).toBe(true)
    expect(evaluatePredicate(falsePred, snap(), null)).toBe(false)
  })

  it('survives a throwing custom predicate (inner guard)', () => {
    const boomPred: AlertPredicate = {
      kind: 'custom',
      evaluate: () => {
        throw new Error('boom')
      },
    }
    // The inner try/catch in evaluatePredicate must convert this to false
    // without rethrowing — this is the first half of the sandbox guarantee.
    expect(() => evaluatePredicate(boomPred, snap(), null)).not.toThrow()
    expect(evaluatePredicate(boomPred, snap(), null)).toBe(false)
  })
})
