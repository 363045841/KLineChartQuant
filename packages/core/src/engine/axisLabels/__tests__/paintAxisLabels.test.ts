/** 验证轴标签统一绘制的布局与物理像素对齐规则。 */
import { describe, expect, it, vi } from 'vitest'
import { createMockCanvasContext } from '@/engine/__tests__/helpers/renderTestKit'
import type { AxisTagLabel, AxisTickLabel } from '@/foundation/plugin'
import { paintAxisLabels } from '../index'

/** 最小刻度标签素材。 */
function tick(overrides: Partial<AxisTickLabel> = {}): AxisTickLabel {
  return { kind: 'tick', text: '120.00', pos: 10, color: '#000', ...overrides }
}

/** 最小价格签素材。 */
function tag(overrides: Partial<AxisTagLabel> = {}): AxisTagLabel {
  return {
    kind: 'tag',
    text: '100.00',
    pos: 55,
    bgColor: '#fff',
    textColor: '#000',
    ...overrides,
  }
}

describe('paintAxisLabels', () => {
  it('centers X tick text on the axis height and rounds its x', () => {
    const ctx = createMockCanvasContext()

    paintAxisLabels(ctx, [tick({ pos: 17.4 })], 'xTicks', {
      dpr: 1,
      axisWidth: 330,
      axisHeight: 24,
    })

    // roundToPhysicalPixel(17.4) = 17；alignToPhysicalPixelCenter(12) = 12.5
    expect(ctx.fillText).toHaveBeenCalledWith('120.00', 17, 12.5)
  })

  it('centers Y tick text on the axis width and keeps its y', () => {
    const ctx = createMockCanvasContext()

    paintAxisLabels(ctx, [tick()], 'yRightStatic', { dpr: 1, axisWidth: 80, axisHeight: 200 })

    expect(ctx.fillText).toHaveBeenCalledWith('120.00', 40, 10)
  })

  it('right-aligns Y tick text when requested', () => {
    const ctx = createMockCanvasContext()

    paintAxisLabels(ctx, [tick({ align: 'right' })], 'yRightStatic', {
      dpr: 1,
      axisWidth: 80,
      axisHeight: 200,
    })

    expect(ctx.fillText).toHaveBeenCalledWith('120.00', 76, 10)
  })

  it('lays out a Y label tag with the label baseline', () => {
    const ctx = createMockCanvasContext()

    paintAxisLabels(ctx, [tag()], 'yRightOverlay', { dpr: 1, axisWidth: 80, axisHeight: 200 })

    // rectH = 12 + 4 = 16；yy = 55；rectY = 47
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 47, 80, 16)
    // label 变体：roundToPhysicalPixel(yy) + 1 = 56
    expect(ctx.fillText).toHaveBeenCalledWith('100.00', 40, 56)
  })

  it('lays out a Y crosshair tag on the physical pixel center', () => {
    const ctx = createMockCanvasContext()

    paintAxisLabels(ctx, [tag({ variant: 'crosshair' })], 'yRightOverlay', {
      dpr: 1,
      axisWidth: 80,
      axisHeight: 200,
    })

    expect(ctx.fillText).toHaveBeenCalledWith('100.00', 40, 55.5)
  })

  it('lays out an X tag as a full-height vertical block', () => {
    const ctx = createMockCanvasContext()
    vi.mocked(ctx.measureText).mockReturnValue({ width: 30 } as TextMetrics)

    paintAxisLabels(ctx, [tag({ text: '09:30', pos: 100 })], 'xCrosshair', {
      dpr: 1,
      axisWidth: 330,
      axisHeight: 24,
    })

    // rectW = 30 + 8 * 2 = 46；rectX = 100 - 23 = 77
    expect(ctx.fillRect).toHaveBeenCalledWith(77, 0, 46, 24)
    expect(ctx.fillText).toHaveBeenCalledWith('09:30', 100, 12.5)
  })
})
