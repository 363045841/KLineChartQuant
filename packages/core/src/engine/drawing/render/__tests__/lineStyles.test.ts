/** 公共线渲染器验证 Pine 六种线型，以及延伸后箭头与线身的共同裁剪。 */

import { LineStyle } from '@363045841yyt/klinechart-plot-contracts'
import { describe, expect, it } from 'vitest'
import { createMockCanvasContext } from '@/engine/__tests__/helpers/renderTestKit.js'
import { DEFAULT_DRAWING_STROKE } from '@/foundation/tokens/index.js'
import { createDefaultPrimitiveRendererSet } from '../impl/primitiveRendererSet.js'

/** 线型用例不关心手柄填充，取任意实色即可。 */
const HANDLE_FILL = '#101010'

describe('shared line styles', () => {
  it.each([
    { style: LineStyle.solid, strokes: 1 },
    { style: LineStyle.dashed, strokes: 1 },
    { style: LineStyle.dotted, strokes: 1 },
    { style: LineStyle.arrowLeft, strokes: 2 },
    { style: LineStyle.arrowRight, strokes: 2 },
    { style: LineStyle.arrowBoth, strokes: 3 },
  ])('renders $style through the same line primitive', ({ style, strokes }) => {
    const ctx = createMockCanvasContext()
    createDefaultPrimitiveRendererSet({ handleFill: HANDLE_FILL }).line(
      ctx,
      {
        kind: 'line',
        a: { x: 20, y: 20 },
        b: { x: 80, y: 80 },
        showEndpoints: false,
        style: { stroke: DEFAULT_DRAWING_STROKE, strokeStyle: style },
      },
      { left: 0, top: 0, right: 100, bottom: 100 },
      1,
    )
    expect(ctx.strokedPaths).toHaveLength(strokes)
    expect(ctx.dashedPaths.length > 0).toBe(
      style === LineStyle.dashed || style === LineStyle.dotted,
    )
  })

  it('extends left and right while keeping arrowheads at the rendered ends', () => {
    const ctx = createMockCanvasContext()
    createDefaultPrimitiveRendererSet({ handleFill: HANDLE_FILL }).line(
      ctx,
      {
        kind: 'line',
        a: { x: 20, y: 20 },
        b: { x: 80, y: 80 },
        extend: 'both',
        showEndpoints: false,
        style: { stroke: DEFAULT_DRAWING_STROKE, strokeStyle: LineStyle.arrowBoth },
      },
      { left: 0, top: 0, right: 100, bottom: 100 },
      1,
    )
    expect(ctx.strokedPaths[0]).toEqual([
      { x: 0.5, y: 0.5 },
      { x: 100.5, y: 100.5 },
    ])
    expect(ctx.strokedPaths[1]?.[1]).toEqual({ x: 0, y: 0 })
    expect(ctx.strokedPaths[2]?.[1]).toEqual({ x: 100, y: 100 })
  })
})
