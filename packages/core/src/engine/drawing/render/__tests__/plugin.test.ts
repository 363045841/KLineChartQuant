/** 绘图 renderer 的画布层级测试。 */

import { describe, expect, it, vi } from 'vitest'
import {
  createMockCanvasContext,
  createMockRenderContext,
} from '@/engine/__tests__/helpers/renderTestKit'

import type { DrawingPrimitive } from '@/foundation/plugin/index'
import { createCanvas2DRenderer } from '@/rendering/render/backend/createCanvas2DRenderer'
import { createScene } from '@/rendering/scene/createScene'
import { LINE_LABEL_NORMAL_OFFSET } from '../../geometry/impl/labelLayout'
import {
  createDrawingObjectLayer,
  createDrawingOverlayLayer,
  createDrawingSessionLayer,
  createIndicatorDrawingLayer,
} from '../impl/plugin'
import type { RenderObjectDescriptor } from '@/rendering/scene/types'
import { createDefaultPrimitiveRendererSet } from '../impl/primitiveRendererSet'

describe('createDrawingOverlayLayer', () => {
  /** 默认适配器整层提交原语，GPU 目标不能误用行情画布。 */
  it.each(['committed', 'session'] as const)(
    'submits the default %s renderer through the backend',
    (scope) => {
      const drawingCtx = createMockCanvasContext()
      const overlayCtx = createMockCanvasContext()
      const paint = vi.fn(() => true)
      const projection = {
        primitives: [
          {
            kind: 'point',
            point: { x: 10, y: 20 },
            style: { stroke: '#f00' },
          } satisfies DrawingPrimitive,
        ],
        yAxisRanges: [],
        xAxisRanges: [],
        snapLines: [],
      }
      const context = createMockRenderContext({
        ctx: scope === 'committed' ? drawingCtx : overlayCtx,
        drawingCtx,
        overlayCtx,
        drawingProjection: projection,
        sessionDrawingProjection: projection,
        sceneRenderer: { ...createCanvas2DRenderer(), primitives: { paint, dispose() {} } },
      })
      const layer = (scope === 'committed' ? createDrawingOverlayLayer : createDrawingSessionLayer)()
      layer.paint({ ...context, paneId: 'main', clear: false })
      expect(paint).toHaveBeenCalledExactlyOnceWith(
        scope === 'committed' ? drawingCtx : overlayCtx,
        [expect.objectContaining({ kind: 'circle', strokeWidth: 1 })],
        1,
        undefined,
      )
      expect(drawingCtx.fill).not.toHaveBeenCalled()
      expect(overlayCtx.fill).not.toHaveBeenCalled()
    },
  )

  /** 正式图元与会话图元分别写入独立表面，避免被动态清屏和 GPU 覆盖。 */
  it.each(['committed', 'session'] as const)('renders %s primitives on its own canvas', (scope) => {
    const drawingCtx = createMockCanvasContext()
    const overlayCtx = createMockCanvasContext()
    const point = vi.fn()
    const context = createMockRenderContext({
      ctx: scope === 'committed' ? drawingCtx : overlayCtx,
      drawingCtx,
      overlayCtx,
      drawingProjection: {
        primitives: [
          {
            kind: 'point',
            point: { x: 10, y: 20 },
            style: { stroke: '#f00' },
          } satisfies DrawingPrimitive,
        ],
        yAxisRanges: [],
        xAxisRanges: [],
        snapLines: [],
      },
      viewport: { scrollLeft: 0, plotWidth: 800, plotHeight: 400 },
      pane: { height: 400 },
    })
    context.sessionDrawingProjection = context.drawingProjection
    const createLayer = scope === 'committed' ? createDrawingOverlayLayer : createDrawingSessionLayer
    const layer = createLayer({
      renderers: {
        point,
        line: vi.fn(),
        area: vi.fn(),
        arrow: vi.fn(),
        text: vi.fn(),
      },
    })

    layer.paint({ ...context, paneId: 'main', clear: false })

    expect(point).toHaveBeenCalledWith(
      scope === 'committed' ? drawingCtx : overlayCtx,
      { kind: 'point', point: { x: 10, y: 20 }, style: { stroke: '#f00' } },
      1,
    )
  })
})

describe('createIndicatorDrawingLayer', () => {
  /** 混合文字的指标图元必须拆到可见 GPU 与小文字表面，且不得再依赖主 ctx 像素。 */
  it('routes geometry directly to GPU and text to the pane text surface', () => {
    const main = createMockCanvasContext()
    const paint = vi.fn(
      (_primitives: readonly import('@/rendering/primitives/types').PaintPrimitive[]) => true,
    )
    const paintText = vi.fn()
    const context = createMockRenderContext({
      indicatorDrawingProjection: {
        primitives: [
          {
            kind: 'area',
            closed: true,
            points: [
              { x: 10, y: 20 },
              { x: 100, y: 20 },
              { x: 100, y: 40 },
            ],
            style: { stroke: '#f00' },
          },
          { kind: 'text', point: { x: 30, y: 25 }, text: 'PVP', style: { stroke: '#fff' } },
        ],
        yAxisRanges: [],
        xAxisRanges: [],
        snapLines: [],
      },
    })
    const scene = createScene<typeof context>()
    const layer = createIndicatorDrawingLayer()
    expect(layer.kind).toBe('draw-list')
    scene.addLayer(layer)
    scene.paint({
      panes: [
        {
          paneId: 'main',
          context,
          renderer: createCanvas2DRenderer(),
          targets: { main, drawing: null, overlay: null },
          gpuSurface: { canvas: main.canvas, paint, dispose() {} },
          paintText,
          bounds: { width: 800, height: 200 },
          dpr: 1.5,
          frameNumber: 0,
          deltaMs: 0,
          clear: true,
        },
      ],
    })
    expect(paint).toHaveBeenCalledOnce()
    expect(paint.mock.calls[0]?.[0]).toEqual([expect.objectContaining({ kind: 'fill' })])
    expect(paintText).toHaveBeenCalledWith(
      [expect.objectContaining({ kind: 'text', text: 'PVP' })],
      1.5,
      { width: 800, height: 200 },
    )
    expect(main.fillText).not.toHaveBeenCalled()
  })

  /** 非 main 目标即使提供 GPU 主表面也不能把用户 drawing 或预览画到行情表面。 */
  it.each([createDrawingOverlayLayer, createDrawingSessionLayer])(
    'keeps drawing target bands isolated',
    (factory) => {
      const main = createMockCanvasContext()
      const drawing = createMockCanvasContext()
      const overlay = createMockCanvasContext()
      const paint = vi.fn(() => true)
      const projection = {
        primitives: [
          {
            kind: 'point',
            point: { x: 30, y: 40 },
            style: { stroke: '#f00' },
          } satisfies DrawingPrimitive,
        ],
        yAxisRanges: [],
        xAxisRanges: [],
        snapLines: [],
      }
      const context = createMockRenderContext({
        drawingProjection: projection,
        sessionDrawingProjection: projection,
      })
      const layer = factory()
      const scene = createScene<typeof context>()
      scene.addLayer(layer)
      scene.paint({
        panes: [
          {
            paneId: 'main',
            context,
            renderer: createCanvas2DRenderer(),
            targets: { main, drawing, overlay },
            gpuSurface: { canvas: main.canvas, paint, dispose() {} },
            bounds: { width: 800, height: 200 },
            dpr: 1,
            frameNumber: 0,
            deltaMs: 0,
            clear: false,
          },
        ],
      })
      expect(paint).not.toHaveBeenCalled()
      expect((layer.role === 'drawing' ? drawing : overlay).arc).toHaveBeenCalled()
      expect(main.arc).not.toHaveBeenCalled()
    },
  )

  /** 指标图元并入 main 目标，不再写入独立 drawing 画布。 */
  it('paints indicator projections on the main target', () => {
    const mainCtx = createMockCanvasContext()
    const drawingCtx = createMockCanvasContext()
    const point = vi.fn()
    const primitive = {
      kind: 'point',
      point: { x: 10, y: 20 },
      style: { stroke: '#f00' },
    } satisfies DrawingPrimitive
    const projection = {
      primitives: [primitive],
      yAxisRanges: [],
      xAxisRanges: [],
      snapLines: [],
    }
    const context = createMockRenderContext({
      ctx: mainCtx,
      drawingCtx,
      indicatorDrawingProjection: projection,
      viewport: { scrollLeft: 0, plotWidth: 800, plotHeight: 400 },
      pane: { height: 400 },
    })
    const layer = createIndicatorDrawingLayer({
      renderers: {
        point,
        line: vi.fn(),
        area: vi.fn(),
        arrow: vi.fn(),
        text: vi.fn(),
      },
    })

    expect(layer.role).toBe('indicator')
    layer.paint({ ...context, paneId: 'main', clear: false })
    expect(point).toHaveBeenCalledWith(mainCtx, primitive, 1)
    expect(drawingCtx.fill).not.toHaveBeenCalled()
  })
})

describe('createDrawingObjectLayer', () => {
  /** 每图元对象层只提交自己的投影切片，不会读到其他图元的原语。 */
  it('submits only the primitives of its own object', () => {
    const paint = vi.fn(() => true)
    const primitive = {
      kind: 'point',
      point: { x: 10, y: 20 },
      style: { stroke: '#f00' },
    } satisfies DrawingPrimitive
    const object: RenderObjectDescriptor = {
      kind: 'drawing',
      label: '趋势线',
      capabilities: {
        removable: true,
        hideable: true,
        orderable: true,
        movable: false,
        lockable: true,
      },
      commands: {
        setVisible: () => true,
        setLocked: () => true,
        move: () => false,
        remove: () => true,
      },
    }
    const context = createMockRenderContext({
      drawingObjectProjections: new Map([['d1', [primitive]]]),
      sceneRenderer: { ...createCanvas2DRenderer(), primitives: { paint, dispose() {} } },
    })
    const layer = createDrawingObjectLayer('d1', 'main', object)

    expect(layer.pane).toBe('main')
    layer.paint({ ...context, paneId: 'main', clear: false })
    expect(paint).toHaveBeenCalledTimes(1)
  })
})

describe('createDefaultPrimitiveRendererSet', () => {
  /** 注入的手柄填充色，与被测主题无关。 */
  const HANDLE_FILL = '#101010'

  /** 手柄填充取注入的背景色，不写死白色，明暗主题才都不会错。 */
  it('fills handles with the injected background color', () => {
    const ctx = createMockCanvasContext()
    createDefaultPrimitiveRendererSet({ handleFill: HANDLE_FILL }).point(
      ctx,
      { kind: 'point', point: { x: 10, y: 20 }, style: { stroke: '#f00' } },
      1,
    )
    expect(ctx.fillStyle).toBe(HANDLE_FILL)
  })

  /** 端点标签按线段语义位置锚定，并在端点外侧排版。 */
  it.each([
    ['start', 10, 'left'],
    ['center', 50, 'center'],
    ['end', 90, 'right'],
  ] as const)(
    'renders a %s line label at its semantic anchor',
    (position, expectedX, expectedAlign) => {
      const ctx = createMockCanvasContext()
      const renderers = createDefaultPrimitiveRendererSet({ handleFill: HANDLE_FILL })

      renderers.line(
        ctx,
        {
          kind: 'line',
          a: { x: 10, y: 20 },
          b: { x: 90, y: 20 },
          showEndpoints: false,
          style: { stroke: '#f00' },
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
    const ctx = createMockCanvasContext()
    const renderers = createDefaultPrimitiveRendererSet({ handleFill: HANDLE_FILL })

    renderers.text(
      ctx,
      {
        kind: 'text',
        point: { x: 10, y: 20 },
        text: '第一行\\n第二行文字',
        baseline: 'top',
        style: { stroke: '#f00' },
      },
      1,
    )

    expect(ctx.fillText).toHaveBeenCalledWith('第一行', 10, 20)
    expect(ctx.fillText).toHaveBeenCalledWith('第二行文字', 10, 34.4)
  })

  /** 线段标签在旋转的局部坐标系中也必须逐行绘制。 */
  it('renders literal newline line labels in the rotated local coordinate system', () => {
    const ctx = createMockCanvasContext()
    const renderers = createDefaultPrimitiveRendererSet({ handleFill: HANDLE_FILL })

    renderers.line(
      ctx,
      {
        kind: 'line',
        a: { x: 10, y: 20 },
        b: { x: 90, y: 20 },
        showEndpoints: false,
        style: { stroke: '#f00' },
        text: { text: '第一行\\n第二行', position: 'center' },
      },
      { left: 0, top: 0, right: 100, bottom: 100 },
      1,
    )

    expect(ctx.fillText).toHaveBeenCalledWith('第一行', 0, expect.closeTo(-14.4, 5))
    expect(ctx.fillText).toHaveBeenCalledWith('第二行', 0, 0)
  })

  /** 线身虚线不得传染到锚点环：虚线只作用于线本身。 */
  it('keeps anchor rings solid on a dashed line', () => {
    const ctx = createMockCanvasContext()
    const renderers = createDefaultPrimitiveRendererSet({ handleFill: HANDLE_FILL })

    renderers.line(
      ctx,
      {
        kind: 'line',
        a: { x: 10, y: 20 },
        b: { x: 90, y: 20 },
        style: { stroke: '#f00', strokeWidth: 1, strokeStyle: 'dashed' },
      },
      { left: 0, top: 0, right: 100, bottom: 100 },
      1,
    )

    // 三次描边：线身 + 两个锚点环；只有线身带 dash。
    expect(ctx.strokedPaths).toHaveLength(3)
    expect(ctx.dashedPaths).toHaveLength(1)
  })
})
