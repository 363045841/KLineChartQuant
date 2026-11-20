import { describe, expect, it } from 'vitest'

import { evaluatePredicate } from '../impl/predicates'
import type { AlertPredicate, MarketSnapshot } from '../types'
import { createMarketSnapshot } from './helpers/marketSnapshot'

type PredicateCase = {
  name: string
  pred: AlertPredicate
  prev: MarketSnapshot | null
  curr: MarketSnapshot
  expected: boolean
}

/** 跨式谓词共享一张表：只声明 prev / curr 与期望。 */
function runCases(cases: ReadonlyArray<PredicateCase>): void {
  it.each(cases)('$name', ({ pred, prev, curr, expected }) => {
    expect(evaluatePredicate(pred, curr, prev)).toBe(expected)
  })
}

describe('price-cross', () => {
  const cross = (
    name: string,
    direction: 'up' | 'down' | 'any',
    prev: number | null,
    curr: number,
    expected: boolean,
  ): PredicateCase => ({
    name,
    pred: { kind: 'price-cross', price: 100, direction },
    prev: prev === null ? null : createMarketSnapshot({ close: prev }),
    curr: createMarketSnapshot({ close: curr }),
    expected,
  })

  runCases([
    cross('up-cross fires at threshold', 'up', 99, 100, true),
    cross('up-cross does not fire when already above', 'up', 101, 102, false),
    cross('down-cross fires at threshold', 'down', 101, 100, true),
    cross('any fires on up-cross', 'any', 99, 100, true),
    cross('any fires on down-cross', 'any', 101, 99, true),
    cross('does not fire on first evaluation (prev=null)', 'any', null, 100, false),
  ])
})

describe('price-in-range', () => {
  const caseOf = (close: number, expected: boolean): PredicateCase => ({
    name: `close=${close} → ${expected}`,
    pred: { kind: 'price-in-range', min: 90, max: 110 },
    prev: null,
    curr: createMarketSnapshot({ close }),
    expected,
  })

  runCases([caseOf(100, true), caseOf(89, false), caseOf(90, true), caseOf(110, true)])

  it('returns false when the bar is null', () => {
    const snapshot: MarketSnapshot = { bar: null, indicators: {}, rollingVolume: {} }
    expect(
      evaluatePredicate({ kind: 'price-in-range', min: 90, max: 110 }, snapshot, null),
    ).toBe(false)
  })
})

describe('price-out-of-range', () => {
  const caseOf = (close: number, expected: boolean): PredicateCase => ({
    name: `close=${close} → ${expected}`,
    pred: { kind: 'price-out-of-range', min: 90, max: 110 },
    prev: null,
    curr: createMarketSnapshot({ close }),
    expected,
  })

  runCases([caseOf(111, true), caseOf(89, true), caseOf(90, false), caseOf(110, false)])
})

describe('indicator-cross', () => {
  const caseOf = (
    name: string,
    direction: 'up' | 'down' | 'any',
    prev: Record<string, number> | null,
    curr: Record<string, number>,
    expected: boolean,
  ): PredicateCase => ({
    name,
    pred: { kind: 'indicator-cross', indicatorId: 'rsi', threshold: 70, direction },
    prev: prev === null ? null : createMarketSnapshot({ indicators: prev }),
    curr: createMarketSnapshot({ indicators: curr }),
    expected,
  })

  runCases([
    caseOf('fires when indicator crosses up through threshold', 'up', { rsi: 69 }, { rsi: 71 }, true),
    caseOf('does not fire when indicator is missing', 'any', null, {}, false),
    caseOf('does not fire on first evaluation', 'up', null, { rsi: 71 }, false),
  ])
})

describe('indicator-cross-indicator', () => {
  const caseOf = (
    name: string,
    prev: { fast: number; slow: number },
    curr: { fast: number; slow: number },
    expected: boolean,
  ): PredicateCase => ({
    name,
    pred: {
      kind: 'indicator-cross-indicator',
      aId: 'fast',
      bId: 'slow',
      direction: 'a-above-b',
    },
    prev: createMarketSnapshot({ indicators: prev }),
    curr: createMarketSnapshot({ indicators: curr }),
    expected,
  })

  runCases([
    caseOf('fires when A goes from <= B to > B', { fast: 9, slow: 10 }, { fast: 11, slow: 10 }, true),
    caseOf('does not fire if A was already above B', { fast: 11, slow: 10 }, { fast: 12, slow: 10 }, false),
  ])
})

describe('volume-spike', () => {
  const caseOf = (
    name: string,
    volume: number,
    rollingVolume: Record<number, number>,
    expected: boolean,
  ): PredicateCase => ({
    name,
    pred: { kind: 'volume-spike', multipleOfAvg: 3, lookbackBars: 20 },
    prev: null,
    curr: createMarketSnapshot({ volume, rollingVolume }),
    expected,
  })

  runCases([
    caseOf('fires when volume meets the multiple', 6000, { 20: 2000 }, true),
    caseOf('does not fire below the multiple', 5999, { 20: 2000 }, false),
    caseOf('does not fire without a baseline average', 9999, {}, false),
  ])
})

describe('volume-profile-poc-touch', () => {
  const caseOf = (
    name: string,
    close: number,
    volumeProfile: { poc: number; vah: number; val: number } | undefined,
    bandPercent: number,
    expected: boolean,
  ): PredicateCase => ({
    name,
    pred: { kind: 'volume-profile-poc-touch', bandPercent },
    prev: null,
    curr: createMarketSnapshot({ close, ...(volumeProfile === undefined ? {} : { volumeProfile }) }),
    expected,
  })

  runCases([
    caseOf('fires inside the POC band', 100, { poc: 100.3, vah: 101, val: 99 }, 0.005, true),
    caseOf('does not fire outside the POC band', 100, { poc: 102, vah: 103, val: 99 }, 0.001, false),
    caseOf('does not fire without a volume profile', 100, undefined, 0.005, false),
  ])
})

describe('order-book-wall', () => {
  const caseOf = (
    name: string,
    orderBook: {
      medianBidSize: number
      medianAskSize: number
      maxBidSize: number
      maxAskSize: number
    },
    expected: boolean,
  ): PredicateCase => ({
    name,
    pred: { kind: 'order-book-wall', sizeMultipleOfMedian: 10 },
    prev: null,
    curr: createMarketSnapshot({ orderBook }),
    expected,
  })

  runCases([
    caseOf(
      'fires when max bid clears the multiple',
      { medianBidSize: 5, medianAskSize: 5, maxBidSize: 60, maxAskSize: 6 },
      true,
    ),
    caseOf(
      'fires when max ask clears the multiple',
      { medianBidSize: 5, medianAskSize: 5, maxBidSize: 6, maxAskSize: 60 },
      true,
    ),
    caseOf(
      'does not fire on a degenerate book (zero median)',
      { medianBidSize: 0, medianAskSize: 0, maxBidSize: 9999, maxAskSize: 9999 },
      false,
    ),
  ])
})

describe('footprint-imbalance', () => {
  const caseOf = (
    name: string,
    ratio: number,
    count: number,
    expected: boolean,
  ): PredicateCase => ({
    name,
    pred: { kind: 'footprint-imbalance', minImbalanceRatio: 3, consecutivePriceLevels: 3 },
    prev: null,
    curr: createMarketSnapshot({
      footprint: { latestBarMaxImbalanceRatio: ratio, latestBarImbalanceCount: count },
    }),
    expected,
  })

  runCases([
    caseOf('fires when ratio and consecutive levels both clear', 4.2, 5, true),
    caseOf('does not fire below the consecutive-level cutoff', 4.2, 2, false),
    caseOf('does not fire below the ratio cutoff', 2.9, 5, false),
  ])
})

describe('custom', () => {
  it('respects the user boolean return value', () => {
    expect(
      evaluatePredicate({ kind: 'custom', evaluate: () => true }, createMarketSnapshot(), null),
    ).toBe(true)
    expect(
      evaluatePredicate({ kind: 'custom', evaluate: () => false }, createMarketSnapshot(), null),
    ).toBe(false)
  })

  it('propagates the original custom predicate exception', () => {
    const error = new Error('boom')
    const predicate: AlertPredicate = {
      kind: 'custom',
      evaluate: () => {
        throw error
      },
    }
    expect(() => evaluatePredicate(predicate, createMarketSnapshot(), null)).toThrow(error)
  })
})
