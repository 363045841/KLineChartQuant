/** 公共线渲染器验证 Pine 六种线型，以及延伸后箭头与线身的共同裁剪。 */
import { describe, expect, it } from 'vitest'
import { LineStyle } from '@363045841yyt/klinechart-plot-contracts'
import { createMockCanvasContext } from '@/engine/__tests__/helpers/renderTestKit.js'
import { DEFAULT_DRAWING_STROKE } from '@/foundation/tokens/index.js'
import { createDefaultPrimitiveRendererSet } from '../impl/primitiveRendererSet.js'

describe('shared line styles', () => {
  it.each([
    { style: LineStyle.style_solid, strokes: 1 },
    { style: LineStyle.style_dashed, strokes: 1 },
    { style: LineStyle.style_dotted, strokes: 1 },
    { style: LineStyle.style_arrow_left, strokes: 2 },
    { style: LineStyle.style_arrow_right, strokes: 2 },
    { style: LineStyle.style_arrow_both, strokes: 3 },
  ])('renders $style through the same line primitive', ({ style, strokes }) => {
    const ctx = createMockCanvasContext()
    createDefaultPrimitiveRendererSet().line(ctx, {
      kind: 'line', a: { x: 20, y: 20 }, b: { x: 80, y: 80 },
      showEndpoints: false,
      style: { stroke: DEFAULT_DRAWING_STROKE, strokeStyle: style },
    }, { left: 0, top: 0, right: 100, bottom: 100 }, 1)
    expect(ctx.strokedPaths).toHaveLength(strokes)
    expect(ctx.dashedPaths.length > 0).toBe(style === LineStyle.style_dashed || style === LineStyle.style_dotted)
  })

  it('extends left and right while keeping arrowheads at the rendered ends', () => {
    const ctx = createMockCanvasContext()
    createDefaultPrimitiveRendererSet().line(ctx, {
      kind: 'line', a: { x: 20, y: 20 }, b: { x: 80, y: 80 },
      extend: 'both', showEndpoints: false,
      style: { stroke: DEFAULT_DRAWING_STROKE, strokeStyle: LineStyle.style_arrow_both },
    }, { left: 0, top: 0, right: 100, bottom: 100 }, 1)
    expect(ctx.strokedPaths[0]).toEqual([{ x: 0.5, y: 0.5 }, { x: 100.5, y: 100.5 }])
    expect(ctx.strokedPaths[1]?.[1]).toEqual({ x: 0, y: 0 })
    expect(ctx.strokedPaths[2]?.[1]).toEqual({ x: 100, y: 100 })
  })
})
