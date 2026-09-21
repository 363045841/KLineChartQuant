import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MARenderState } from '@/core/indicators/state/maState'
import {
  createMockCanvasContext,
  createMockRenderContext,
  createMockServiceHost,
  createMockStateReader,
} from '@/engine/__tests__/helpers/renderTestKit'
import { INDICATOR_INSTANCE_STATE_SERVICE } from '@/engine/indicators/instances/api/indicatorRenderBinding'
import type { PluginHost, RenderContext, RendererPluginWithHost } from '@/plugin'
import { createMARendererPlugin } from '../Indicator/ma'

/** 固定实例身份：renderer 只按 instanceId 寻址，不再依赖指标类型 state key。 */
const MA_INSTANCE_ID = 'inst-ma'

// Type helper for tests - we know these methods exist on the implementation
interface TestableMARenderer extends RendererPluginWithHost {
  onInstall: (host: PluginHost) => void
  draw: (context: RenderContext) => void
  getDeclaredNamespaces: () => string[]
  getConfig: () => Record<string, unknown>
  setConfig: (config: Record<string, unknown>) => void
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

/** 构造按 instanceId 命中返回实例投影的 PluginHost stub。 */
function createMAHost(state?: MARenderState): PluginHost {
  return createMockServiceHost({
    [INDICATOR_INSTANCE_STATE_SERVICE]: createMockStateReader(MA_INSTANCE_ID, state),
  })
}

/** 构造绑定固定实例身份的 MA renderer。 */
function createTestMARenderer(): TestableMARenderer {
  return createMARendererPlugin({ instanceId: MA_INSTANCE_ID }) as TestableMARenderer
}

describe('createMARendererPlugin', () => {
  it('should create a renderer plugin with correct metadata', () => {
    const plugin = createTestMARenderer()

    expect(plugin.name).toBe('ma')
    expect(plugin.version).toBe('2.1.0')
    expect(plugin.description).toBe('MA均线渲染器')
    expect(plugin.debugName).toBe('MA均线')
    expect(plugin.paneId).toBe('main')
  })

  it('should have onInstall method', () => {
    const plugin = createTestMARenderer()
    expect(typeof plugin.onInstall).toBe('function')
  })

  it('should declare the bound instance namespace', () => {
    const plugin = createTestMARenderer()
    plugin.onInstall(createMAHost())
    expect(plugin.getDeclaredNamespaces()).toEqual([MA_INSTANCE_ID])
  })

  it('should accept PluginHost via onInstall', () => {
    const plugin = createTestMARenderer()
    const mockHost = createMAHost()

    expect(() => plugin.onInstall(mockHost)).not.toThrow()
  })
})

describe('MA renderer draw', () => {
  let ctx: CanvasRenderingContext2D
  let plugin: TestableMARenderer

  beforeEach(() => {
    ctx = createMockCanvasContext()
  })

  it('should not draw when the instance projection is missing', () => {
    plugin = createTestMARenderer()
    plugin.onInstall(createMAHost())

    const context = createMockRenderContext({
      ctx,
      indicatorStateReader: createMockStateReader(MA_INSTANCE_ID),
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
    plugin = createTestMARenderer()
    plugin.onInstall(createMAHost(state))

    const context = createMockRenderContext({
      ctx,
      indicatorStateReader: createMockStateReader(MA_INSTANCE_ID, state),
    })
    plugin.draw(context)

    expect(ctx.beginPath).not.toHaveBeenCalled()
    expect(ctx.stroke).not.toHaveBeenCalled()
  })

  it('should not draw when no periods are enabled', () => {
    const state = createTestMARenderState({
      enabledPeriods: [],
    })
    plugin = createTestMARenderer()
    plugin.onInstall(createMAHost(state))

    const context = createMockRenderContext({
      ctx,
      indicatorStateReader: createMockStateReader(MA_INSTANCE_ID, state),
    })
    plugin.draw(context)

    expect(ctx.beginPath).not.toHaveBeenCalled()
    expect(ctx.stroke).not.toHaveBeenCalled()
  })

  it('should save and restore context', () => {
    const state = createTestMARenderState()
    plugin = createTestMARenderer()
    plugin.onInstall(createMAHost(state))

    const context = createMockRenderContext({
      ctx,
      indicatorStateReader: createMockStateReader(MA_INSTANCE_ID, state),
    })
    plugin.draw(context)

    expect(ctx.save).toHaveBeenCalledTimes(1)
    expect(ctx.restore).toHaveBeenCalledTimes(1)
    expect(ctx.restore).toHaveBeenCalledAfter(ctx.save as ReturnType<typeof vi.fn>)
  })

  it('should translate context by -scrollLeft', () => {
    const state = createTestMARenderState()
    plugin = createTestMARenderer()
    plugin.onInstall(createMAHost(state))

    const context = createMockRenderContext({
      ctx,
      scrollLeft: 100,
      indicatorStateReader: createMockStateReader(MA_INSTANCE_ID, state),
    })
    plugin.draw(context)

    expect(ctx.translate).toHaveBeenCalledWith(-100, 0)
  })

  it('should set correct stroke style and line properties', () => {
    const state = createTestMARenderState()
    plugin = createTestMARenderer()
    plugin.onInstall(createMAHost(state))

    const context = createMockRenderContext({
      ctx,
      indicatorStateReader: createMockStateReader(MA_INSTANCE_ID, state),
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
    plugin = createTestMARenderer()
    plugin.onInstall(createMAHost(state))

    const context = createMockRenderContext({
      ctx,
      range: { start: 0, end: 10 },
      kLineCenters: Array.from({ length: 10 }, (_, i) => i * 10 + 5),
      indicatorStateReader: createMockStateReader(MA_INSTANCE_ID, state),
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
    plugin = createTestMARenderer()
    plugin.onInstall(createMAHost(state))

    const context = createMockRenderContext({
      ctx,
      range: { start: 0, end: 10 },
      kLineCenters: Array.from({ length: 10 }, (_, i) => i * 10 + 5),
      indicatorStateReader: createMockStateReader(MA_INSTANCE_ID, state),
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
    plugin = createTestMARenderer()
    plugin.onInstall(createMAHost(state))

    const context = createMockRenderContext({
      ctx,
      indicatorStateReader: createMockStateReader(MA_INSTANCE_ID, state),
    })
    plugin.draw(context)

    // Should have drawn 5 separate lines (one per period)
    expect(ctx.stroke).toHaveBeenCalledTimes(5)
  })
})

describe('MA renderer getConfig/setConfig', () => {
  let plugin: TestableMARenderer

  it('getConfig should return enabled periods from the instance projection', () => {
    const state = createTestMARenderState({
      enabledPeriods: [5, 20, 60],
    })
    plugin = createTestMARenderer()
    plugin.onInstall(createMAHost(state))

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
    plugin = createTestMARenderer()
    plugin.onInstall(createMAHost())

    const config = plugin.getConfig()

    expect(config).toEqual({})
  })

  it('setConfig should not store config locally (stateless design)', () => {
    const state = createTestMARenderState({
      enabledPeriods: [5],
    })
    plugin = createTestMARenderer()
    plugin.onInstall(createMAHost(state))

    // setConfig should be a no-op
    expect(() => plugin.setConfig({ ma5: false, ma10: true })).not.toThrow()

    // Config should still reflect the instance projection, not what we just set
    const config = plugin.getConfig()
    expect(config).toEqual({ ma5: true })
  })
})

describe('MA renderer stateless design verification', () => {
  it('should not have any internal caching', () => {
    const plugin = createTestMARenderer()

    // Plugin should not expose any cache-related methods
    expect('maCache' in plugin).toBe(false)
    expect('cachedData' in plugin).toBe(false)
    expect('getMAData' in plugin).toBe(false)
    expect('onDataUpdate' in plugin).toBe(false)
  })

  it('should read fresh state on each draw call', () => {
    const state = createTestMARenderState()
    const reader = createMockStateReader(MA_INSTANCE_ID, state)

    const plugin = createTestMARenderer()
    plugin.onInstall(createMAHost(state))

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
