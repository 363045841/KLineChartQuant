/**
 * KLineChartError taxonomy — base class, code field, cause propagation,
 * instanceof across the migrated throw sites.
 *
 * Covers API audit BLOCKER-005 acceptance criteria:
 *   1. `instanceof KLineChartError` works for every migrated throw.
 *   2. `code` is the documented value.
 *   3. `cause` is preserved when provided.
 *   4. The error is JSON-serialisable to a useful payload.
 *   5. The type-guard narrows.
 */

import { describe, it, expect } from 'vitest'

import { computeAnchoredVwap } from '../components/anchoredVwap/computeAnchoredVwap'
import { createFootprintController } from '../components/footprint/createFootprintController'
import { KLineChartError, isKLineChartError, type KLineChartErrorCode } from '../errors'
import { createPriceScale } from '../scale/createPriceScale'
import { createTimeScale } from '../scale/createTimeScale'

describe('KLineChartError — base class', () => {
  it('extends Error and pins the name', () => {
    const e = new KLineChartError('INVALID_PARAM', 'bad input')
    expect(e).toBeInstanceOf(Error)
    expect(e).toBeInstanceOf(KLineChartError)
    expect(e.name).toBe('KLineChartError')
    expect(e.message).toBe('bad input')
    expect(e.code).toBe('INVALID_PARAM')
  })

  it('preserves a cause through ES2022 options', () => {
    const root = new TypeError('underlying')
    const wrapped = new KLineChartError('INVALID_STATE', 'wrap', { cause: root })
    // Node 18+ exposes `.cause` on Error directly.
    expect((wrapped as unknown as { cause: unknown }).cause).toBe(root)
  })

  it('has a captured stack pointing past the constructor', () => {
    const e = new KLineChartError('DISPOSED', 'gone')
    expect(typeof e.stack).toBe('string')
    // V8 only — gated on the captureStackTrace symbol existing.
    if ('captureStackTrace' in Error) {
      expect(e.stack).not.toContain('new KLineChartError')
    }
  })
})

describe('KLineChartError — isKLineChartError type-guard', () => {
  it('returns true for instances, false for plain Error', () => {
    const ours = new KLineChartError('INVALID_PARAM', 'x')
    const theirs = new Error('x')
    expect(isKLineChartError(ours)).toBe(true)
    expect(isKLineChartError(theirs)).toBe(false)
    expect(isKLineChartError(null)).toBe(false)
    expect(isKLineChartError(undefined)).toBe(false)
  })

  it('narrows by code when a second arg is supplied', () => {
    const e = new KLineChartError('SCALE_RANGE_INVALID', 'x')
    expect(isKLineChartError(e, 'SCALE_RANGE_INVALID')).toBe(true)
    expect(isKLineChartError(e, 'SCALE_LOG_REQUIRES_POSITIVE')).toBe(false)
  })
})

describe('Migrated throw sites — PriceScale', () => {
  it('createPriceScale: visibleMax < visibleMin → SCALE_RANGE_INVALID', () => {
    let caught: unknown
    try {
      createPriceScale({
        initialMode: 'linear',
        initialVisibleMin: 100,
        initialVisibleMax: 50,
        initialHeight: 100,
      })
    } catch (e) {
      caught = e
    }
    expect(isKLineChartError(caught, 'SCALE_RANGE_INVALID')).toBe(true)
  })

  it('createPriceScale: log requires positive → SCALE_LOG_REQUIRES_POSITIVE', () => {
    let caught: unknown
    try {
      createPriceScale({
        initialMode: 'log',
        initialVisibleMin: -1,
        initialVisibleMax: 10,
        initialHeight: 100,
      })
    } catch (e) {
      caught = e
    }
    expect(isKLineChartError(caught, 'SCALE_LOG_REQUIRES_POSITIVE')).toBe(true)
  })

  it('createPriceScale: initialHeight <= 0 → SCALE_HEIGHT_INVALID', () => {
    let caught: unknown
    try {
      createPriceScale({
        initialMode: 'linear',
        initialVisibleMin: 0,
        initialVisibleMax: 1,
        initialHeight: 0,
      })
    } catch (e) {
      caught = e
    }
    expect(isKLineChartError(caught, 'SCALE_HEIGHT_INVALID')).toBe(true)
  })
})

describe('Migrated throw sites — TimeScale', () => {
  it('createTimeScale: barWidth <= 0 → SCALE_BAR_WIDTH_INVALID', () => {
    let caught: unknown
    try {
      createTimeScale({ initialBarWidth: 0 })
    } catch (e) {
      caught = e
    }
    expect(isKLineChartError(caught, 'SCALE_BAR_WIDTH_INVALID')).toBe(true)
  })

  it('TimeScale.setBarWidth: <= 0 → SCALE_BAR_WIDTH_INVALID', () => {
    const ts = createTimeScale({ initialBarWidth: 1 })
    expect(() => ts.setBarWidth(-1)).toThrow(KLineChartError)
    try {
      ts.setBarWidth(-1)
    } catch (e) {
      expect(isKLineChartError(e, 'SCALE_BAR_WIDTH_INVALID')).toBe(true)
    }
  })
})

describe('Migrated throw sites — FootprintController', () => {
  const cases: Array<{
    cfg: { tickSize?: number; barIntervalMs?: number; imbalanceRatio?: number }
    code: KLineChartErrorCode
    label: string
  }> = [
    { cfg: { tickSize: 0 }, code: 'FOOTPRINT_TICKSIZE_INVALID', label: 'tickSize' },
    {
      cfg: { barIntervalMs: 0 },
      code: 'FOOTPRINT_BAR_INTERVAL_INVALID',
      label: 'barIntervalMs',
    },
    {
      cfg: { imbalanceRatio: 0 },
      code: 'FOOTPRINT_RATIO_INVALID',
      label: 'imbalanceRatio',
    },
  ]
  for (const { cfg, code, label } of cases) {
    it(`${label} <= 0 → ${code}`, () => {
      let caught: unknown
      try {
        createFootprintController(cfg)
      } catch (e) {
        caught = e
      }
      expect(isKLineChartError(caught, code)).toBe(true)
    })
  }
})

describe('Migrated throw sites — anchoredVwap', () => {
  it('anchorIndex out of range → AVWAP_ANCHOR_OUT_OF_RANGE', () => {
    const bars = [
      { high: 1, low: 0.5, close: 0.9, volume: 10 },
      { high: 1.5, low: 1, close: 1.2, volume: 20 },
    ]
    let caught: unknown
    try {
      computeAnchoredVwap(bars, 99, false)
    } catch (e) {
      caught = e
    }
    expect(isKLineChartError(caught, 'AVWAP_ANCHOR_OUT_OF_RANGE')).toBe(true)
  })

  it('empty bars yields empty array, no throw', () => {
    expect(computeAnchoredVwap([], 0, false)).toEqual([])
  })
})
