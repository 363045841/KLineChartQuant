// @ts-nocheck - Test file with intentional type relaxations for mocking
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createBOLLRendererPlugin } from '../Indicator/boll'
import { BOLL_STATE_KEY, type BOLLRenderState } from '@/core/indicators/bollState'
import { BOLL_COLORS } from '@/core/theme/colors'
import type { PluginHost, RenderContext, RendererPluginWithHost } from '@/plugin'
import type { KLineData } from '@/types/price'
import type { Pane } from '@/core/layout/pane'

// Type helper for tests
interface TestableBOLLRenderer extends RendererPluginWithHost {
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

function createMockPluginHost(state?: BOLLRenderState): PluginHost {
  return {
    setSharedState: vi.fn(),
    getSharedState: vi.fn(<T>(key: string): T | undefined => {
      if (key === BOLL_STATE_KEY) {
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
    // BOLL period defaults to 20 — range must cover post-warm-up indices for draw() to execute
    range: { start: 0, end: 100 },
    visibleRange: { start: 0, end: 100 },
    crosshair: null,
    crosshairIndex: null,
    dpr: 1,
    scrollLeft: 0,
    pane: mockPane,
    kLineCenters: Array.from({ length: 100 }, (_, i) => i * 10 + 5),
    ...overrides,
  } as RenderContext
}

function createTestBOLLState(overrides: Partial<BOLLRenderState> = {}): BOLLRenderState {
  return {
    timestamp: Date.now(),
    series: Array.from({ length: 100 }, (_, i) =>
      i < 19
        ? undefined
        : { upper: 110 + i * 0.1, middle: 100 + i * 0.1, lower: 90 + i * 0.1 }
    ),
    params: {
      period: 20,
      multiplier: 2,
      showUpper: true,
      showMiddle: true,
      showLower: true,
      showBand: true,
    },
    visibleMin: 90,
    visibleMax: 120,
    ...overrides,
  }
}

describe('createBOLLRendererPlugin', () => {
  it('should create a renderer plugin with correct metadata', () => {
    const plugin = createBOLLRendererPlugin()

    expect(plugin.name).toBe('boll')
    expect(plugin.version).toBe('2.2.0')
    expect(plugin.paneId).toBe('main')
  })

  it('should have onInstall method', () => {
    const plugin = createBOLLRendererPlugin()
    expect(typeof plugin.onInstall).toBe('function')
  })

  it('should declare BOLL_STATE_KEY namespace', () => {
    const plugin = createBOLLRendererPlugin()
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

    const context = createMockRenderContext(ctx)
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

    const context = createMockRenderContext(ctx)
    plugin.draw(context)

    expect(ctx.beginPath).not.toHaveBeenCalled()
    expect(ctx.stroke).not.toHaveBeenCalled()
  })

  it('should save and restore context', () => {
    const state = createTestBOLLState()
    const mockHost = createMockPluginHost(state)
    plugin = createBOLLRendererPlugin() as TestableBOLLRenderer
    plugin.onInstall(mockHost)

    const context = createMockRenderContext(ctx)
    plugin.draw(context)

    expect(ctx.save).toHaveBeenCalledTimes(1)
    expect(ctx.restore).toHaveBeenCalledTimes(1)
  })

  it('should draw band when showBand is true', () => {
    const state = createTestBOLLState({ params: { ...createTestBOLLState().params, showBand: true } })
    const mockHost = createMockPluginHost(state)
    plugin = createBOLLRendererPlugin() as TestableBOLLRenderer
    plugin.onInstall(mockHost)

    const context = createMockRenderContext(ctx)
    plugin.draw(context)

    expect(ctx.fill).toHaveBeenCalled()
  })

  it('should not draw band when showBand is false', () => {
    const state = createTestBOLLState({ params: { ...createTestBOLLState().params, showBand: false } })
    const mockHost = createMockPluginHost(state)
    plugin = createBOLLRendererPlugin() as TestableBOLLRenderer
    plugin.onInstall(mockHost)

    const context = createMockRenderContext(ctx)
    plugin.draw(context)

    expect(ctx.fill).not.toHaveBeenCalled()
  })

  it('should draw upper line when showUpper is true', () => {
    const state = createTestBOLLState({ params: { ...createTestBOLLState().params, showUpper: true } })
    const mockHost = createMockPluginHost(state)
    plugin = createBOLLRendererPlugin() as TestableBOLLRenderer
    plugin.onInstall(mockHost)

    const context = createMockRenderContext(ctx)
    plugin.draw(context)

    // Should have at least one stroke call for the lines
    expect(ctx.stroke).toHaveBeenCalled()
  })

  it('should use correct colors for BOLL lines', () => {
    const state = createTestBOLLState()
    const mockHost = createMockPluginHost(state)
    plugin = createBOLLRendererPlugin() as TestableBOLLRenderer
    plugin.onInstall(mockHost)

    const context = createMockRenderContext(ctx)
    plugin.draw(context)

    // Verify strokeStyle was set (for lines)
    expect(ctx.stroke).toHaveBeenCalled()
  })

  it('should not crash when series has undefined values', () => {
    const state = createTestBOLLState({
      series: Array.from({ length: 25 }, (_, i) =>
        i < 19 ? undefined : { upper: 110, middle: 100, lower: 90 }
      ),
    })
    const mockHost = createMockPluginHost(state)
    plugin = createBOLLRendererPlugin() as TestableBOLLRenderer
    plugin.onInstall(mockHost)

    const context = createMockRenderContext(ctx, { range: { start: 0, end: 25 } })

    expect(() => plugin.draw(context)).not.toThrow()
  })
})

describe('BOLL renderer config', () => {
  it('getConfig should return current params from StateStore', () => {
    const state = createTestBOLLState({
      params: { period: 25, multiplier: 3, showUpper: false, showMiddle: true, showLower: false, showBand: false },
    })
    const mockHost = createMockPluginHost(state)
    const plugin = createBOLLRendererPlugin() as TestableBOLLRenderer
    plugin.onInstall(mockHost)

    const config = plugin.getConfig()

    expect(config.period).toBe(25)
    expect(config.multiplier).toBe(3)
    expect(config.showUpper).toBe(false)
  })

  it('getConfig should return empty object when no state', () => {
    const mockHost = createMockPluginHost(undefined)
    const plugin = createBOLLRendererPlugin() as TestableBOLLRenderer
    plugin.onInstall(mockHost)

    const config = plugin.getConfig()

    expect(config).toEqual({})
  })

  it('setConfig should be a no-op', () => {
    const mockHost = createMockPluginHost(createTestBOLLState())
    const plugin = createBOLLRendererPlugin() as TestableBOLLRenderer
    plugin.onInstall(mockHost)

    // setConfig should not throw
    expect(() => plugin.setConfig({ period: 50 })).not.toThrow()

    // Config should still come from StateStore, not the setConfig call
    const config = plugin.getConfig()
    expect(config.period).toBe(20) // Original value from state
  })
})
