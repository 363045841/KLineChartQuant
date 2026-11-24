/** 轴区间带：与标签共用原语通道，按列几何铺满整幅宽。 */
import { describe, expect, it } from 'vitest'
import { createMockCanvasContext } from '@/engine/__tests__/helpers/renderTestKit'
import { paintAxisRanges } from '../paintAxisRanges.js'

describe('paintAxisRanges', () => {
  it('把范围带提交为填充原语并复原透明度', () => {
    const ctx = createMockCanvasContext()
    paintAxisRanges(
      ctx,
      [{ axisId: 'price', topY: 10, bottomY: 30, color: '#ff0000', opacity: 0.15 }],
      { dpr: 2, width: 60, offsetX: 4 },
    )
    expect(ctx.fill).toHaveBeenCalledTimes(1)
    expect(ctx.fillStyle).toBe('#ff0000')
    expect(ctx.globalAlpha).toBe(1)
  })

  it.each([
    { label: '空范围', ranges: [], column: { dpr: 1, width: 60, offsetX: 0 } },
    {
      label: '零宽列',
      ranges: [{ axisId: 'price', topY: 10, bottomY: 30, color: '#ff0000', opacity: 1 }],
      column: { dpr: 1, width: 0, offsetX: 0 },
    },
  ])('$label 不提交任何绘制', ({ ranges, column }) => {
    const ctx = createMockCanvasContext()
    paintAxisRanges(ctx, ranges, column)
    expect(ctx.fill).not.toHaveBeenCalled()
  })
})
