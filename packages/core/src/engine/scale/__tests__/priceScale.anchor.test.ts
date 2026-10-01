// 验证纵向缩放的价格锚点、padding 与刻度模式。
import { describe, expect, it } from 'vitest'

import { ScaleType } from '../../../foundation/types/scaleType.js'
import { PriceScale } from '../priceScale.js'

describe('价格轴锚点缩放', () => {
  it.each([ScaleType.Linear, ScaleType.Log, ScaleType.Percent])(
    '%s 刻度在非中心锚点缩放后保持价格坐标',
    (mode) => {
      const scale = new PriceScale()
      scale.setHeight(400)
      scale.setPadding(30, 50)
      scale.setRange({ minPrice: 80, maxPrice: 160 })
      scale.setBasePrice(100)
      scale.setScaleType(mode)
      const initialRange = scale.getDisplayRange()
      const anchorY = 100
      const price = scale.yToPrice(anchorY)
      const nearbyY = scale.priceToY(110)

      scale.scaleByDelta(-10, anchorY)
      expect(scale.priceToY(price)).toBeCloseTo(anchorY, 8)
      expect(Math.abs(scale.priceToY(110) - anchorY)).toBeGreaterThan(Math.abs(nearbyY - anchorY))

      scale.scaleByDelta(10, anchorY)
      expect(scale.priceToY(price)).toBeCloseTo(anchorY, 8)
      expect(scale.getDisplayRange().minPrice).toBeCloseTo(initialRange.minPrice, 8)
      expect(scale.getDisplayRange().maxPrice).toBeCloseTo(initialRange.maxPrice, 8)
    },
  )

  it('达到缩放上限后继续滚动不会移动锚点', () => {
    const scale = new PriceScale()
    scale.setHeight(400)
    scale.setRange({ minPrice: 80, maxPrice: 160 })
    const price = scale.yToPrice(80)
    scale.scaleByDelta(-1000, 80)
    const range = scale.getDisplayRange()
    scale.scaleByDelta(-1000, 80)
    expect(scale.getDisplayRange()).toEqual(range)
    expect(scale.priceToY(price)).toBeCloseTo(80)
  })
})
