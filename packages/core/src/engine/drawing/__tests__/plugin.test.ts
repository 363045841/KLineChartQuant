/** 绘图 renderer 的画布层级测试。 */

import { describe, expect, it, vi } from 'vitest'

import type { DrawingPrimitive, RenderContext } from '../../../foundation/plugin/index'
import { createDefaultPrimitiveRendererSet } from '..'
import { LINE_LABEL_NORMAL_OFFSET } from '../labelLayout'
import { createDrawingRendererPlugin } from '../plugin'

describe('createDrawingRendererPlugin', () => {
  /** 绘图必须写入覆盖画布，避免被帧末提交的 GPU K 线覆盖。 */
  it('renders primitives on the overlay canvas when available', () => {
    const mainCtx = {} as CanvasRenderingContext2D
    const overlayCtx = {} as CanvasRenderingContext2D
    const point = vi.fn()
    const plugin = createDrawingRendererPlugin({
      renderers: {
        point,
        line: vi.fn(),
        area: vi.fn(),
        arrow: vi.fn(),
        text: vi.fn(),
      },
    })
    const primitive: DrawingPrimitive = {
      kind: 'point',
      point: { x: 10, y: 20 },
    }

    plugin.draw({
      ctx: mainCtx,
      overlayCtx,
      drawingProjection: {
        primitives: [primitive],
        yAxisLabels: [],
        yAxisRanges: [],
        xAxisLabels: [],
        xAxisRanges: [],
      },
      viewport: { scrollLeft: 0, plotWidth: 800, plotHeight: 400 },
      pane: { height: 400 },
      dpr: 1,
    } as RenderContext)

    expect(point).toHaveBeenCalledWith(overlayCtx, primitive, 1)
  })
})

describe('createDefaultPrimitiveRendererSet', () => {
  /** 端点标签按线段语义位置锚定，并在端点外侧排版。 */
  it.each([
    ['start', 10, 'left'],
    ['center', 50, 'center'],
    ['end', 90, 'right'],
  ] as const)(
    'renders a %s line label at its semantic anchor',
    (position, expectedX, expectedAlign) => {
      const ctx = {
        save: vi.fn(),
        restore: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        fillText: vi.fn(),
        translate: vi.fn(),
        rotate: vi.fn(),
        setLineDash: vi.fn(),
        arc: vi.fn(),
      } as unknown as CanvasRenderingContext2D
      const renderers = createDefaultPrimitiveRendererSet()

      renderers.line(
        ctx,
        {
          kind: 'line',
          a: { x: 10, y: 20 },
          b: { x: 90, y: 20 },
          showEndpoints: false,
          text: { text: '标签', position },
        },
        { left: 0, top: 0, right: 100, bottom: 100 },
        1,
      )

      expect(ctx.translate).toHaveBeenCalledWith(expectedX, 20 - LINE_LABEL_NORMAL_OFFSET)
      expect(ctx.textAlign).toBe(expectedAlign)
    },
  )

  /** 字面量换行控制码必须被拆为多行，不按图元宽度自动折行。 */
  it('renders literal newline text without automatic wrapping', () => {
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      fillText: vi.fn(),
    } as unknown as CanvasRenderingContext2D
    const renderers = createDefaultPrimitiveRendererSet()

    renderers.text(
      ctx,
      { kind: 'text', point: { x: 10, y: 20 }, text: '第一行\\n第二行文字', baseline: 'top' },
      1,
    )

    expect(ctx.fillText).toHaveBeenCalledWith('第一行', 10, 20)
    expect(ctx.fillText).toHaveBeenCalledWith('第二行文字', 10, 34.4)
  })

  /** 线段标签在旋转的局部坐标系中也必须逐行绘制。 */
  it('renders literal newline line labels in the rotated local coordinate system', () => {
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      setLineDash: vi.fn(),
    } as unknown as CanvasRenderingContext2D
    const renderers = createDefaultPrimitiveRendererSet()

    renderers.line(
      ctx,
      {
        kind: 'line',
        a: { x: 10, y: 20 },
        b: { x: 90, y: 20 },
        showEndpoints: false,
        text: { text: '第一行\\n第二行', position: 'center' },
      },
      { left: 0, top: 0, right: 100, bottom: 100 },
      1,
    )

    expect(ctx.fillText).toHaveBeenCalledWith('第一行', 0, expect.closeTo(-14.4, 5))
    expect(ctx.fillText).toHaveBeenCalledWith('第二行', 0, 0)
  })
})
