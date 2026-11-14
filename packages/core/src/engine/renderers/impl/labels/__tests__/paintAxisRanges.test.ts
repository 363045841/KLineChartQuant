/** 验证轴区间带按列几何与物理像素绘制，不越过本列。 */
import { describe, expect, it, vi } from 'vitest'
import { createMockCanvasContext } from '@/engine/__tests__/helpers/renderTestKit.js'
import { paintAxisRanges } from '../impl/paintAxisRanges.js'

describe('paintAxisRanges', () => {
  it('fills the axis column with the range band in physical pixels', () => {
    const ctx = createMockCanvasContext()
    paintAxisRanges(
      ctx,
      [{ axisId: 'main', topY: 20, bottomY: 60, color: '#f00', opacity: 0.15 }],
      { dpr: 2, axisWidth: 48, axisHeight: 200, offsetX: 12 },
    )

    expect(ctx.fillRect).toHaveBeenCalledWith(24, 40, 96, 80)
    expect(ctx.globalAlpha).toBe(0.15)
    expect(ctx.fillStyle).toBe('#f00')
  })

  it('normalizes inverted bounds and skips empty or zero-width columns', () => {
    const ctx = createMockCanvasContext()
    paintAxisRanges(ctx, [{ axisId: 'main', topY: 60, bottomY: 20, color: '#0f0', opacity: 0.1 }], {
      dpr: 1,
      axisWidth: 40,
      axisHeight: 200,
    })
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 20, 40, 40)

    vi.mocked(ctx.fillRect).mockClear()
    paintAxisRanges(
      ctx,
      [
        { axisId: 'main', topY: 30, bottomY: 30, color: '#0f0', opacity: 0.1 },
        { axisId: 'main', topY: 10, bottomY: 50, color: '#0f0', opacity: 0.1 },
      ],
      { dpr: 1, axisWidth: 0, axisHeight: 200 },
    )
    expect(ctx.fillRect).not.toHaveBeenCalled()
  })
})
