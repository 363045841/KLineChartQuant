import { describe, expect, it } from 'vitest'
import {
  createMockCanvasContext,
  createMockRenderContext,
  type MockPaneInfoOverrides,
  type MockRenderContextOverrides,
} from '@/engine/__tests__/helpers/renderTestKit'
import { createMockRenderer } from '@/rendering/render/__tests__/helpers/rendererTestKit'

import type { RenderContext } from '../../../foundation/plugin/index'
import type { Renderer } from '../../../rendering/render/Renderer'
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
  sceneRenderer: Renderer,
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
