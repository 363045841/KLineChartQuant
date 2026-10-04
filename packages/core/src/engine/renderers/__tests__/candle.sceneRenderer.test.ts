import { describe, expect, it, vi } from 'vitest'
import {
  createMockCanvasContext,
  createMockRenderContext,
  type MockPaneInfoOverrides,
  type MockRenderContextOverrides,
} from '@/engine/__tests__/helpers/renderTestKit'
import type { RenderContext } from '@/foundation/plugin/index'
import { createMockRenderer } from '@/rendering/render/__tests__/helpers/rendererTestKit'
import type { Renderer } from '@/rendering/render/Renderer'
import { createCandleLayer } from '../candle'

/** 以主图身份调用 K 线 Layer.paint；sceneRenderer 由上下文携带。 */
function paint(context: RenderContext): void {
  createCandleLayer().paint({ ...context, paneId: 'main', clear: false })
}

/** 构造蜡烛图 renderer 关心的 pane 差异项。 */
function makePane(): MockPaneInfoOverrides {
  return {
    id: 'main',
    top: 0,
    height: 400,
    role: 'price',
    priceRange: { minPrice: 90, maxPrice: 110 },
    yAxis: {
      getDisplayRange: () => ({ maxPrice: 110, minPrice: 90 }),
      getPaddingTop: () => 10,
      getPaddingBottom: () => 10,
      getScaleType: () => 'linear',
      priceToY: (p) => 200 - (p - 100),
    },
  }
}

/** 构造蜡烛图 renderer 所需的最小上下文，只覆盖用例声明的差异。 */
function createCtx(
  sceneRenderer: Renderer | undefined,
  overrides: MockRenderContextOverrides = {},
): RenderContext {
  return createMockRenderContext({
    pane: makePane(),
    kWidth: 8,
    kGap: 2,
    dpr: 1,
    paneWidth: 800,
    kBarRects: [],
    theme: 'dark',
    viewport: { scrollLeft: 0, plotWidth: 800, plotHeight: 400 },
    sceneRenderer,
    zoomLevel: 1,
    ...overrides,
  })
}

/** 构造等值蜡烛序列。 */
function makeBars(length: number) {
  return Array.from({ length }, (_, i) => ({
    timestamp: i,
    open: 100,
    high: 105,
    low: 95,
    close: 102,
    volume: 1000,
  }))
}

function makeSceneRenderer(capsName = 'webgl2') {
  const r = createMockRenderer({ capsName })
  return {
    r,
    drawInstances: r.drawInstances,
    writeBuffer: r.writeBuffer,
  }
}

describe('candle sceneRenderer path', () => {
  it('draws via sceneRenderer.drawInstances on webgl', () => {
    const { r, drawInstances } = makeSceneRenderer()

    const ctx = createCtx(r, {
      data: makeBars(5),
      range: { start: 0, end: 5 },
      kLinePositions: [0, 10, 20, 30, 40],
      kLineCenters: [4, 14, 24, 34, 44],
      settings: { rendererBackend: 'webgl', showVolumePriceMarkers: false },
    })

    paint(ctx)

    expect(drawInstances).toHaveBeenCalled()
  })

  it('draws via sceneRenderer.drawInstances when sceneRenderer is webgpu', () => {
    const { r, drawInstances } = makeSceneRenderer('webgpu')

    const ctx = createCtx(r, {
      data: makeBars(3),
      range: { start: 0, end: 3 },
      kLinePositions: [0, 10, 20],
      kLineCenters: [4, 14, 24],
      settings: { rendererBackend: 'webgpu', showVolumePriceMarkers: false },
    })

    paint(ctx)

    expect(drawInstances).toHaveBeenCalled()
  })

  it('falls to Canvas2D when drawInstances returns false (fail-closed)', () => {
    const { r, drawInstances } = makeSceneRenderer()
    drawInstances.mockReturnValue(false)
    const ctx2d = createMockCanvasContext()

    const ctx = createCtx(r, {
      ctx: ctx2d,
      data: makeBars(3),
      range: { start: 0, end: 3 },
      kLinePositions: [0, 10, 20],
      kLineCenters: [4, 14, 24],
      settings: { rendererBackend: 'webgl', showVolumePriceMarkers: false },
    })

    paint(ctx)

    expect(ctx2d.fillRect).toHaveBeenCalled()
  })
})

describe('candle preparation', () => {
  it.each([1, 1.25, 1.5, 2, 3])('doji body stays one physical pixel high at DPR=%s', (dpr) => {
    const canvas = createMockCanvasContext()
    paint(
      createCtx(undefined, {
        ctx: canvas,
        data: [{ timestamp: 1, open: 100, close: 100, high: 105, low: 95 }],
        range: { start: 0, end: 1 },
        kLineCenters: [100],
        kWidthPx: 5,
        dpr,
        settings: { showVolumePriceMarkers: false },
      }),
    )
    const rectangles = vi.mocked(canvas.fillRect).mock.calls
    expect(rectangles[0]![3] * dpr).toBeCloseTo(1, 5)
    for (const rectangle of rectangles) {
      for (const value of rectangle) {
        expect(value * dpr).toBeCloseTo(Math.round(value * dpr), 4)
      }
    }
  })

  it.each([1, 1.25, 1.5, 2, 3].flatMap((dpr) => [30, 31].map((bodyPx) => ({ dpr, bodyPx }))))(
    'both wick tiers stay centered across backends at DPR=$dpr and body width=$bodyPx',
    ({ dpr, bodyPx }) => {
      const canvas = createMockCanvasContext()
      const layer = createCandleLayer()
      const { r, writeBuffer } = makeSceneRenderer()
      const context = createCtx(undefined, {
        ctx: canvas,
        dataRevision: 1,
        data: makeBars(1),
        range: { start: 0, end: 1 },
        kLineCenters: [100],
        dpr,
        settings: { showVolumePriceMarkers: false },
      })
      // 实体宽度和数据版本不变，验证级别切换独立使影线缓存失效。
      for (const { zoomLevel, wickPx } of [
        { zoomLevel: 1, wickPx: 1 },
        { zoomLevel: 9, wickPx: 1 },
        { zoomLevel: 10, wickPx: 2 },
        { zoomLevel: 20, wickPx: 2 },
        { zoomLevel: 9, wickPx: 1 },
      ]) {
        vi.mocked(canvas.fillRect).mockClear()
        writeBuffer.mockClear()
        const projected = { ...context, kWidthPx: bodyPx, kWidth: bodyPx / dpr, zoomLevel }
        layer.paint(projected)
        const rectangles = vi.mocked(canvas.fillRect).mock.calls
        expect(rectangles).toHaveLength(3)
        const body = rectangles[0]!
        expect(body[0] * dpr).toBeCloseTo(Math.round(body[0] * dpr), 5)
        expect((body[2] * dpr) % 2).toBeCloseTo(wickPx % 2, 5)
        for (const wick of rectangles.slice(1)) {
          expect(wick[2] * dpr).toBeCloseTo(wickPx, 5)
          expect(wick[0] * dpr).toBeCloseTo(Math.round(wick[0] * dpr), 5)
          expect(wick[0] + wick[2] / 2).toBeCloseTo(body[0] + body[2] / 2, 5)
          const leftMargin = wick[0] - body[0]
          const rightMargin = body[0] + body[2] - wick[0] - wick[2]
          expect(leftMargin).toBeCloseTo(rightMargin, 5)
          expect(leftMargin * dpr).toBeCloseTo(Math.round(leftMargin * dpr), 5)
        }
        layer.paint({ ...projected, sceneRenderer: r })
        const batches = writeBuffer.mock.calls.map(([, data]) => data)
        expect(batches).toHaveLength(2)
        const wicks = batches[1]
        const bodies = batches[0]
        if (!(bodies instanceof Float32Array)) throw new Error('Missing body geometry')
        expect(wicks).toBeInstanceOf(Float32Array)
        if (!(wicks instanceof Float32Array)) throw new Error('Missing wick geometry')
        expect(wicks[2]).toBe(wickPx)
        expect(wicks[6]).toBe(wickPx)
        for (const offset of [0, 4]) {
          // GPU 批次直接存整数物理像素，几何中心必须完全相等。
          expect(Number.isInteger(wicks[offset])).toBe(true)
          expect(wicks[offset]! + wicks[offset + 2]! / 2).toBe(bodies[0]! + bodies[2]! / 2)
        }
      }
      layer.dispose()
    },
  )

  it('retains unchanged geometry, replays after another chart, and invalidates on data updates', () => {
    const closeRead = vi.fn(() => 102)
    const canvas = createMockCanvasContext()
    const context = createCtx(undefined, {
      ctx: canvas,
      dataRevision: 1,
      data: [
        {
          timestamp: 1,
          open: 100,
          high: 105,
          low: 95,
          get close() {
            return closeRead()
          },
        },
      ],
      range: { start: 0, end: 1 },
      kLineCenters: [10],
      settings: { showVolumePriceMarkers: false },
    })
    const layer = createCandleLayer()
    layer.paint(context)
    const firstRects = [...vi.mocked(canvas.fillRect).mock.calls]
    const reads = closeRead.mock.calls.length

    // 另一个图表生成不同几何不能覆盖本 Layer 保留的缓冲。
    paint(
      createCtx(undefined, {
        data: makeBars(1),
        range: { start: 0, end: 1 },
        kLineCenters: [200],
      }),
    )
    vi.mocked(canvas.fillRect).mockClear()
    layer.paint({ ...context, data: [...context.data], kLineCenters: [10] })
    expect(closeRead).toHaveBeenCalledTimes(reads)
    expect(vi.mocked(canvas.fillRect).mock.calls).toEqual(firstRects)

    closeRead.mockReturnValue(104)
    vi.mocked(canvas.fillRect).mockClear()
    layer.paint({ ...context, dataRevision: 2 })
    expect(closeRead.mock.calls.length).toBeGreaterThan(reads)
    expect(vi.mocked(canvas.fillRect).mock.calls).not.toEqual(firstRects)
    layer.dispose()
  })

  it.each([
    { dpr: 2 },
    { kWidthPx: 9 },
    { kLineCenters: [30] },
    { pane: { height: 600 } },
    { pane: { yAxis: { getDisplayRange: () => ({ minPrice: 80, maxPrice: 120 }) } } },
  ])('invalidates retained geometry when projection changes: %j', (changes) => {
    const context = createCtx(undefined, {
      dataRevision: 1,
      data: makeBars(1),
      range: { start: 0, end: 1 },
      kLineCenters: [10],
    })
    const retainedLayer = createCandleLayer()
    retainedLayer.paint(context)
    const changed = createCtx(undefined, {
      dataRevision: 1,
      data: makeBars(1),
      range: { start: 0, end: 1 },
      kLineCenters: [10],
      ...changes,
    })
    retainedLayer.paint(changed)
    const actual = [...vi.mocked(changed.ctx.fillRect).mock.calls]
    vi.mocked(changed.ctx.fillRect).mockClear()
    paint(changed)
    expect(vi.mocked(changed.ctx.fillRect).mock.calls).toEqual(actual)
    retainedLayer.dispose()
  })

  it.each([1, 1.25, 2])('keeps body and wick pixels at dpr %s', (dpr) => {
    const ctx2d = createMockCanvasContext()
    const bar = { timestamp: 1, open: 100, close: 100.3, high: 100.9, low: 99.6, volume: 1 }
    const context = createCtx(undefined, {
      ctx: ctx2d,
      sceneRenderer: undefined,
      data: [bar],
      range: { start: 0, end: 1 },
      kLineCenters: [12.5],
      scrollLeft: 0.4,
      dpr,
      kWidthPx: 5,
      settings: { showVolumePriceMarkers: false },
    })
    paint(context)

    const toY = (price: number) => 390 - (price - 90) * 19
    const aligned = (price: number) => Math.round(toY(price) * dpr) / dpr
    const open = aligned(bar.open)
    const close = aligned(bar.close)
    const top = Math.min(open, close)
    const height = Math.max(Math.abs(open - close), 1 / dpr)
    const topPx = Math.round(top * dpr)
    const bottomPx = Math.round((top + height) * dpr)
    const bodyY = topPx / dpr
    const bodyH = Math.max(1, bottomPx - topPx) / dpr
    const centerPx = Math.round(12.5 * dpr)
    const bodyPx = 5
    const scrollPx = Math.round(0.4 * dpr)
    const body = { x: (centerPx - 2 - scrollPx) / dpr, width: bodyPx / dpr }
    const wickPx = 1
    const wick = { x: (centerPx - scrollPx) / dpr, width: wickPx / dpr }
    const highY = aligned(bar.high)
    const lowY = aligned(bar.low)
    const upperTop = Math.round(Math.min(highY, bodyY) * dpr)
    const upperBottom = Math.round(Math.max(highY, bodyY) * dpr)
    const rawBodyBottom = (topPx + Math.max(1, bottomPx - topPx)) / dpr
    const lowerTop = Math.round(Math.min(rawBodyBottom, lowY) * dpr)
    const lowerBottom = Math.round(Math.max(rawBodyBottom, lowY) * dpr)
    expect(vi.mocked(ctx2d.fillRect).mock.calls).toEqual([
      [body.x, bodyY, body.width, bodyH],
      [wick.x, upperTop / dpr, wick.width, Math.max(1, upperBottom - upperTop) / dpr],
      [wick.x, lowerTop / dpr, wick.width, Math.max(1, lowerBottom - lowerTop) / dpr],
    ])
  })

  it('does not analyze volume when markers are below the zoom threshold', () => {
    const volumeRead = vi.fn(() => 1000)
    const data = makeBars(5).map((bar) => ({
      ...bar,
      get volume() {
        return volumeRead()
      },
    }))
    const manager = {
      getCustomMarkers: () => [],
      setCustomMarkerPosition: () => {},
      register: vi.fn((_marker: { id: string }) => {}),
    }
    const context = createCtx(undefined, {
      sceneRenderer: undefined,
      data,
      range: { start: 0, end: 5 },
      kLineCenters: [4, 14, 24, 34, 44],
      zoomLevel: 1,
      markerManager: manager,
    })
    paint(context)
    expect(volumeRead).not.toHaveBeenCalled()
  })

  it('registers visible volume price markers in their original order', () => {
    const manager = {
      getCustomMarkers: () => [],
      setCustomMarkerPosition: () => {},
      register: vi.fn((_marker: { id: string }) => {}),
    }
    const data = makeBars(3)
    data[2] = { ...data[2]!, close: 98 }
    const context = createCtx(undefined, {
      sceneRenderer: undefined,
      data,
      range: { start: 0, end: 3 },
      kLineCenters: [4, 14, 24],
      markerManager: manager,
      zoomLevel: 2,
    })
    paint(context)
    expect(manager.register.mock.calls.map(([marker]) => marker.id)).toEqual([
      'mk_price-volume_1',
      'mk_price-volume_2',
    ])
  })
})
