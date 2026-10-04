// 验证纵向缩放的价格锚点、padding 与刻度模式。
import { describe, expect, it } from 'vitest'

import { ScaleType } from '@/foundation/types/scaleType'
import { PriceScale } from '../priceScale'

/** 可视价格跨度，用于断言缩放方向。 */
function span(scale: PriceScale): number {
  const { minPrice, maxPrice } = scale.getDisplayRange()
  return maxPrice - minPrice
}

/** 构造带高度、内边距、价格区间、基准价与刻度模式的 PriceScale。 */
function createScale(mode: ScaleType): PriceScale {
  const scale = new PriceScale()
  scale.setHeight(400)
  scale.setPadding(30, 50)
  scale.setRange({ minPrice: 80, maxPrice: 160 })
  scale.setBasePrice(100)
  scale.setScaleType(mode)
  return scale
}

describe('价格轴锚点缩放', () => {
  it.each([ScaleType.Linear, ScaleType.Log, ScaleType.Percent])(
    '%s 刻度在非中心锚点缩放后保持价格坐标',
    (mode) => {
      const scale = createScale(mode)
      const anchorY = 100
      const anchorPrice = scale.yToPrice(anchorY)
      const initialRange = scale.getDisplayRange()
      const initialSpan = initialRange.maxPrice - initialRange.minPrice

      scale.scaleByDelta(-10, anchorY)
      expect(scale.priceToY(anchorPrice)).toBeCloseTo(anchorY, 8)
      expect(span(scale)).toBeLessThan(initialSpan)

      scale.scaleByDelta(10, anchorY)
      // 反向缩放回到初始范围，锚点像素不变。
      expect(scale.priceToY(anchorPrice)).toBeCloseTo(anchorY, 8)
      expect(scale.getDisplayRange().minPrice).toBeCloseTo(initialRange.minPrice, 8)
      expect(scale.getDisplayRange().maxPrice).toBeCloseTo(initialRange.maxPrice, 8)
    },
  )
})
