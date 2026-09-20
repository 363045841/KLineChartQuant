import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EXPMA_STATE_KEY, type EXPMARenderState } from '@/core/indicators/state/expmaState'
import {
  createMockCanvasContext,
  createMockIndicatorHost,
  createMockRenderContext,
  createMockStateReader,
} from '@/engine/__tests__/helpers/renderTestKit'
import type { PluginHost, RenderContext, RendererPluginWithHost } from '@/plugin'
import { createEXPMARendererPlugin } from '../Indicator/expma'

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

describe('createEXPMARendererPlugin', () => {
  it('should create a renderer plugin with correct metadata', () => {
    const plugin = createEXPMARendererPlugin() as TestableEXPMARenderer

    expect(plugin.name).toBe('expma')
    expect(plugin.version).toBe('2.1.0')
    expect(plugin.paneId).toBe('main')
  })

  it('should have onInstall method', () => {
    const plugin = createEXPMARendererPlugin() as TestableEXPMARenderer
    expect(typeof plugin.onInstall).toBe('function')
  })

  it('should declare EXPMA_STATE_KEY namespace', () => {
    const plugin = createEXPMARendererPlugin() as TestableEXPMARenderer
    plugin.onInstall(createMockIndicatorHost({ indicatorName: 'expma', stateKey: EXPMA_STATE_KEY }))
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
    const mockHost = createMockIndicatorHost({ indicatorName: 'expma', stateKey: EXPMA_STATE_KEY })
    plugin = createEXPMARendererPlugin() as TestableEXPMARenderer
    plugin.onInstall(mockHost)

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
    const mockHost = createMockIndicatorHost({
      indicatorName: 'expma',
      stateKey: EXPMA_STATE_KEY,
      state,
    })
    plugin = createEXPMARendererPlugin() as TestableEXPMARenderer
    plugin.onInstall(mockHost)

    const context = createMockRenderContext({
      ctx,
      indicatorStateReader: createMockStateReader(EXPMA_STATE_KEY, state),
    })
    plugin.draw(context)

    expect(ctx.beginPath).not.toHaveBeenCalled()
    expect(ctx.stroke).not.toHaveBeenCalled()
  })

  it('should save and restore context', () => {
    const state = createTestEXPMARenderState()
    const mockHost = createMockIndicatorHost({
      indicatorName: 'expma',
      stateKey: EXPMA_STATE_KEY,
      state,
    })
    plugin = createEXPMARendererPlugin() as TestableEXPMARenderer
    plugin.onInstall(mockHost)

    const context = createMockRenderContext({
      ctx,
      indicatorStateReader: createMockStateReader(EXPMA_STATE_KEY, state),
    })
    plugin.draw(context)

    expect(ctx.save).toHaveBeenCalledTimes(1)
    expect(ctx.restore).toHaveBeenCalledTimes(1)
  })

  it('should draw both fast and slow lines', () => {
    const state = createTestEXPMARenderState()
    const mockHost = createMockIndicatorHost({
      indicatorName: 'expma',
      stateKey: EXPMA_STATE_KEY,
      state,
    })
    plugin = createEXPMARendererPlugin() as TestableEXPMARenderer
    plugin.onInstall(mockHost)

    const reader = createMockStateReader(EXPMA_STATE_KEY, state)
    const context = createMockRenderContext({ ctx, indicatorStateReader: reader })
    plugin.draw(context)

    // Should have stroke calls for both lines
    expect(ctx.stroke).toHaveBeenCalled()
    expect(ctx.beginPath).toHaveBeenCalled()
    expect(reader.get).toHaveBeenCalledWith(EXPMA_STATE_KEY)
    expect(mockHost.getSharedState).not.toHaveBeenCalled()
  })

  it('should use correct line styles', () => {
    const state = createTestEXPMARenderState()
    const mockHost = createMockIndicatorHost({
      indicatorName: 'expma',
      stateKey: EXPMA_STATE_KEY,
      state,
    })
    plugin = createEXPMARendererPlugin() as TestableEXPMARenderer
    plugin.onInstall(mockHost)

    const context = createMockRenderContext({
      ctx,
      indicatorStateReader: createMockStateReader(EXPMA_STATE_KEY, state),
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
    const mockHost = createMockIndicatorHost({
      indicatorName: 'expma',
      stateKey: EXPMA_STATE_KEY,
      state,
    })
    plugin = createEXPMARendererPlugin() as TestableEXPMARenderer
    plugin.onInstall(mockHost)

    const context = createMockRenderContext({
      ctx,
      range: { start: 0, end: 10 },
      indicatorStateReader: createMockStateReader(EXPMA_STATE_KEY, state),
    })
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
    const mockHost = createMockIndicatorHost({
      indicatorName: 'expma',
      stateKey: EXPMA_STATE_KEY,
      state,
    })
    const plugin = createEXPMARendererPlugin() as TestableEXPMARenderer as TestableEXPMARenderer
    plugin.onInstall(mockHost)

    const config = plugin.getConfig()

    expect(config.fastPeriod).toBe(20)
    expect(config.slowPeriod).toBe(60)
  })

  it('getConfig should return empty object when no state', () => {
    const mockHost = createMockIndicatorHost({ indicatorName: 'expma', stateKey: EXPMA_STATE_KEY })
    const plugin = createEXPMARendererPlugin() as TestableEXPMARenderer as TestableEXPMARenderer
    plugin.onInstall(mockHost)

    const config = plugin.getConfig()

    expect(config).toEqual({})
  })

  it('setConfig should be a no-op', () => {
    const mockHost = createMockIndicatorHost({
      indicatorName: 'expma',
      stateKey: EXPMA_STATE_KEY,
      state: createTestEXPMARenderState(),
    })
    const plugin = createEXPMARendererPlugin() as TestableEXPMARenderer as TestableEXPMARenderer
    plugin.onInstall(mockHost)

    expect(() => plugin.setConfig({ fastPeriod: 30 })).not.toThrow()

    const config = plugin.getConfig()
    expect(config.fastPeriod).toBe(12) // Original value from state
  })
})
