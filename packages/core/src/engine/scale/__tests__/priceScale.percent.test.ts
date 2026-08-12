import { describe, it, expect } from 'vitest'

import { PriceScale } from '../priceScale'

describe('PriceScale percent mode (比较视图右轴百分比)', () => {
  it('maps base price to the center of a symmetric percent range', () => {
    const scale = new PriceScale()
    scale.setHeight(100)
    scale.setPadding(0, 0)
    scale.setRange({ maxPrice: 110, minPrice: 90 })
    scale.setBasePrice(100)
    scale.setScaleType('percent')
    // 90..110 → -10%..+10%，基准价 100 → 0% → 中线 y=50
    expect(scale.toPercent(90)).toBe(-10)
    expect(scale.toPercent(110)).toBe(10)
    expect(scale.priceToY(100)).toBeCloseTo(50)
    expect(scale.yToPrice(50)).toBeCloseTo(100)
  })

  it('toPercent/fromPercent round-trip', () => {
    const scale = new PriceScale()
    scale.setRange({ maxPrice: 130, minPrice: 70 })
    scale.setBasePrice(100)
    scale.setScaleType('percent')
    for (const p of [75, 100, 125]) {
      expect(scale.fromPercent(scale.toPercent(p))).toBeCloseTo(p)
    }
  })

  it('restores linear mapping after switching back to linear', () => {
    const scale = new PriceScale()
    scale.setHeight(100)
    scale.setPadding(0, 0)
    scale.setRange({ maxPrice: 110, minPrice: 90 })
    scale.setBasePrice(100)
    scale.setScaleType('percent')
    scale.setScaleType('linear')
    // 线性：100 处于 90..110 中位，110 映射到顶部
    expect(scale.priceToY(100)).toBeCloseTo(50)
    expect(scale.priceToY(110)).toBeCloseTo(0)
  })
})
