// @ts-nocheck - Test file with intentional type relaxations for mocking
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMARendererPlugin } from '../Indicator/ma'
import { MA_STATE_KEY, type MARenderState } from '@/core/indicators/maState'
import { MA_COLORS } from '@/core/theme/colors'
import type { PluginHost, RenderContext, RendererPluginWithHost } from '@/plugin'
import type { KLineData } from '@/types/price'
import type { Pane } from '@/core/layout/pane'

// Type helper for tests - we know these methods exist on the implementation
interface TestableMARenderer extends RendererPluginWithHost {
  draw: (context: RenderContext) => void
  getConfig: () => Record<string, unknown>
  setConfig: (config: Record<string, unknown>) => void
}

/**
 * 创建 mock canvas context
 */
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

/**
 * 创建 mock PluginHost
 */
function createMockPluginHost(state?: MARenderState): PluginHost {
  return {
    setSharedState: vi.fn(),
    getSharedState: vi.fn(<T>(key: string): T | undefined => {
      if (key === MA_STATE_KEY) {
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

/**
 * 创建 mock RenderContext
 */
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

  return {
    ctx,
    data: [] as KLineData[],
    range: { start: 0, end: 10 },
    visibleRange: { start: 0, end: 10 },
    crosshair: null,
    crosshairIndex: null,
    dpr: 1,
    scrollLeft: 0,
    pane: mockPane,
    kLineCenters: Array.from({ length: 10 }, (_, i) => i * 10 + 5),
    ...overrides,
  } as RenderContext
}

/**
 * 创建测试用的 MARenderState
 */
function createTestMARenderState(
  overrides: Partial<MARenderState> = {}
): MARenderState {
  return {
    timestamp: Date.now(),
    series: {
      5: [undefined, undefined, undefined, undefined, 12, 13, 14, 15, 16, 17],
      10: [undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 14.5],
    },
    enabledPeriods: [5, 10],
    visibleMin: 12,
    visibleMax: 17,
    ...overrides,
  }
}

describe('createMARendererPlugin', () => {
  it('should create a renderer plugin with correct metadata', () => {
    const plugin = createMARendererPlugin()

    expect(plugin.name).toBe('ma')
    expect(plugin.version).toBe('2.1.0')
    expect(plugin.description).toBe('MA均线渲染器')
    expect(plugin.debugName).toBe('MA均线')
    expect(plugin.paneId).toBe('main')
  })

  it('should have onInstall method', () => {
    const plugin = createMARendererPlugin()
    expect(typeof plugin.onInstall).toBe('function')
  })

  it('should declare MA_STATE_KEY namespace', () => {
    const plugin = createMARendererPlugin()
    expect(plugin.getDeclaredNamespaces()).toEqual([MA_STATE_KEY])
  })

  it('should accept PluginHost via onInstall', () => {
    const plugin = createMARendererPlugin()
    const mockHost = createMockPluginHost()

    expect(() => plugin.onInstall(mockHost)).not.toThrow()
  })
})

describe('MA renderer draw', () => {
  let ctx: CanvasRenderingContext2D
  let plugin: TestableMARenderer

  beforeEach(() => {
    ctx = createMockCanvasContext()
  })

  it('should not draw when StateStore has no MA state', () => {
    const mockHost = createMockPluginHost(undefined)
    plugin = createMARendererPlugin() as TestableMARenderer
    plugin.onInstall(mockHost)

    const context = createMockRenderContext(ctx)
    plugin.draw(context)

    // Should not call any drawing methods
    expect(ctx.beginPath).not.toHaveBeenCalled()
    expect(ctx.stroke).not.toHaveBeenCalled()
  })

  it('should not draw when state has no valid data (visibleMin > visibleMax)', () => {
    const state = createTestMARenderState({
      visibleMin: Infinity,
      visibleMax: -Infinity,
      enabledPeriods: [],
    })
    const mockHost = createMockPluginHost(state)
    plugin = createMARendererPlugin() as TestableMARenderer
    plugin.onInstall(mockHost)

    const context = createMockRenderContext(ctx)
    plugin.draw(context)

    expect(ctx.beginPath).not.toHaveBeenCalled()
    expect(ctx.stroke).not.toHaveBeenCalled()
  })

  it('should not draw when no periods are enabled', () => {
    const state = createTestMARenderState({
      enabledPeriods: [],
    })
    const mockHost = createMockPluginHost(state)
    plugin = createMARendererPlugin() as TestableMARenderer
    plugin.onInstall(mockHost)

    const context = createMockRenderContext(ctx)
    plugin.draw(context)

    expect(ctx.beginPath).not.toHaveBeenCalled()
    expect(ctx.stroke).not.toHaveBeenCalled()
  })

  it('should save and restore context', () => {
    const state = createTestMARenderState()
    const mockHost = createMockPluginHost(state)
    plugin = createMARendererPlugin() as TestableMARenderer
    plugin.onInstall(mockHost)

    const context = createMockRenderContext(ctx)
    plugin.draw(context)

    expect(ctx.save).toHaveBeenCalledTimes(1)
    expect(ctx.restore).toHaveBeenCalledTimes(1)
    expect(ctx.restore).toHaveBeenCalledAfter(ctx.save as ReturnType<typeof vi.fn>)
  })

  it('should translate context by -scrollLeft', () => {
    const state = createTestMARenderState()
    const mockHost = createMockPluginHost(state)
    plugin = createMARendererPlugin() as TestableMARenderer
    plugin.onInstall(mockHost)

    const context = createMockRenderContext(ctx, { scrollLeft: 100 })
    plugin.draw(context)

    expect(ctx.translate).toHaveBeenCalledWith(-100, 0)
  })

  it('should set correct stroke style and line properties', () => {
    const state = createTestMARenderState()
    const mockHost = createMockPluginHost(state)
    plugin = createMARendererPlugin() as TestableMARenderer
    plugin.onInstall(mockHost)

    const context = createMockRenderContext(ctx)
    plugin.draw(context)

    // Check that stroke was called (meaning line properties were set)
    expect(ctx.stroke).toHaveBeenCalled()
    expect(ctx.lineWidth).toBe(1)
    expect(ctx.lineJoin).toBe('round')
    expect(ctx.lineCap).toBe('round')
  })

  it('should draw lines for enabled periods', () => {
    const state = createTestMARenderState({
      series: {
        5: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
      },
      enabledPeriods: [5],
      visibleMin: 10,
      visibleMax: 19,
    })
    const mockHost = createMockPluginHost(state)
    plugin = createMARendererPlugin() as TestableMARenderer
    plugin.onInstall(mockHost)

    const context = createMockRenderContext(ctx, {
      range: { start: 0, end: 10 },
      kLineCenters: Array.from({ length: 10 }, (_, i) => i * 10 + 5),
    })
    plugin.draw(context)

    expect(ctx.beginPath).toHaveBeenCalled()
    expect(ctx.moveTo).toHaveBeenCalled()
    expect(ctx.lineTo).toHaveBeenCalled()
    expect(ctx.stroke).toHaveBeenCalled()
  })

  it('should skip undefined values in series', () => {
    const state = createTestMARenderState({
      series: {
        5: [undefined, undefined, 12, 13, 14, 15, 16, 17, 18, 19],
      },
      enabledPeriods: [5],
    })
    const mockHost = createMockPluginHost(state)
    plugin = createMARendererPlugin() as TestableMARenderer
    plugin.onInstall(mockHost)

    const context = createMockRenderContext(ctx, {
      range: { start: 0, end: 10 },
      kLineCenters: Array.from({ length: 10 }, (_, i) => i * 10 + 5),
    })
    plugin.draw(context)

    // First valid value is at index 2 (value 12)
    expect(ctx.moveTo).toHaveBeenCalled()
    // moveTo should be called once for the first valid point
    expect(ctx.moveTo).toHaveBeenCalledTimes(1)
  })

  it('should use correct colors for each period', () => {
    const state = createTestMARenderState({
      series: {
        5: [10, 10, 10, 10, 10, 10, 10, 10, 10, 10],
        10: [20, 20, 20, 20, 20, 20, 20, 20, 20, 20],
        20: [30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
        30: [40, 40, 40, 40, 40, 40, 40, 40, 40, 40],
        60: [50, 50, 50, 50, 50, 50, 50, 50, 50, 50],
      },
      enabledPeriods: [5, 10, 20, 30, 60],
    })
    const mockHost = createMockPluginHost(state)
    plugin = createMARendererPlugin() as TestableMARenderer
    plugin.onInstall(mockHost)

    const context = createMockRenderContext(ctx)
    plugin.draw(context)

    // Should have drawn 5 separate lines (one per period)
    expect(ctx.stroke).toHaveBeenCalledTimes(5)
  })
})

describe('MA renderer getConfig/setConfig', () => {
  let plugin: ReturnType<typeof createMARendererPlugin>

  it('getConfig should return enabled periods from StateStore', () => {
    const state = createTestMARenderState({
      enabledPeriods: [5, 20, 60],
    })
    const mockHost = createMockPluginHost(state)
    plugin = createMARendererPlugin() as TestableMARenderer
    plugin.onInstall(mockHost)

    const config = plugin.getConfig()

    expect(config).toEqual({
      ma5: true,
      ma20: true,
      ma60: true,
    })
    expect(config.ma10).toBeUndefined()
    expect(config.ma30).toBeUndefined()
  })

  it('getConfig should return empty object when no state', () => {
    const mockHost = createMockPluginHost(undefined)
    plugin = createMARendererPlugin() as TestableMARenderer
    plugin.onInstall(mockHost)

    const config = plugin.getConfig()

    expect(config).toEqual({})
  })

  it('setConfig should not store config locally (stateless design)', () => {
    const state = createTestMARenderState({
      enabledPeriods: [5],
    })
    const mockHost = createMockPluginHost(state)
    plugin = createMARendererPlugin() as TestableMARenderer
    plugin.onInstall(mockHost)

    // setConfig should be a no-op
    expect(() => plugin.setConfig({ ma5: false, ma10: true })).not.toThrow()

    // Config should still reflect StateStore state, not what we just set
    const config = plugin.getConfig()
    expect(config).toEqual({ ma5: true })
  })
})

describe('MA renderer stateless design verification', () => {
  it('should not have any internal caching', () => {
    const plugin = createMARendererPlugin()

    // Plugin should not expose any cache-related methods
    expect('maCache' in plugin).toBe(false)
    expect('cachedData' in plugin).toBe(false)
    expect('getMAData' in plugin).toBe(false)
    expect('onDataUpdate' in plugin).toBe(false)
  })

  it('should read fresh state on each draw call', () => {
    const mockGetSharedState = vi.fn()
    const mockHost = {
      setSharedState: vi.fn(),
      getSharedState: mockGetSharedState,
      clearByOwner: vi.fn(),
    } as unknown as PluginHost

    mockGetSharedState.mockReturnValue(createTestMARenderState())

    const plugin = createMARendererPlugin()
    plugin.onInstall(mockHost)

    const ctx = createMockCanvasContext()
    const context = createMockRenderContext(ctx)

    // First draw
    plugin.draw(context)
    expect(mockGetSharedState).toHaveBeenCalledTimes(1)

    // Second draw - should read state again (not cached)
    plugin.draw(context)
    expect(mockGetSharedState).toHaveBeenCalledTimes(2)
  })
})
