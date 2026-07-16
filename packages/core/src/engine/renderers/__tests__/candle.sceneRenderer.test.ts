import { describe, it, expect, vi } from 'vitest'

import type { RenderContext } from '../../../foundation/plugin/index'
import type { Renderer } from '../../../rendering/render/Renderer'
import { createCandleRenderer } from '../candle'

function makePane() {
  return {
    id: 'main',
    top: 0,
    height: 400,
    role: 'price' as const,
    capabilities: {},
    yAxis: {
      getDisplayRange: () => ({ maxPrice: 110, minPrice: 90 }),
      getPaddingTop: () => 10,
      getPaddingBottom: () => 10,
      getScaleType: () => 'linear' as const,
      priceToY: (p: number) => 200 - (p - 100),
    },
    priceRange: { min: 90, max: 110 },
  }
}

function makeSceneRenderer() {
  const compositeTo = vi.fn()
  const drawInstances = vi.fn(() => true)
  const writeBuffer = vi.fn()
  const r: Renderer = {
    surface: {
      isAvailable: () => true,
      resize: () => {},
      bindRegion: () => true,
      clearRegion: () => {},
      compositeTo,
      dispose: () => {},
    },
    caps: { compute: false, storageBuffer: false, maxInstances: 1e6, name: 'webgl2' },
    createBuffer: vi.fn(() => ({}) as never),
    writeBuffer,
    destroyBuffer: vi.fn(),
    createPipeline: vi.fn(() => ({}) as never),
    destroyPipeline: vi.fn(),
    createComputePipeline: () => {
      throw new Error('no')
    },
    destroyComputePipeline: () => {},
    beginFrame: vi.fn(),
    drawInstances,
    drawLines: vi.fn(),
    dispatchCompute: () => {},
    endFrame: vi.fn(),
    dispose: vi.fn(),
  }
  return { r, drawInstances, writeBuffer, compositeTo }
}

describe('candle sceneRenderer path', () => {
  it('draws via sceneRenderer.drawInstances and composites', () => {
    const { r, drawInstances, compositeTo } = makeSceneRenderer()

    const data = Array.from({ length: 5 }, (_, i) => ({
      timestamp: i,
      open: 100,
      high: 105,
      low: 95,
      close: 102,
      volume: 1000,
    }))

    const ctx = {
      ctx: {
        save: vi.fn(),
        restore: vi.fn(),
        translate: vi.fn(),
        fillRect: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        closePath: vi.fn(),
        fill: vi.fn(),
      } as unknown as CanvasRenderingContext2D,
      pane: makePane(),
      data,
      period: 'daily',
      range: { start: 0, end: 5 },
      scrollLeft: 0,
      kWidth: 8,
      kGap: 2,
      dpr: 1,
      paneWidth: 800,
      kLinePositions: [0, 10, 20, 30, 40],
      kLineCenters: [4, 14, 24, 34, 44],
      kBarRects: [],
      theme: 'dark' as const,
      viewport: { scrollLeft: 0, plotWidth: 800, plotHeight: 400 },
      settings: { rendererBackend: 'webgl', showVolumePriceMarkers: false },
      sceneRenderer: r,
      zoomLevel: 1,
    } as unknown as RenderContext

    createCandleRenderer().draw(ctx)

    expect(drawInstances).toHaveBeenCalled()
    expect(compositeTo).toHaveBeenCalledOnce()
  })

  it('falls to Canvas2D when drawInstances returns false (fail-closed)', () => {
    const { r, drawInstances, compositeTo } = makeSceneRenderer()
    drawInstances.mockReturnValue(false)
    const fillRect = vi.fn()

    const data = Array.from({ length: 3 }, (_, i) => ({
      timestamp: i,
      open: 100,
      high: 105,
      low: 95,
      close: 102,
      volume: 1000,
    }))

    const ctx = {
      ctx: {
        save: vi.fn(),
        restore: vi.fn(),
        translate: vi.fn(),
        fillRect,
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        closePath: vi.fn(),
        fill: vi.fn(),
      } as unknown as CanvasRenderingContext2D,
      pane: makePane(),
      data,
      period: 'daily',
      range: { start: 0, end: 3 },
      scrollLeft: 0,
      kWidth: 8,
      kGap: 2,
      dpr: 1,
      paneWidth: 800,
      kLinePositions: [0, 10, 20],
      kLineCenters: [4, 14, 24],
      kBarRects: [],
      theme: 'dark' as const,
      viewport: { scrollLeft: 0, plotWidth: 800, plotHeight: 400 },
      settings: { rendererBackend: 'webgl', showVolumePriceMarkers: false },
      sceneRenderer: r,
      zoomLevel: 1,
    } as unknown as RenderContext

    createCandleRenderer().draw(ctx)

    expect(compositeTo).not.toHaveBeenCalled()
    expect(fillRect).toHaveBeenCalled()
  })
})
