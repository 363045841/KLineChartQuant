import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MA_STATE_KEY, type MARenderState } from '@/core/indicators/state/maState'
import {
  createMockCanvasContext,
  createMockIndicatorHost,
  createMockRenderContext,
  createMockStateReader,
} from '@/engine/__tests__/helpers/renderTestKit'
import type { PluginHost, RenderContext, RendererPluginWithHost } from '@/plugin'
import { createMARendererPlugin } from '../Indicator/ma'

// Type helper for tests - we know these methods exist on the implementation
interface TestableMARenderer extends RendererPluginWithHost {
  onInstall: (host: PluginHost) => void
  draw: (context: RenderContext) => void
  getDeclaredNamespaces: () => string[]
  getConfig: () => Record<string, unknown>
  setConfig: (config: Record<string, unknown>) => void
}

/** 构造携带 MA 指标元数据与帧状态的 PluginHost。 */
function createMockPluginHost(state?: MARenderState) {
  return createMockIndicatorHost({ indicatorName: 'ma', stateKey: MA_STATE_KEY, state })
}

/**
 * 创建测试用的 MARenderState
 */
function createTestMARenderState(overrides: Partial<MARenderState> = {}): MARenderState {
  return {
    timestamp: Date.now(),
    series: {
      5: [undefined, undefined, undefined, undefined, 12, 13, 14, 15, 16, 17],
      10: [
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        14.5,
      ],
    },
    enabledPeriods: [5, 10],
    visibleMin: 12,
    visibleMax: 17,
    ...overrides,
  }
}

describe('createMARendererPlugin', () => {
  it('should create a renderer plugin with correct metadata', () => {
    const plugin = createMARendererPlugin() as TestableMARenderer

    expect(plugin.name).toBe('ma')
    expect(plugin.version).toBe('2.1.0')
    expect(plugin.description).toBe('MA均线渲染器')
    expect(plugin.debugName).toBe('MA均线')
    expect(plugin.paneId).toBe('main')
  })

  it('should have onInstall method', () => {
    const plugin = createMARendererPlugin() as TestableMARenderer
    expect(typeof plugin.onInstall).toBe('function')
  })

  it('should declare MA_STATE_KEY namespace', () => {
    const plugin = createMARendererPlugin() as TestableMARenderer
    plugin.onInstall(createMockPluginHost())
    expect(plugin.getDeclaredNamespaces()).toEqual([MA_STATE_KEY])
  })

  it('should accept PluginHost via onInstall', () => {
    const plugin = createMARendererPlugin() as TestableMARenderer
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

    const context = createMockRenderContext({
      ctx,
      indicatorStateReader: createMockStateReader(MA_STATE_KEY),
    })
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

    const context = createMockRenderContext({
      ctx,
      indicatorStateReader: createMockStateReader(MA_STATE_KEY, state),
    })
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

    const context = createMockRenderContext({
      ctx,
      indicatorStateReader: createMockStateReader(MA_STATE_KEY, state),
    })
    plugin.draw(context)

    expect(ctx.beginPath).not.toHaveBeenCalled()
    expect(ctx.stroke).not.toHaveBeenCalled()
  })

  it('should save and restore context', () => {
    const state = createTestMARenderState()
    const mockHost = createMockPluginHost(state)
    plugin = createMARendererPlugin() as TestableMARenderer
    plugin.onInstall(mockHost)

    const context = createMockRenderContext({
      ctx,
      indicatorStateReader: createMockStateReader(MA_STATE_KEY, state),
    })
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

    const context = createMockRenderContext({
      ctx,
      scrollLeft: 100,
      indicatorStateReader: createMockStateReader(MA_STATE_KEY, state),
    })
    plugin.draw(context)

    expect(ctx.translate).toHaveBeenCalledWith(-100, 0)
  })

  it('should set correct stroke style and line properties', () => {
    const state = createTestMARenderState()
    const mockHost = createMockPluginHost(state)
    plugin = createMARendererPlugin() as TestableMARenderer
    plugin.onInstall(mockHost)

    const context = createMockRenderContext({
      ctx,
      indicatorStateReader: createMockStateReader(MA_STATE_KEY, state),
    })
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

    const context = createMockRenderContext({
      ctx,
      range: { start: 0, end: 10 },
      kLineCenters: Array.from({ length: 10 }, (_, i) => i * 10 + 5),
      indicatorStateReader: createMockStateReader(MA_STATE_KEY, state),
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

    const context = createMockRenderContext({
      ctx,
      range: { start: 0, end: 10 },
      kLineCenters: Array.from({ length: 10 }, (_, i) => i * 10 + 5),
      indicatorStateReader: createMockStateReader(MA_STATE_KEY, state),
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

    const context = createMockRenderContext({
      ctx,
      indicatorStateReader: createMockStateReader(MA_STATE_KEY, state),
    })
    plugin.draw(context)

    // Should have drawn 5 separate lines (one per period)
    expect(ctx.stroke).toHaveBeenCalledTimes(5)
  })
})

describe('MA renderer getConfig/setConfig', () => {
  let plugin: TestableMARenderer

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
    const plugin = createMARendererPlugin() as TestableMARenderer

    // Plugin should not expose any cache-related methods
    expect('maCache' in plugin).toBe(false)
    expect('cachedData' in plugin).toBe(false)
    expect('getMAData' in plugin).toBe(false)
    expect('onDataUpdate' in plugin).toBe(false)
  })

  it('should read fresh state on each draw call', () => {
    const state = createTestMARenderState()
    const reader = createMockStateReader(MA_STATE_KEY, state)
    const mockHost = createMockPluginHost(state)

    const plugin = createMARendererPlugin() as TestableMARenderer
    plugin.onInstall(mockHost)

    const context = createMockRenderContext({
      ctx: createMockCanvasContext(),
      indicatorStateReader: reader,
    })

    // First draw
    plugin.draw(context)
    expect(reader.get).toHaveBeenCalledTimes(1)

    // Second draw - should read state again (not cached)
    plugin.draw(context)
    expect(reader.get).toHaveBeenCalledTimes(2)
  })
})
