import { describe, expect, it, vi } from 'vitest'
import {
  createMockCanvasContext,
  createMockRenderContext,
  type MockPaneInfoOverrides,
  type MockRenderContextOverrides,
} from '@/engine/__tests__/helpers/renderTestKit'
import type { RenderContext } from '@/foundation/plugin/index'
import { projectWorldRectToScreen } from '@/foundation/utils/pixelAlign'
import { createMockRenderer } from '@/rendering/render/__tests__/helpers/rendererTestKit'
import type { Renderer } from '@/rendering/render/Renderer'
import { createCandleRenderer } from '../candle'

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
    compositeTo: r.surface.compositeTo,
  }
}

describe('candle sceneRenderer path', () => {
  it('draws via sceneRenderer.drawInstances and composites on webgl', () => {
    const { r, drawInstances, compositeTo } = makeSceneRenderer()

    const ctx = createCtx(r, {
      data: makeBars(5),
      range: { start: 0, end: 5 },
      kLinePositions: [0, 10, 20, 30, 40],
      kLineCenters: [4, 14, 24, 34, 44],
      settings: { rendererBackend: 'webgl', showVolumePriceMarkers: false },
    })

    createCandleRenderer().draw(ctx)

    expect(drawInstances).toHaveBeenCalled()
    expect(compositeTo).not.toHaveBeenCalled()
  })

  it('skips compositeTo when sceneRenderer is webgpu (visible GPU canvas)', () => {
    const { r, drawInstances, compositeTo } = makeSceneRenderer('webgpu')

    const ctx = createCtx(r, {
      data: makeBars(3),
      range: { start: 0, end: 3 },
      kLinePositions: [0, 10, 20],
      kLineCenters: [4, 14, 24],
      settings: { rendererBackend: 'webgpu', showVolumePriceMarkers: false },
    })

    createCandleRenderer().draw(ctx)

    expect(drawInstances).toHaveBeenCalled()
    expect(compositeTo).not.toHaveBeenCalled()
  })

  it('falls to Canvas2D when drawInstances returns false (fail-closed)', () => {
    const { r, drawInstances, compositeTo } = makeSceneRenderer()
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

    createCandleRenderer().draw(ctx)

    expect(compositeTo).not.toHaveBeenCalled()
    expect(ctx2d.fillRect).toHaveBeenCalled()
  })
})

describe('candle preparation', () => {
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
    createCandleRenderer().draw(context)

    const toY = (price: number) => 390 - (price - 90) * 19
    const aligned = (price: number) => Math.round(toY(price) * dpr) / dpr
    const open = aligned(bar.open)
    const close = aligned(bar.close)
    const top = Math.min(open, close)
    const height = Math.max(Math.abs(open - close), 1)
    const topPx = Math.round(top * dpr)
    const bottomPx = Math.round((top + height) * dpr)
    const bodyY = Math.fround(topPx / dpr)
    const bodyH = Math.fround(Math.max(1, bottomPx - topPx) / dpr)
    const centerPx = Math.round(12.5 * dpr)
    const bodyX = Math.fround((centerPx - 2) / dpr)
    const bodyW = Math.fround(5 / dpr)
    const body = projectWorldRectToScreen(bodyX, bodyW, 0.4, dpr)
    const wickX = Math.fround(centerPx / dpr)
    const wick = projectWorldRectToScreen(wickX, 1 / dpr, 0.4, dpr)
    const highY = aligned(bar.high)
    const lowY = aligned(bar.low)
    const upperTop = Math.round(Math.min(highY, bodyY) * dpr)
    const upperBottom = Math.round(Math.max(highY, bodyY) * dpr)
    const rawBodyBottom = (topPx + Math.max(1, bottomPx - topPx)) / dpr
    const lowerTop = Math.round(Math.min(rawBodyBottom, lowY) * dpr)
    const lowerBottom = Math.round(Math.max(rawBodyBottom, lowY) * dpr)
    expect(vi.mocked(ctx2d.fillRect).mock.calls).toEqual([
      [body.x, bodyY, body.width, bodyH],
      [
        wick.x,
        Math.fround(upperTop / dpr),
        wick.width,
        Math.fround(Math.max(1, upperBottom - upperTop) / dpr),
      ],
      [
        wick.x,
        Math.fround(lowerTop / dpr),
        wick.width,
        Math.fround(Math.max(1, lowerBottom - lowerTop) / dpr),
      ],
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
    createCandleRenderer().draw(context)
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
    createCandleRenderer().draw(context)
    expect(manager.register.mock.calls.map(([marker]) => marker.id)).toEqual([
      'mk_price-volume_1',
      'mk_price-volume_2',
    ])
  })
})
