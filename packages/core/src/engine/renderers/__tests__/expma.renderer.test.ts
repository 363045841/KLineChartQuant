import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EXPMARenderState } from '@/core/indicators/state/expmaState'
import {
  createMockCanvasContext,
  createMockRenderContext,
  createMockServiceHost,
  createMockStateReader,
} from '@/engine/__tests__/helpers/renderTestKit'
import { INDICATOR_INSTANCE_STATE_SERVICE } from '@/engine/indicators/instances/api/indicatorRenderBinding'
import type { PluginHost, RenderContext, RendererPluginWithHost } from '@/plugin'
import { createEXPMARendererPlugin } from '../Indicator/expma'

/** 固定实例身份：renderer 只按 instanceId 寻址，不再依赖指标类型 state key。 */
const EXPMA_INSTANCE_ID = 'inst-expma'

// Type helper for tests
interface TestableEXPMARenderer extends RendererPluginWithHost {
  onInstall: (host: PluginHost) => void
  draw: (context: RenderContext) => void
  getDeclaredNamespaces: () => string[]
  getConfig: () => Record<string, unknown>
  setConfig: (config: Record<string, unknown>) => void
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

/** 构造按 instanceId 命中返回实例投影的 PluginHost stub。 */
function createEXPMARenderHost(state?: EXPMARenderState): PluginHost {
  return createMockServiceHost({
    [INDICATOR_INSTANCE_STATE_SERVICE]: createMockStateReader(EXPMA_INSTANCE_ID, state),
  })
}

/** 构造绑定固定实例身份的 EXPMA renderer。 */
function createTestEXPMARenderer(): TestableEXPMARenderer {
  return createEXPMARendererPlugin({ instanceId: EXPMA_INSTANCE_ID }) as TestableEXPMARenderer
}

describe('createEXPMARendererPlugin', () => {
  it('should create a renderer plugin with correct metadata', () => {
    const plugin = createTestEXPMARenderer()

    expect(plugin.name).toBe('expma')
    expect(plugin.version).toBe('2.1.0')
    expect(plugin.paneId).toBe('main')
  })

  it('should have onInstall method', () => {
    const plugin = createTestEXPMARenderer()
    expect(typeof plugin.onInstall).toBe('function')
  })

  it('should declare the bound instance namespace', () => {
    const plugin = createTestEXPMARenderer()
    plugin.onInstall(createEXPMARenderHost())
    expect(plugin.getDeclaredNamespaces()).toEqual([EXPMA_INSTANCE_ID])
  })
})

describe('EXPMA renderer draw', () => {
  let ctx: CanvasRenderingContext2D
  let plugin: TestableEXPMARenderer

  beforeEach(() => {
    ctx = createMockCanvasContext()
  })

  it('should not draw when the instance projection is missing', () => {
    plugin = createTestEXPMARenderer()
    plugin.onInstall(createEXPMARenderHost())

    const context = createMockRenderContext({ ctx })
    plugin.draw(context)

    expect(ctx.beginPath).not.toHaveBeenCalled()
    expect(ctx.stroke).not.toHaveBeenCalled()
  })

  it('should not draw when state has no valid data', () => {
    const state = createTestEXPMARenderState({
      visibleMin: Infinity,
      visibleMax: -Infinity,
    })
    plugin = createTestEXPMARenderer()
    plugin.onInstall(createEXPMARenderHost(state))

    const context = createMockRenderContext({
      ctx,
      indicatorStateReader: createMockStateReader(EXPMA_INSTANCE_ID, state),
    })
    plugin.draw(context)

    expect(ctx.beginPath).not.toHaveBeenCalled()
    expect(ctx.stroke).not.toHaveBeenCalled()
  })

  it('should save and restore context', () => {
    const state = createTestEXPMARenderState()
    plugin = createTestEXPMARenderer()
    plugin.onInstall(createEXPMARenderHost(state))

    const context = createMockRenderContext({
      ctx,
      indicatorStateReader: createMockStateReader(EXPMA_INSTANCE_ID, state),
    })
    plugin.draw(context)

    expect(ctx.save).toHaveBeenCalledTimes(1)
    expect(ctx.restore).toHaveBeenCalledTimes(1)
  })

  it('should draw both fast and slow lines', () => {
    const state = createTestEXPMARenderState()
    const mockHost = createEXPMARenderHost(state)
    plugin = createTestEXPMARenderer()
    plugin.onInstall(mockHost)

    const reader = createMockStateReader(EXPMA_INSTANCE_ID, state)
    const context = createMockRenderContext({ ctx, indicatorStateReader: reader })
    plugin.draw(context)

    // Should have stroke calls for both lines
    expect(ctx.stroke).toHaveBeenCalled()
    expect(ctx.beginPath).toHaveBeenCalled()
    expect(reader.get).toHaveBeenCalledWith(EXPMA_INSTANCE_ID)
    expect(mockHost.getSharedState).not.toHaveBeenCalled()
  })

  it('should use correct line styles', () => {
    const state = createTestEXPMARenderState()
    plugin = createTestEXPMARenderer()
    plugin.onInstall(createEXPMARenderHost(state))

    const context = createMockRenderContext({
      ctx,
      indicatorStateReader: createMockStateReader(EXPMA_INSTANCE_ID, state),
    })
    plugin.draw(context)

    expect(ctx.lineWidth).toBe(1)
    expect(ctx.lineJoin).toBe('round')
    expect(ctx.lineCap).toBe('round')
  })

  it('should draw from index 0 (dense array)', () => {
    const state = createTestEXPMARenderState({
      series: Array.from({ length: 10 }, (_, i) => ({ fast: 100 + i, slow: 100 + i * 0.5 })),
    })
    plugin = createTestEXPMARenderer()
    plugin.onInstall(createEXPMARenderHost(state))

    const context = createMockRenderContext({
      ctx,
      range: { start: 0, end: 10 },
      indicatorStateReader: createMockStateReader(EXPMA_INSTANCE_ID, state),
    })
    plugin.draw(context)

    // EXPMA draws from range.start (0 for dense array)
    expect(ctx.beginPath).toHaveBeenCalled()
  })
})

describe('EXPMA renderer config', () => {
  it('getConfig should return current params from the instance projection', () => {
    const state = createTestEXPMARenderState({
      params: { fastPeriod: 20, slowPeriod: 60 },
    })
    const plugin = createTestEXPMARenderer()
    plugin.onInstall(createEXPMARenderHost(state))

    const config = plugin.getConfig()

    expect(config.fastPeriod).toBe(20)
    expect(config.slowPeriod).toBe(60)
  })

  it('getConfig should return empty object when no state', () => {
    const plugin = createTestEXPMARenderer()
    plugin.onInstall(createEXPMARenderHost())

    const config = plugin.getConfig()

    expect(config).toEqual({})
  })

  it('setConfig should be a no-op', () => {
    const plugin = createTestEXPMARenderer()
    plugin.onInstall(createEXPMARenderHost(createTestEXPMARenderState()))

    expect(() => plugin.setConfig({ fastPeriod: 30 })).not.toThrow()

    const config = plugin.getConfig()
    expect(config.fastPeriod).toBe(12) // Original value from state
  })
})
