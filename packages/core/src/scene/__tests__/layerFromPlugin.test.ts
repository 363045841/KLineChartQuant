import { describe, it, expect, vi } from 'vitest'

import { RENDERER_PRIORITY } from '../../plugin'
import type { RendererPlugin, RenderContext } from '../../plugin'
import { createLayerFromPlugin } from '../createLayerFromPlugin'
import type { PaintContext } from '../types'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeMockPlugin(overrides: Partial<RendererPlugin> = {}): RendererPlugin {
  return {
    name: 'test-plugin',
    paneId: 'main',
    priority: RENDERER_PRIORITY.MAIN,
    enabled: true,
    draw: vi.fn(),
    ...overrides,
  }
}

function makeMockContext(): RenderContext {
  return {
    ctx: {} as unknown as CanvasRenderingContext2D,
    pane: {} as unknown as RenderContext['pane'],
    data: [],
    period: 'daily',
    range: { start: 0, end: 10 },
    scrollLeft: 0,
    kWidth: 8,
    kGap: 2,
    dpr: 2,
    paneWidth: 800,
    kLinePositions: [0, 10, 20],
    kLineCenters: [5, 15, 25],
    kBarRects: [
      { x: 0, width: 8 },
      { x: 10, width: 8 },
      { x: 20, width: 8 },
    ],
    theme: 'dark',
  } as unknown as RenderContext
}

const stubPaintCtx = {
  renderer: {} as unknown as PaintContext['renderer'],
  region: { x: 0, y: 0, width: 800, height: 600, dpr: 2 },
  paneRole: 'main' as const,
  paneId: 'main',
  frameNumber: 0,
  deltaMs: 16,
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createLayerFromPlugin', () => {
  it('delegates paint to plugin.draw with context from getContext', () => {
    const plugin = makeMockPlugin()
    const context = makeMockContext()
    const getContext = vi.fn(() => context)
    const layer = createLayerFromPlugin(plugin, getContext, 'main')

    layer.paint(stubPaintCtx)

    expect(getContext).toHaveBeenCalledOnce()
    expect(plugin.draw).toHaveBeenCalledOnce()
    expect(plugin.draw).toHaveBeenCalledWith(context)
  })

  it('skips plugin.draw when getContext returns null', () => {
    const plugin = makeMockPlugin()
    const getContext = vi.fn(() => null)
    const layer = createLayerFromPlugin(plugin, getContext, 'main')

    layer.paint(stubPaintCtx)

    expect(getContext).toHaveBeenCalledOnce()
    expect(plugin.draw).not.toHaveBeenCalled()
  })

  it('skips plugin.draw when visible is false', () => {
    const plugin = makeMockPlugin()
    const context = makeMockContext()
    const getContext = vi.fn(() => context)
    const layer = createLayerFromPlugin(plugin, getContext, 'main')

    layer.visible = false
    layer.paint(stubPaintCtx)

    expect(plugin.draw).not.toHaveBeenCalled()
  })

  it('calls plugin.onUninstall on dispose', () => {
    const onUninstall = vi.fn()
    const plugin = makeMockPlugin({ onUninstall })
    const getContext = vi.fn(() => makeMockContext())
    const layer = createLayerFromPlugin(plugin, getContext, 'main')

    layer.dispose()

    expect(onUninstall).toHaveBeenCalledOnce()
  })

  it('does not throw when dispose is called without onUninstall', () => {
    const plugin = makeMockPlugin({ onUninstall: undefined })
    const getContext = vi.fn(() => makeMockContext())
    const layer = createLayerFromPlugin(plugin, getContext, 'main')

    expect(() => layer.dispose()).not.toThrow()
  })

  it('maps enabled=false to visible=false, enabled=true to visible=true', () => {
    const pluginDisabled = makeMockPlugin({ enabled: false })
    const getContext = vi.fn(() => makeMockContext())
    const layerDisabled = createLayerFromPlugin(pluginDisabled, getContext, 'main')
    expect(layerDisabled.visible).toBe(false)

    const pluginEnabled = makeMockPlugin({ enabled: true })
    const layerEnabled = createLayerFromPlugin(pluginEnabled, getContext, 'main')
    expect(layerEnabled.visible).toBe(true)
  })

  it('defaults visible to true when enabled is undefined', () => {
    const plugin = makeMockPlugin({ enabled: undefined })
    const getContext = vi.fn(() => makeMockContext())
    const layer = createLayerFromPlugin(plugin, getContext, 'main')
    expect(layer.visible).toBe(true)
  })

  it('visible setter updates the field', () => {
    const plugin = makeMockPlugin()
    const getContext = vi.fn(() => makeMockContext())
    const layer = createLayerFromPlugin(plugin, getContext, 'main')

    expect(layer.visible).toBe(true)
    layer.visible = false
    expect(layer.visible).toBe(false)
    layer.visible = true
    expect(layer.visible).toBe(true)
  })

  describe('layer identity fields', () => {
    it('id is plugin: + plugin.name', () => {
      const plugin = makeMockPlugin({ name: 'candle' })
      const layer = createLayerFromPlugin(plugin, () => null, 'main')
      expect(layer.id).toBe('plugin:candle')
    })

    it('z equals plugin.priority', () => {
      const plugin = makeMockPlugin({ priority: 42 })
      const layer = createLayerFromPlugin(plugin, () => null, 'main')
      expect(layer.z).toBe(42)
    })

    it('paneRole is main when targetPaneId is main', () => {
      const layer = createLayerFromPlugin(makeMockPlugin(), () => null, 'main')
      expect(layer.paneRole).toBe('main')
    })

    it('paneRole is sub when targetPaneId is not main', () => {
      const layer = createLayerFromPlugin(makeMockPlugin(), () => null, 'sub')
      expect(layer.paneRole).toBe('sub')
    })

    it('skips paint when paneRole is sub and ctx.paneId does not match targetPaneId', () => {
      const plugin = makeMockPlugin()
      const context = makeMockContext()
      const getContext = vi.fn(() => context)
      const layer = createLayerFromPlugin(plugin, getContext, 'RSI_0')

      // Paint with matching paneId → draws
      layer.paint({ ...stubPaintCtx, paneRole: 'sub', paneId: 'RSI_0' })
      expect(plugin.draw).toHaveBeenCalledTimes(1)

      // Paint with non-matching paneId → skips
      layer.paint({ ...stubPaintCtx, paneRole: 'sub', paneId: 'MACD_0' })
      expect(plugin.draw).toHaveBeenCalledTimes(1)
    })

    it('main pane layers always paint regardless of paneId', () => {
      const plugin = makeMockPlugin()
      const context = makeMockContext()
      const getContext = vi.fn(() => context)
      const layer = createLayerFromPlugin(plugin, getContext, 'main')

      layer.paint({ ...stubPaintCtx, paneRole: 'main', paneId: 'main' })
      expect(plugin.draw).toHaveBeenCalledTimes(1)

      // Main layer paints even with non-matching paneId (it has paneRole 'main')
      layer.paint({ ...stubPaintCtx, paneRole: 'main', paneId: 'other' })
      expect(plugin.draw).toHaveBeenCalledTimes(2)
    })
  })

  describe('role mapping from priority and name', () => {
    it('plugin.layer=overlay maps to role overlay', () => {
      const plugin = makeMockPlugin({
        priority: RENDERER_PRIORITY.MAIN,
        layer: 'overlay',
      })
      const layer = createLayerFromPlugin(plugin, () => null, 'main')
      expect(layer.role).toBe('overlay')
    })

    it('GRID priority maps to background', () => {
      const plugin = makeMockPlugin({
        name: 'gridLines',
        priority: RENDERER_PRIORITY.GRID,
      })
      const layer = createLayerFromPlugin(plugin, () => null, 'main')
      expect(layer.role).toBe('background')
    })

    it('INDICATOR priority maps to indicator', () => {
      const plugin = makeMockPlugin({
        name: 'ma',
        priority: RENDERER_PRIORITY.INDICATOR,
      })
      const layer = createLayerFromPlugin(plugin, () => null, 'main')
      expect(layer.role).toBe('indicator')
    })

    it('candle name with MAIN priority maps to primary', () => {
      const plugin = makeMockPlugin({
        name: 'candle',
        priority: RENDERER_PRIORITY.MAIN,
      })
      const layer = createLayerFromPlugin(plugin, () => null, 'main')
      expect(layer.role).toBe('primary')
    })

    it('drawing name maps to drawing role', () => {
      const plugin = makeMockPlugin({
        name: 'drawing-label-overlay',
        priority: RENDERER_PRIORITY.OVERLAY,
      })
      const layer = createLayerFromPlugin(plugin, () => null, 'main')
      expect(layer.role).toBe('drawing')
    })
  })
})
