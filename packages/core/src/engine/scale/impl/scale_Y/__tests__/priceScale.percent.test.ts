import { describe, expect, it } from 'vitest'

import { PriceScale } from '../priceScale'

describe('PriceScale percent mode (比较视图右轴百分比)', () => {
  // 90..110 → -10%..+10%，基准价 100 → 0% → 中线 y=50；切回线性后恢复价格映射。
  it('maps base price to the center of a symmetric percent range and restores linear mapping', () => {
    const scale = new PriceScale()
    scale.setHeight(100)
    scale.setContentInsets(0, 0)
    scale.setRange({ maxPrice: 110, minPrice: 90 })
    scale.setBasePrice(100)
    scale.setScaleType('percent')

    expect(scale.toPercent(90)).toBe(-10)
    expect(scale.toPercent(110)).toBe(10)
    expect(scale.priceToY(100)).toBeCloseTo(50)
    expect(scale.yToPrice(50)).toBeCloseTo(100)

    scale.setScaleType('linear')
    expect(scale.priceToY(100)).toBeCloseTo(50)
    expect(scale.priceToY(110)).toBeCloseTo(0)
  })
})
