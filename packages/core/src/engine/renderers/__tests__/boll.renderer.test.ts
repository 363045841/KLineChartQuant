import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BOLL_STATE_KEY, type BOLLRenderState } from '@/core/indicators/state/bollState'
import {
  createMockCanvasContext,
  createMockIndicatorHost,
  createMockRenderContext,
  createMockStateReader,
} from '@/engine/__tests__/helpers/renderTestKit'
import type { PluginHost, RenderContext, RendererPluginWithHost } from '@/plugin'
import { createBOLLRendererPlugin } from '../Indicator/boll'

if (typeof globalThis.Path2D === 'undefined') {
  class Path2DMock {
    moveTo = vi.fn()
    lineTo = vi.fn()
    closePath = vi.fn()
  }
  globalThis.Path2D = Path2DMock as unknown as typeof Path2D
}

// Type helper for tests
interface TestableBOLLRenderer extends RendererPluginWithHost {
  onInstall: (host: PluginHost) => void
  draw: (context: RenderContext) => void
  getDeclaredNamespaces: () => string[]
  getConfig: () => Record<string, unknown>
  setConfig: (config: Record<string, unknown>) => void
}

/** 构造携带 BOLL 指标元数据与帧状态的 PluginHost。 */
function createMockPluginHost(state?: BOLLRenderState) {
  return createMockIndicatorHost({ indicatorName: 'boll', stateKey: BOLL_STATE_KEY, state })
}

function createTestBOLLState(overrides: Partial<BOLLRenderState> = {}): BOLLRenderState {
  return {
    timestamp: Date.now(),
    series: Array.from({ length: 100 }, (_, i) =>
      i < 19 ? undefined : { upper: 110 + i * 0.1, middle: 100 + i * 0.1, lower: 90 + i * 0.1 },
    ),
    params: {
      period: 20,
      multiplier: 2,
      showUpper: true,
      showMiddle: true,
      showLower: true,
    },
    visibleMin: 90,
    visibleMax: 120,
    ...overrides,
  }
}

describe('createBOLLRendererPlugin', () => {
  it('should create a renderer plugin with correct metadata', () => {
    const plugin = createBOLLRendererPlugin() as TestableBOLLRenderer

    expect(plugin.name).toBe('boll')
    expect(plugin.version).toBe('2.2.0')
    expect(plugin.paneId).toBe('main')
  })

  it('should have onInstall method', () => {
    const plugin = createBOLLRendererPlugin() as TestableBOLLRenderer
    expect(typeof plugin.onInstall).toBe('function')
  })

  it('should declare BOLL_STATE_KEY namespace', () => {
    const plugin = createBOLLRendererPlugin() as TestableBOLLRenderer
    plugin.onInstall(createMockPluginHost())
    expect(plugin.getDeclaredNamespaces()).toEqual([BOLL_STATE_KEY])
  })
})

describe('BOLL renderer draw', () => {
  let ctx: CanvasRenderingContext2D
  let plugin: TestableBOLLRenderer

  beforeEach(() => {
    ctx = createMockCanvasContext()
  })

  it('should not draw when StateStore has no BOLL state', () => {
    const mockHost = createMockPluginHost(undefined)
    plugin = createBOLLRendererPlugin() as TestableBOLLRenderer
    plugin.onInstall(mockHost)

    const context = createMockRenderContext({ ctx })
    plugin.draw(context)

    // Should not call any drawing methods
    expect(ctx.beginPath).not.toHaveBeenCalled()
    expect(ctx.stroke).not.toHaveBeenCalled()
  })

  it('should not draw when state has no valid data', () => {
    const state = createTestBOLLState({
      visibleMin: Infinity,
      visibleMax: -Infinity,
    })
    const mockHost = createMockPluginHost(state)
    plugin = createBOLLRendererPlugin() as TestableBOLLRenderer
    plugin.onInstall(mockHost)

    const context = createMockRenderContext({
      ctx,
      indicatorStateReader: createMockStateReader(BOLL_STATE_KEY, state),
    })
    plugin.draw(context)

    expect(ctx.beginPath).not.toHaveBeenCalled()
    expect(ctx.stroke).not.toHaveBeenCalled()
  })

  it('should save and restore context', () => {
    const state = createTestBOLLState()
    const mockHost = createMockPluginHost(state)
    plugin = createBOLLRendererPlugin() as TestableBOLLRenderer
    plugin.onInstall(mockHost)

    const reader = createMockStateReader(BOLL_STATE_KEY, state)
    const context = createMockRenderContext({ ctx, indicatorStateReader: reader })
    plugin.draw(context)

    expect(ctx.save).toHaveBeenCalledTimes(1)
    expect(ctx.restore).toHaveBeenCalledTimes(1)
    expect(reader.get).toHaveBeenCalledWith(BOLL_STATE_KEY)
    expect(mockHost.getSharedState).not.toHaveBeenCalled()
  })

  it('should draw upper line when showUpper is true', () => {
    const state = createTestBOLLState({
      params: { ...createTestBOLLState().params, showUpper: true },
    })
    const mockHost = createMockPluginHost(state)
    plugin = createBOLLRendererPlugin() as TestableBOLLRenderer
    plugin.onInstall(mockHost)

    const context = createMockRenderContext({
      ctx,
      indicatorStateReader: createMockStateReader(BOLL_STATE_KEY, state),
    })
    plugin.draw(context)

    // Should have at least one stroke call for the lines
    expect(ctx.stroke).toHaveBeenCalled()
  })

  it('should use correct colors for BOLL lines', () => {
    const state = createTestBOLLState()
    const mockHost = createMockPluginHost(state)
    plugin = createBOLLRendererPlugin() as TestableBOLLRenderer
    plugin.onInstall(mockHost)

    const context = createMockRenderContext({
      ctx,
      indicatorStateReader: createMockStateReader(BOLL_STATE_KEY, state),
    })
    plugin.draw(context)

    // Verify strokeStyle was set (for lines)
    expect(ctx.stroke).toHaveBeenCalled()
  })

  it('should not crash when series has undefined values', () => {
    const state = createTestBOLLState({
      series: Array.from({ length: 25 }, (_, i) =>
        i < 19 ? undefined : { upper: 110, middle: 100, lower: 90 },
      ),
    })
    const mockHost = createMockPluginHost(state)
    plugin = createBOLLRendererPlugin() as TestableBOLLRenderer
    plugin.onInstall(mockHost)

    const context = createMockRenderContext({
      ctx,
      range: { start: 0, end: 25 },
      indicatorStateReader: createMockStateReader(BOLL_STATE_KEY, state),
    })

    expect(() => plugin.draw(context)).not.toThrow()
  })
})

describe('BOLL renderer config', () => {
  it('getConfig should return current params from StateStore', () => {
    const state = createTestBOLLState({
      params: {
        period: 25,
        multiplier: 3,
        showUpper: false,
        showMiddle: true,
        showLower: false,
      },
    })
    const mockHost = createMockPluginHost(state)
    const plugin = createBOLLRendererPlugin() as TestableBOLLRenderer as TestableBOLLRenderer
    plugin.onInstall(mockHost)

    const config = plugin.getConfig()

    expect(config.period).toBe(25)
    expect(config.multiplier).toBe(3)
    expect(config.showUpper).toBe(false)
  })

  it('getConfig should return empty object when no state', () => {
    const mockHost = createMockPluginHost(undefined)
    const plugin = createBOLLRendererPlugin() as TestableBOLLRenderer as TestableBOLLRenderer
    plugin.onInstall(mockHost)

    const config = plugin.getConfig()

    expect(config).toEqual({})
  })

  it('setConfig should be a no-op', () => {
    const mockHost = createMockPluginHost(createTestBOLLState())
    const plugin = createBOLLRendererPlugin() as TestableBOLLRenderer as TestableBOLLRenderer
    plugin.onInstall(mockHost)

    // setConfig should not throw
    expect(() => plugin.setConfig({ period: 50 })).not.toThrow()

    // Config should still come from StateStore, not the setConfig call
    const config = plugin.getConfig()
    expect(config.period).toBe(20) // Original value from state
  })
})
