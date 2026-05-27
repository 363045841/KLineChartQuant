// @ts-nocheck - Test file with intentional type relaxations for mocking
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createEXPMARendererPlugin } from '../Indicator/expma'
import { EXPMA_STATE_KEY, type EXPMARenderState } from '@/core/indicators/expmaState'
import { EXPMA_COLORS } from '@/core/theme/colors'
import type { PluginHost, RenderContext, RendererPluginWithHost } from '@/plugin'
import type { KLineData } from '@/types/price'
import type { Pane } from '@/core/layout/pane'

// Type helper for tests
interface TestableEXPMARenderer extends RendererPluginWithHost {
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
    strokeStyle: '',
    lineWidth: 0,
    lineJoin: '',
    lineCap: '',
  } as unknown as CanvasRenderingContext2D
}

function createMockPluginHost(state?: EXPMARenderState): PluginHost {
  return {
    setSharedState: vi.fn(),
    getSharedState: vi.fn(<T>(key: string): T | undefined => {
      if (key === EXPMA_STATE_KEY) {
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
    height: 200,
    yAxis: {
      priceToY: (price: number) => price * 10,
      getDisplayRange: () => ({ minPrice: 0, maxPrice: 200 }),
      getPriceOffset: () => 0,
      getScaleType: () => 'linear',
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

function createTestEXPMARenderState(overrides: Partial<EXPMARenderState> = {}): EXPMARenderState {
  return {
    timestamp: Date.now(),
    series: Array.from({ length: 100 }, (_, i) => ({
      fast: 100 + i * 0.2,
      slow: 100 + i * 0.1,
    })),
    params: {
      fastPeriod: 12,
      slowPeriod: 50,
    },
    visibleMin: 100,
    visibleMax: 120,
    ...overrides,
  }
}

describe('createEXPMARendererPlugin', () => {
  it('should create a renderer plugin with correct metadata', () => {
    const plugin = createEXPMARendererPlugin()

    expect(plugin.name).toBe('expma')
    expect(plugin.version).toBe('2.1.0')
    expect(plugin.paneId).toBe('main')
  })

  it('should have onInstall method', () => {
    const plugin = createEXPMARendererPlugin()
    expect(typeof plugin.onInstall).toBe('function')
  })

  it('should declare EXPMA_STATE_KEY namespace', () => {
    const plugin = createEXPMARendererPlugin()
    expect(plugin.getDeclaredNamespaces()).toEqual([EXPMA_STATE_KEY])
  })
})

describe('EXPMA renderer draw', () => {
  let ctx: CanvasRenderingContext2D
  let plugin: TestableEXPMARenderer

  beforeEach(() => {
    ctx = createMockCanvasContext()
  })

  it('should not draw when StateStore has no EXPMA state', () => {
    const mockHost = createMockPluginHost(undefined)
    plugin = createEXPMARendererPlugin() as TestableEXPMARenderer
    plugin.onInstall(mockHost)

    const context = createMockRenderContext(ctx)
    plugin.draw(context)

    expect(ctx.beginPath).not.toHaveBeenCalled()
    expect(ctx.stroke).not.toHaveBeenCalled()
  })

  it('should not draw when state has no valid data', () => {
    const state = createTestEXPMARenderState({
      visibleMin: Infinity,
      visibleMax: -Infinity,
    })
    const mockHost = createMockPluginHost(state)
    plugin = createEXPMARendererPlugin() as TestableEXPMARenderer
    plugin.onInstall(mockHost)

    const context = createMockRenderContext(ctx)
    plugin.draw(context)

    expect(ctx.beginPath).not.toHaveBeenCalled()
    expect(ctx.stroke).not.toHaveBeenCalled()
  })

  it('should save and restore context', () => {
    const state = createTestEXPMARenderState()
    const mockHost = createMockPluginHost(state)
    plugin = createEXPMARendererPlugin() as TestableEXPMARenderer
    plugin.onInstall(mockHost)

    const context = createMockRenderContext(ctx)
    plugin.draw(context)

    expect(ctx.save).toHaveBeenCalledTimes(1)
    expect(ctx.restore).toHaveBeenCalledTimes(1)
  })

  it('should draw both fast and slow lines', () => {
    const state = createTestEXPMARenderState()
    const mockHost = createMockPluginHost(state)
    plugin = createEXPMARendererPlugin() as TestableEXPMARenderer
    plugin.onInstall(mockHost)

    const context = createMockRenderContext(ctx)
    plugin.draw(context)

    // Should have stroke calls for both lines
    expect(ctx.stroke).toHaveBeenCalled()
    expect(ctx.beginPath).toHaveBeenCalled()
  })

  it('should use correct line styles', () => {
    const state = createTestEXPMARenderState()
    const mockHost = createMockPluginHost(state)
    plugin = createEXPMARendererPlugin() as TestableEXPMARenderer
    plugin.onInstall(mockHost)

    const context = createMockRenderContext(ctx)
    plugin.draw(context)

    expect(ctx.lineWidth).toBe(1)
    expect(ctx.lineJoin).toBe('round')
    expect(ctx.lineCap).toBe('round')
  })

  it('should draw from index 0 (dense array)', () => {
    const state = createTestEXPMARenderState({
      series: Array.from({ length: 10 }, (_, i) => ({ fast: 100 + i, slow: 100 + i * 0.5 })),
    })
    const mockHost = createMockPluginHost(state)
    plugin = createEXPMARendererPlugin() as TestableEXPMARenderer
    plugin.onInstall(mockHost)

    const context = createMockRenderContext(ctx, { range: { start: 0, end: 10 } })
    plugin.draw(context)

    // EXPMA draws from range.start (0 for dense array)
    expect(ctx.beginPath).toHaveBeenCalled()
  })
})

describe('EXPMA renderer config', () => {
  it('getConfig should return current params from StateStore', () => {
    const state = createTestEXPMARenderState({
      params: { fastPeriod: 20, slowPeriod: 60 },
    })
    const mockHost = createMockPluginHost(state)
    const plugin = createEXPMARendererPlugin() as TestableEXPMARenderer
    plugin.onInstall(mockHost)

    const config = plugin.getConfig()

    expect(config.fastPeriod).toBe(20)
    expect(config.slowPeriod).toBe(60)
  })

  it('getConfig should return empty object when no state', () => {
    const mockHost = createMockPluginHost(undefined)
    const plugin = createEXPMARendererPlugin() as TestableEXPMARenderer
    plugin.onInstall(mockHost)

    const config = plugin.getConfig()

    expect(config).toEqual({})
  })

  it('setConfig should be a no-op', () => {
    const mockHost = createMockPluginHost(createTestEXPMARenderState())
    const plugin = createEXPMARendererPlugin() as TestableEXPMARenderer
    plugin.onInstall(mockHost)

    expect(() => plugin.setConfig({ fastPeriod: 30 })).not.toThrow()

    const config = plugin.getConfig()
    expect(config.fastPeriod).toBe(12) // Original value from state
  })
})
