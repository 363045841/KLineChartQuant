// @ts-nocheck - Test file with intentional type relaxations for mocking
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createENERendererPlugin } from '../Indicator/ene'
import { ENE_STATE_KEY, type ENERenderState } from '@/core/indicators/eneState'
import { ENE_COLORS } from '@/core/theme/colors'
import type { PluginHost, RenderContext, RendererPluginWithHost } from '@/plugin'
import type { KLineData } from '@/types/price'
import type { Pane } from '@/core/layout/pane'

// Type helper for tests
interface TestableENERenderer extends RendererPluginWithHost {
  draw: (context: RenderContext) => void
  getConfig: () => Record<string, unknown>
  setConfig: (config: Record<string, unknown>) => void
}

function createMockCanvasContext(): CanvasRenderingContext2D {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    closePath: vi.fn(),
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    lineJoin: '',
    lineCap: '',
  } as unknown as CanvasRenderingContext2D
}

function createMockPluginHost(state?: ENERenderState): PluginHost {
  return {
    setSharedState: vi.fn(),
    getSharedState: vi.fn(<T>(key: string): T | undefined => {
      if (key === ENE_STATE_KEY) {
        return state as T
      }
      return undefined
    }),
    clearByOwner: vi.fn(),
    getCanvas: vi.fn(),
    getMainPane: vi.fn(),
    getSubPane: vi.fn(),
    getAllSubPanes: vi.fn(),
    getTheme: vi.fn(),
    getStyles: vi.fn(),
    getBarStyles: vi.fn(),
    getConfig: vi.fn(),
    setConfig: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    once: vi.fn(),
    emit: vi.fn(),
  } as unknown as PluginHost
}

function createMockRenderContext(
  ctx: CanvasRenderingContext2D,
  overrides: Partial<RenderContext> = {}
): RenderContext {
  const mockPane = {
    yAxis: {
      priceToY: (price: number) => price * 10,
    },
  } as unknown as Pane

  // Create default test data with sufficient length
  const defaultData: KLineData[] = Array.from({ length: 100 }, (_, i) => ({
    timestamp: 1000000000000 + i * 60000,
    open: 100 + i,
    high: 101 + i,
    low: 99 + i,
    close: 100 + i,
    volume: 1000 + i * 100,
  }))

  return {
    ctx,
    data: defaultData,
    range: { start: 0, end: 10 },
    visibleRange: { start: 0, end: 10 },
    crosshair: null,
    crosshairIndex: null,
    dpr: 1,
    scrollLeft: 0,
    pane: mockPane,
    kLineCenters: Array.from({ length: 100 }, (_, i) => i * 10 + 5),
    ...overrides,
  } as RenderContext
}

function createTestENERenderState(overrides: Partial<ENERenderState> = {}): ENERenderState {
  return {
    timestamp: Date.now(),
    series: Array.from({ length: 100 }, (_, i) =>
      i < 9
        ? undefined
        : { upper: 111 + i * 0.1, middle: 100 + i * 0.1, lower: 89 + i * 0.1 }
    ),
    params: {
      period: 10,
      deviation: 11,
    },
    visibleMin: 89,
    visibleMax: 122,
    ...overrides,
  }
}

describe('createENERendererPlugin', () => {
  it('should create a renderer plugin with correct metadata', () => {
    const plugin = createENERendererPlugin()

    expect(plugin.name).toBe('ene')
    expect(plugin.version).toBe('2.1.0')
    expect(plugin.paneId).toBe('main')
  })

  it('should have onInstall method', () => {
    const plugin = createENERendererPlugin()
    expect(typeof plugin.onInstall).toBe('function')
  })

  it('should declare ENE_STATE_KEY namespace', () => {
    const plugin = createENERendererPlugin()
    expect(plugin.getDeclaredNamespaces()).toEqual([ENE_STATE_KEY])
  })
})

describe('ENE renderer draw', () => {
  let ctx: CanvasRenderingContext2D
  let plugin: TestableENERenderer

  beforeEach(() => {
    ctx = createMockCanvasContext()
  })

  it('should not draw when StateStore has no ENE state', () => {
    const mockHost = createMockPluginHost(undefined)
    plugin = createENERendererPlugin() as TestableENERenderer
    plugin.onInstall(mockHost)

    const context = createMockRenderContext(ctx)
    plugin.draw(context)

    expect(ctx.beginPath).not.toHaveBeenCalled()
    expect(ctx.stroke).not.toHaveBeenCalled()
  })

  it('should not draw when state has no valid data', () => {
    const state = createTestENERenderState({
      visibleMin: Infinity,
      visibleMax: -Infinity,
    })
    const mockHost = createMockPluginHost(state)
    plugin = createENERendererPlugin() as TestableENERenderer
    plugin.onInstall(mockHost)

    const context = createMockRenderContext(ctx)
    plugin.draw(context)

    expect(ctx.beginPath).not.toHaveBeenCalled()
    expect(ctx.stroke).not.toHaveBeenCalled()
  })

  it('should save and restore context', () => {
    const state = createTestENERenderState()
    const mockHost = createMockPluginHost(state)
    plugin = createENERendererPlugin() as TestableENERenderer
    plugin.onInstall(mockHost)

    const context = createMockRenderContext(ctx)
    plugin.draw(context)

    expect(ctx.save).toHaveBeenCalledTimes(1)
    expect(ctx.restore).toHaveBeenCalledTimes(1)
  })

  it('should draw band fill', () => {
    const state = createTestENERenderState()
    const mockHost = createMockPluginHost(state)
    plugin = createENERendererPlugin() as TestableENERenderer
    plugin.onInstall(mockHost)

    const context = createMockRenderContext(ctx)
    plugin.draw(context)

    expect(ctx.fill).toHaveBeenCalled()
    expect(ctx.closePath).toHaveBeenCalled()
  })

  it('should draw all three lines (upper, middle, lower)', () => {
    const state = createTestENERenderState()
    const mockHost = createMockPluginHost(state)
    plugin = createENERendererPlugin() as TestableENERenderer
    plugin.onInstall(mockHost)

    const context = createMockRenderContext(ctx)
    plugin.draw(context)

    // Should have stroke calls for the three lines
    expect(ctx.stroke).toHaveBeenCalled()
  })

  it('should use correct line styles', () => {
    const state = createTestENERenderState()
    const mockHost = createMockPluginHost(state)
    plugin = createENERendererPlugin() as TestableENERenderer
    plugin.onInstall(mockHost)

    const context = createMockRenderContext(ctx)
    plugin.draw(context)

    expect(ctx.lineWidth).toBe(1)
    expect(ctx.lineJoin).toBe('round')
    expect(ctx.lineCap).toBe('round')
  })

  it('should use theme colors', () => {
    const state = createTestENERenderState()
    const mockHost = createMockPluginHost(state)
    plugin = createENERendererPlugin() as TestableENERenderer
    plugin.onInstall(mockHost)

    const context = createMockRenderContext(ctx)
    plugin.draw(context)

    // Verify fillStyle was set to band fill color
    expect(ctx.fillStyle).toBe(ENE_COLORS.BAND_FILL)
  })

  it('should skip undefined values at start of series', () => {
    const state = createTestENERenderState({
      series: Array.from({ length: 15 }, (_, i) =>
        i < 9 ? undefined : { upper: 111, middle: 100, lower: 89 }
      ),
    })
    const mockHost = createMockPluginHost(state)
    plugin = createENERendererPlugin() as TestableENERenderer
    plugin.onInstall(mockHost)

    const context = createMockRenderContext(ctx, { range: { start: 0, end: 15 } })

    expect(() => plugin.draw(context)).not.toThrow()
    expect(ctx.stroke).toHaveBeenCalled()
  })
})

describe('ENE renderer config', () => {
  it('getConfig should return current params from StateStore', () => {
    const state = createTestENERenderState({
      params: { period: 15, deviation: 15 },
    })
    const mockHost = createMockPluginHost(state)
    const plugin = createENERendererPlugin() as TestableENERenderer
    plugin.onInstall(mockHost)

    const config = plugin.getConfig()

    expect(config.period).toBe(15)
    expect(config.deviation).toBe(15)
  })

  it('getConfig should return empty object when no state', () => {
    const mockHost = createMockPluginHost(undefined)
    const plugin = createENERendererPlugin() as TestableENERenderer
    plugin.onInstall(mockHost)

    const config = plugin.getConfig()

    expect(config).toEqual({})
  })

  it('setConfig should be a no-op', () => {
    const mockHost = createMockPluginHost(createTestENERenderState())
    const plugin = createENERendererPlugin() as TestableENERenderer
    plugin.onInstall(mockHost)

    expect(() => plugin.setConfig({ period: 25 })).not.toThrow()

    const config = plugin.getConfig()
    expect(config.period).toBe(10) // Original value from state
  })
})
