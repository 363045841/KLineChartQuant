import { describe, it, expect, vi } from 'vitest'

import { createPriceScale } from '../createPriceScale'

describe('createPriceScale — linear mode', () => {
  it('forward & inverse linear round-trip', () => {
    const s = createPriceScale({
      initialMode: 'linear',
      initialVisibleMin: 100,
      initialVisibleMax: 200,
      initialHeight: 400,
    })
    for (const p of [100, 120.5, 150, 180.25, 200]) {
      expect(s.yToPrice(s.priceToY(p))).toBeCloseTo(p, 8)
    }
    for (const y of [0, 100, 200, 300, 400]) {
      expect(s.priceToY(s.yToPrice(y))).toBeCloseTo(y, 8)
    }
  })

  it('linear: max maps to y=0 and min maps to y=height (Y grows downward)', () => {
    const s = createPriceScale({
      initialMode: 'linear',
      initialVisibleMin: 100,
      initialVisibleMax: 200,
      initialHeight: 400,
    })
    expect(s.priceToY(200)).toBeCloseTo(0, 10)
    expect(s.priceToY(100)).toBeCloseTo(400, 10)
    expect(s.priceToY(150)).toBeCloseTo(200, 10)
  })

  it('setHeight changes the mapping proportionally', () => {
    const s = createPriceScale({
      initialMode: 'linear',
      initialVisibleMin: 0,
      initialVisibleMax: 100,
      initialHeight: 400,
    })
    expect(s.priceToY(50)).toBeCloseTo(200, 10)
    s.setHeight(800)
    expect(s.priceToY(50)).toBeCloseTo(400, 10)
  })

  it('degenerate range (min === max) is clamped to center, not NaN', () => {
    const s = createPriceScale({
      initialMode: 'linear',
      initialVisibleMin: 100,
      initialVisibleMax: 100,
      initialHeight: 400,
    })
    // Documented behaviour: anything maps to the geometric middle of the canvas.
    expect(s.priceToY(100)).toBe(200)
    expect(s.priceToY(50)).toBe(200) // still pinned to middle
    expect(s.priceToY(150)).toBe(200)
  })
})

describe('createPriceScale — log mode', () => {
  it('forward & inverse log round-trip', () => {
    const s = createPriceScale({
      initialMode: 'log',
      initialVisibleMin: 1,
      initialVisibleMax: 1000,
      initialHeight: 600,
    })
    for (const p of [1, 10, 100, 333.33, 1000]) {
      expect(s.yToPrice(s.priceToY(p))).toBeCloseTo(p, 6)
    }
  })

  it('log: equal log-distances produce equal pixel distances', () => {
    // 1 → 10 → 100 → 1000 are each one decade apart.
    // In log mode they must be at equal Y intervals.
    const s = createPriceScale({
      initialMode: 'log',
      initialVisibleMin: 1,
      initialVisibleMax: 1000,
      initialHeight: 600,
    })
    const y1 = s.priceToY(1)
    const y10 = s.priceToY(10)
    const y100 = s.priceToY(100)
    const y1000 = s.priceToY(1000)
    const d1 = y1 - y10
    const d2 = y10 - y100
    const d3 = y100 - y1000
    expect(d1).toBeCloseTo(d2, 8)
    expect(d2).toBeCloseTo(d3, 8)
  })

  it('setMode("log") rejects when visibleMin <= 0', () => {
    const s = createPriceScale({
      initialMode: 'linear',
      initialVisibleMin: 0, // not OK for log
      initialVisibleMax: 100,
    })
    expect(() => s.setMode('log')).toThrow(/visibleMin > 0/)
  })

  it('constructor rejects log + non-positive min', () => {
    expect(() =>
      createPriceScale({ initialMode: 'log', initialVisibleMin: 0, initialVisibleMax: 100 }),
    ).toThrow(/log/)
    expect(() =>
      createPriceScale({ initialMode: 'log', initialVisibleMin: -5, initialVisibleMax: 100 }),
    ).toThrow(/log/)
  })

  it('setVisibleRange in log mode rejects non-positive min', () => {
    const s = createPriceScale({
      initialMode: 'log',
      initialVisibleMin: 1,
      initialVisibleMax: 100,
    })
    expect(() => s.setVisibleRange(0, 100)).toThrow(/log/)
    expect(() => s.setVisibleRange(-1, 100)).toThrow(/log/)
  })
})

describe('createPriceScale — origin shift integration', () => {
  it('toShiftedFp32 returns p - originShiftRef', () => {
    const s = createPriceScale({
      initialMode: 'linear',
      initialVisibleMin: 66950,
      initialVisibleMax: 67050,
      initialHeight: 400,
    })
    // Origin starts at midpoint = 67000.
    expect(s.originShiftRef.peek()).toBe(67000)
    expect(s.toShiftedFp32(67000.5)).toBeCloseTo(0.5, 10)
    expect(s.toShiftedFp32(66999.5)).toBeCloseTo(-0.5, 10)
  })

  it('setVisibleRange triggers maybeRebaseline when drift > threshold', () => {
    const s = createPriceScale({
      initialMode: 'linear',
      initialVisibleMin: 100,
      initialVisibleMax: 200,
      initialHeight: 400,
      originShiftThreshold: 0.01, // 1%
    })
    const refBefore = s.originShiftRef.peek() // = 150

    // Shift mid by 0.005 of range — BELOW threshold, no rebase.
    s.setVisibleRange(100.5, 200.5) // new mid 150.5, drift 0.5, range 100, normalized 0.005
    expect(s.originShiftRef.peek()).toBe(refBefore)

    // Shift mid by 0.02 of range — ABOVE threshold, rebase.
    s.setVisibleRange(102, 202) // new mid 152, drift from old ref 150 = 2, normalized 0.02
    expect(s.originShiftRef.peek()).toBe(152)
  })

  it('signal subscriptions fire on visible-range and mode changes', () => {
    const s = createPriceScale({ initialVisibleMin: 1, initialVisibleMax: 100 })
    const onMin = vi.fn()
    const onMax = vi.fn()
    const onMode = vi.fn()
    s.visibleMin.subscribe(onMin)
    s.visibleMax.subscribe(onMax)
    s.mode.subscribe(onMode)

    s.setVisibleRange(2, 200)
    expect(onMin).toHaveBeenCalledTimes(1)
    expect(onMax).toHaveBeenCalledTimes(1)

    s.setMode('log')
    expect(onMode).toHaveBeenCalledTimes(1)
  })

  it('originShiftRef signal updates when a rebase fires', () => {
    const s = createPriceScale({
      initialVisibleMin: 100,
      initialVisibleMax: 200,
      originShiftThreshold: 0.01,
    })
    const onRef = vi.fn()
    s.originShiftRef.subscribe(onRef)

    s.setVisibleRange(100.5, 200.5) // below threshold
    expect(onRef).not.toHaveBeenCalled()

    s.setVisibleRange(105, 205) // above threshold
    expect(onRef).toHaveBeenCalledTimes(1)
  })
})

describe('createPriceScale — validation & lifecycle', () => {
  it('setVisibleRange rejects non-finite or inverted bounds', () => {
    const s = createPriceScale()
    expect(() => s.setVisibleRange(Number.NaN, 1)).toThrow(/finite/)
    expect(() => s.setVisibleRange(100, 50)).toThrow(/max/)
  })

  it('setHeight rejects non-positive values', () => {
    const s = createPriceScale()
    expect(() => s.setHeight(0)).toThrow(/> 0/)
    expect(() => s.setHeight(-1)).toThrow(/> 0/)
  })

  it('dispose silences subsequent writes (silent no-op, reads still work)', () => {
    // API audit BLOCKER-004: harmonized to silent-no-op (matches the
    // convention used by every other @klinechart-quant/core controller).
    const s = createPriceScale({ initialVisibleMin: 0, initialVisibleMax: 100, initialHeight: 400 })
    const minBefore = s.visibleMin()
    const heightBefore = s.height()
    const modeBefore = s.mode()
    s.dispose()
    // Mutators return undefined silently — no throw.
    s.setVisibleRange(10, 110)
    s.setHeight(200)
    s.setMode('log')
    // State frozen at pre-dispose values.
    expect(s.visibleMin()).toBe(minBefore)
    expect(s.height()).toBe(heightBefore)
    expect(s.mode()).toBe(modeBefore)
    // Pure math still returns sensible numbers.
    expect(s.priceToY(50)).toBeCloseTo(200, 10)
  })
})
