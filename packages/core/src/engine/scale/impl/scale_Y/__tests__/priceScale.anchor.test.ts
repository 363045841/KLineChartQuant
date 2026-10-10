// 验证价格轴范围的纯平移/缩放计算与刻度模式。
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

describe('价格轴范围纯计算', () => {
  it.each([ScaleType.Linear, ScaleType.Log, ScaleType.Percent])(
    '%s 刻度在非中心锚点缩放后保持价格坐标',
    (mode) => {
      const scale = createScale(mode)
      const anchorY = 100
      const anchorPrice = scale.yToPrice(anchorY)
      const initialRange = scale.getDisplayRange()
      const initialSpan = initialRange.maxPrice - initialRange.minPrice

      const zoomed = scale.scaleRange(initialRange, -10, anchorY)
      scale.setRange(zoomed)
      expect(scale.priceToY(anchorPrice)).toBeCloseTo(anchorY, 8)
      expect(span(scale)).toBeLessThan(initialSpan)

      // 反向缩放回到初始范围，锚点像素不变。
      scale.setRange(scale.scaleRange(zoomed, 10, anchorY))
      expect(scale.priceToY(anchorPrice)).toBeCloseTo(anchorY, 8)
      expect(scale.getDisplayRange().minPrice).toBeCloseTo(initialRange.minPrice, 8)
      expect(scale.getDisplayRange().maxPrice).toBeCloseTo(initialRange.maxPrice, 8)
    },
  )

  it('translateRange 平移视窗但不改变跨度', () => {
    const scale = createScale(ScaleType.Linear)
    const initial = scale.getDisplayRange()
    // viewHeight = 400 - 30 - 50 = 320；36px 对应 80 跨度中的 9 个价格。
    const moved = scale.translateRange(initial, 36)
    expect(moved.maxPrice - moved.minPrice).toBeCloseTo(initial.maxPrice - initial.minPrice, 8)
    expect(moved.minPrice - initial.minPrice).toBeCloseTo(9, 8)
  })
})
