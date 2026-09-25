import { describe, expect, it } from 'vitest'
import type { PaneInfo } from '../../../foundation/plugin/types.js'
import { ScaleType } from '../../../foundation/types/scaleType.js'
import { PriceScale } from '../../scale/priceScale.js'
import { createYAxisTicks } from '../axisTicks.js'

function paneFor(scale: PriceScale): PaneInfo {
  return { height: 400, role: 'price', yAxis: scale } as PaneInfo
}

describe('value-anchored Y axis ticks', () => {
  it('moves the same price marks with the series during a vertical pan', () => {
    const scale = new PriceScale()
    scale.setHeight(400)
    scale.setPadding(20, 20)
    scale.setRange({ minPrice: 0, maxPrice: 100 })
    const initial = createYAxisTicks(paneFor(scale), { rightTypeSetting: ScaleType.Linear })
    scale.setPriceOffset(5)
    const moved = createYAxisTicks(paneFor(scale), { rightTypeSetting: ScaleType.Linear })
    const shared = initial.filter((tick) => moved.some((next) => next.value === tick.value))
    expect(shared.length).toBeGreaterThan(1)
    for (const tick of shared) {
      const next = moved.find((item) => item.value === tick.value)!
      expect(next.y - tick.y).toBeCloseTo(18, 6)
    }
  })

  it('keeps percentage marks stable with a percent scale', () => {
    const scale = new PriceScale()
    scale.setHeight(400)
    scale.setPadding(20, 20)
    scale.setBasePrice(100)
    scale.setRange({ minPrice: 90, maxPrice: 110 })
    scale.setScaleType(ScaleType.Percent)
    const before = createYAxisTicks(paneFor(scale), { rightTypeSetting: ScaleType.Percent })
    scale.setPriceOffset(1)
    const after = createYAxisTicks(paneFor(scale), { rightTypeSetting: ScaleType.Percent })
    expect(before.some((tick) => after.some((next) => next.value === tick.value && next.y !== tick.y))).toBe(true)
    expect(after.every((tick) => Number.isFinite(tick.y) && Number.isFinite(tick.value))).toBe(true)
  })

  it('produces finite aligned marks in logarithmic space', () => {
    const scale = new PriceScale()
    scale.setHeight(400)
    scale.setPadding(20, 20)
    scale.setRange({ minPrice: 1, maxPrice: 1000 })
    scale.setScaleType(ScaleType.Log)
    const ticks = createYAxisTicks(paneFor(scale), { rightTypeSetting: ScaleType.Log })
    expect(ticks.length).toBeGreaterThan(1)
    for (const tick of ticks) {
      expect(tick.value).toBeGreaterThan(0)
      expect(tick.y).toBeCloseTo(scale.priceToY(tick.value), 6)
    }
  })
})
