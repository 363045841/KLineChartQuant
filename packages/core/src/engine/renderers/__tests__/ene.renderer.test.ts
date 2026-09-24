import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ENERenderState } from '@/core/indicators/state/eneState'
import {
  createMockCanvasContext,
  createMockRenderContext,
  createMockServiceHost,
  createMockStateReader,
} from '@/engine/__tests__/helpers/renderTestKit'
import { INDICATOR_INSTANCE_STATE_SERVICE } from '@/engine/indicators/instances/api/indicatorRenderBinding'
import { resolveThemeColors } from '@/foundation/tokens'
import type { PluginHost, RenderContext, RendererPluginWithHost } from '@/plugin'
import { createENERendererPlugin } from '../Indicator/ene'

/** 固定实例身份：renderer 只按 instanceId 寻址，不再依赖指标类型 state key。 */
const ENE_INSTANCE_ID = 'inst-ene'

// Type helper for tests
interface TestableENERenderer extends RendererPluginWithHost {
  onInstall: (host: PluginHost) => void
  draw: (context: RenderContext) => void
  getDeclaredNamespaces: () => string[]
  getConfig: () => Record<string, unknown>
  setConfig: (config: Record<string, unknown>) => void
}

function createTestENERenderState(overrides: Partial<ENERenderState> = {}): ENERenderState {
  return {
    timestamp: Date.now(),
    series: Array.from({ length: 100 }, (_, i) =>
      i < 9 ? undefined : { upper: 111 + i * 0.1, middle: 100 + i * 0.1, lower: 89 + i * 0.1 },
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

/** 构造按 instanceId 命中返回实例投影的 PluginHost stub。 */
function createENEHost(state?: ENERenderState): PluginHost {
  return createMockServiceHost({
    [INDICATOR_INSTANCE_STATE_SERVICE]: createMockStateReader(ENE_INSTANCE_ID, state),
  })
}

/** 构造绑定固定实例身份的 ENE renderer。 */
function createTestENERenderer(): TestableENERenderer {
  return createENERendererPlugin({ instanceId: ENE_INSTANCE_ID }) as TestableENERenderer
}

describe('createENERendererPlugin', () => {
  it('should create a renderer plugin with correct metadata', () => {
    const plugin = createTestENERenderer()

    expect(plugin.name).toBe('ene')
    expect(plugin.version).toBe('2.1.0')
    expect(plugin.paneId).toBe('main')
  })

  it('should have onInstall method', () => {
    const plugin = createTestENERenderer()
    expect(typeof plugin.onInstall).toBe('function')
  })

  it('should declare the bound instance namespace', () => {
    const plugin = createTestENERenderer()
    plugin.onInstall(createENEHost())
    expect(plugin.getDeclaredNamespaces()).toEqual([ENE_INSTANCE_ID])
  })
})

describe('ENE renderer draw', () => {
  let ctx: CanvasRenderingContext2D
  let plugin: TestableENERenderer

  beforeEach(() => {
    ctx = createMockCanvasContext()
  })

  it('should not draw when the instance projection is missing', () => {
    plugin = createTestENERenderer()
    plugin.onInstall(createENEHost())

    const context = createMockRenderContext({
      ctx,
      indicatorStateReader: createMockStateReader(ENE_INSTANCE_ID),
    })
    plugin.draw(context)

    expect(ctx.beginPath).not.toHaveBeenCalled()
    expect(ctx.stroke).not.toHaveBeenCalled()
  })

  it('should not draw when state has no valid data', () => {
    const state = createTestENERenderState({
      visibleMin: Infinity,
      visibleMax: -Infinity,
    })
    plugin = createTestENERenderer()
    plugin.onInstall(createENEHost(state))

    const context = createMockRenderContext({
      ctx,
      indicatorStateReader: createMockStateReader(ENE_INSTANCE_ID, state),
    })
    plugin.draw(context)

    expect(ctx.beginPath).not.toHaveBeenCalled()
    expect(ctx.stroke).not.toHaveBeenCalled()
  })

  it('should save and restore context', () => {
    const state = createTestENERenderState()
    plugin = createTestENERenderer()
    plugin.onInstall(createENEHost(state))

    const context = createMockRenderContext({
      ctx,
      indicatorStateReader: createMockStateReader(ENE_INSTANCE_ID, state),
    })
    plugin.draw(context)

    expect(ctx.save).toHaveBeenCalledTimes(1)
    expect(ctx.restore).toHaveBeenCalledTimes(1)
  })

  it('should not draw band fill', () => {
    const state = createTestENERenderState()
    plugin = createTestENERenderer()
    plugin.onInstall(createENEHost(state))

    const context = createMockRenderContext({
      ctx,
      indicatorStateReader: createMockStateReader(ENE_INSTANCE_ID, state),
    })
    plugin.draw(context)

    expect(ctx.fill).not.toHaveBeenCalled()
    expect(ctx.closePath).not.toHaveBeenCalled()
  })

  it('should draw all three lines (upper, middle, lower)', () => {
    const state = createTestENERenderState()
    plugin = createTestENERenderer()
    plugin.onInstall(createENEHost(state))

    const context = createMockRenderContext({
      ctx,
      indicatorStateReader: createMockStateReader(ENE_INSTANCE_ID, state),
    })
    plugin.draw(context)

    // Should have stroke calls for the three lines
    expect(ctx.stroke).toHaveBeenCalled()
  })

  it('should use correct line styles', () => {
    const state = createTestENERenderState()
    plugin = createTestENERenderer()
    plugin.onInstall(createENEHost(state))

    const context = createMockRenderContext({
      ctx,
      indicatorStateReader: createMockStateReader(ENE_INSTANCE_ID, state),
    })
    plugin.draw(context)

    expect(ctx.lineWidth).toBe(1)
    expect(ctx.lineJoin).toBe('round')
    expect(ctx.lineCap).toBe('round')
  })

  it('should use theme colors', () => {
    const state = createTestENERenderState()
    plugin = createTestENERenderer()
    plugin.onInstall(createENEHost(state))

    const context = createMockRenderContext({
      ctx,
      indicatorStateReader: createMockStateReader(ENE_INSTANCE_ID, state),
    })
    plugin.draw(context)

    // 最后绘制下轨，strokeStyle 应取 light 主题的 ene.lower
    expect(ctx.strokeStyle).toBe(resolveThemeColors('light').ene.lower)
  })

  it('should skip undefined values at start of series', () => {
    const state = createTestENERenderState({
      series: Array.from({ length: 15 }, (_, i) =>
        i < 9 ? undefined : { upper: 111, middle: 100, lower: 89 },
      ),
    })
    plugin = createTestENERenderer()
    plugin.onInstall(createENEHost(state))

    const context = createMockRenderContext({
      ctx,
      range: { start: 0, end: 15 },
      indicatorStateReader: createMockStateReader(ENE_INSTANCE_ID, state),
    })

    expect(() => plugin.draw(context)).not.toThrow()
    expect(ctx.stroke).toHaveBeenCalled()
  })
})

describe('ENE renderer config', () => {
  it('getConfig should return current params from the instance projection', () => {
    const state = createTestENERenderState({
      params: { period: 15, deviation: 15 },
    })
    const plugin = createTestENERenderer()
    plugin.onInstall(createENEHost(state))

    const config = plugin.getConfig()

    expect(config.period).toBe(15)
    expect(config.deviation).toBe(15)
  })

  it('getConfig should return empty object when no state', () => {
    const plugin = createTestENERenderer()
    plugin.onInstall(createENEHost())

    const config = plugin.getConfig()

    expect(config).toEqual({})
  })

  it('setConfig should be a no-op', () => {
    const plugin = createTestENERenderer()
    plugin.onInstall(createENEHost(createTestENERenderState()))

    expect(() => plugin.setConfig({ period: 25 })).not.toThrow()

    const config = plugin.getConfig()
    expect(config.period).toBe(10) // Original value from state
  })
})
