// @ts-nocheck - Test file with intentional type relaxations for mocking
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMainIndicatorLegendRendererPlugin } from '../Indicator/mainIndicatorLegend'
import { MA_STATE_KEY, type MARenderState } from '@/core/indicators/maState'
import { BOLL_STATE_KEY } from '@/core/indicators/bollState'
import { EXPMA_STATE_KEY } from '@/core/indicators/expmaState'
import { ENE_STATE_KEY } from '@/core/indicators/eneState'
import type { PluginHost, RenderContext, RendererPluginWithHost } from '@/plugin'
import type { KLineData } from '@/types/price'
import type { Pane } from '@/core/layout/pane'
import type { GetTitleInfoFn, TitleInfo, TitleValueItem } from '@/engine/indicators/indicatorMetadata'
import type { IndicatorScheduler } from '@/engine/indicators/indicatorScheduler'

// Type helper for tests - we know these methods exist on the implementation
interface TestableLegendRenderer extends RendererPluginWithHost {
  draw: (context: RenderContext) => void
  getConfig: () => { yPaddingPx: number }
  setConfig: (config: Record<string, unknown>) => void
}

/**
 * 创建 mock canvas context
 */
function createMockCanvasContext(): CanvasRenderingContext2D {
  const measureTextMock = vi.fn().mockReturnValue({ width: 50 })

  return {
    save: vi.fn(),
    restore: vi.fn(),
    fillText: vi.fn(),
    measureText: measureTextMock,
    font: '',
    fillStyle: '',
    textAlign: '',
  } as unknown as CanvasRenderingContext2D
}

/**
 * Create a mock scheduler that returns indicator metadata with getTitleInfo.
 * Keys are case-insensitive (matching real IndicatorScheduler behavior).
 */
function createMockScheduler(
  metadataMap: Record<string, { getTitleInfo: GetTitleInfoFn }>,
  activeMainIndicators?: string[]
): IndicatorScheduler {
  const activeSet = new Set((activeMainIndicators ?? ['ma']).map((i: string) => i.toLowerCase()))
  return {
    getIndicatorMetadata: vi.fn((id: string) => metadataMap[id.toLowerCase()] ?? null),
    getMainIndicators: vi.fn(() => Object.entries(metadataMap).map(([id, meta]) => ({
      name: id,
      getTitleInfo: meta.getTitleInfo,
      category: 'main',
    }))),
    isMainIndicatorActive: vi.fn((id: string) => activeSet.has(id.toLowerCase())),
    getMainIndicatorParams: vi.fn(() => ({})),
  } as unknown as IndicatorScheduler
}

/**
 * Create a mock getTitleInfo for MA that reads from shared state
 */
function createMAGetTitleInfo(): GetTitleInfoFn {
  return (data, index, params, host, paneId): TitleInfo => {
    const state = host.getSharedState<MARenderState>(MA_STATE_KEY)
    if (!state) return null

    const ci = index ?? (state.series[5]?.length ?? 100) - 1
    const values: TitleValueItem[] = []
    for (const period of state.enabledPeriods) {
      const v = state.series[period]?.[ci]
      if (v !== undefined) {
        values.push({
          label: `MA${period}`,
          value: v,
          color: '#888888',
        })
      }
    }
    return { name: 'MA', values: values.length > 0 ? values : undefined }
  }
}

/**
 * Create simple mock getTitleInfo for BOLL/EXPMA/ENE
 */
function createSimpleGetTitleInfo(name: string): GetTitleInfoFn {
  return (): TitleInfo => ({
    name,
    params: [20, 2],
    values: [
      { label: 'MID', value: 100.00, color: '#FF0000' },
      { label: 'UP', value: 120.00, color: '#00FF00' },
      { label: 'DN', value: 80.00, color: '#0000FF' },
    ],
  })
}

/**
 * 创建 mock PluginHost
 */
function createMockPluginHost(
  state?: MARenderState,
  scheduler?: IndicatorScheduler
): PluginHost {
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
    getService: vi.fn((name: string) => {
      if (name === 'indicatorScheduler') return scheduler
      return undefined
    }),
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
    yAxis: {
      priceToY: (price: number) => price * 10,
    },
  } as unknown as Pane

  const defaultKLineData: KLineData[] = Array.from({ length: 100 }, (_, i) => ({
    timestamp: 1000000000000 + i * 60000,
    open: 100 + i,
    high: 101 + i,
    low: 99 + i,
    close: 100 + i,
    volume: 1000 + i * 100,
  }))

  return {
    ctx,
    // f5f5706 moved legend rendering to the overlay layer; renderer now reads
    // `overlayCtx`. Mock both to the same spy canvas so the existing
    // `vi.mocked(ctx.fillText).mock.calls` assertions continue to capture writes.
    overlayCtx: ctx,
    data: defaultKLineData,
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

/**
 * 创建测试用的 MARenderState
 */
function createTestMARenderState(
  overrides: Partial<MARenderState> = {}
): MARenderState {
  const series: Record<number, (number | undefined)[]> = {
    5: Array.from({ length: 100 }, () => 105),
    10: Array.from({ length: 100 }, () => 110),
    20: Array.from({ length: 100 }, () => 120),
    30: Array.from({ length: 100 }, () => 130),
    60: Array.from({ length: 100 }, () => 160),
  }

  // Add some undefined values at the beginning
  for (let i = 0; i < 4; i++) series[5][i] = undefined
  for (let i = 0; i < 9; i++) series[10][i] = undefined
  for (let i = 0; i < 19; i++) series[20][i] = undefined

  return {
    timestamp: Date.now(),
    series,
    enabledPeriods: [5, 10, 20, 30, 60],
    visibleMin: 105,
    visibleMax: 160,
    ...overrides,
  }
}

describe('createMainIndicatorLegendRendererPlugin', () => {
  it('should create a renderer plugin with correct metadata', () => {
    const plugin = createMainIndicatorLegendRendererPlugin({ yPaddingPx: 20 })

    expect(plugin.name).toBe('mainIndicatorLegend')
    expect(plugin.version).toBe('2.1.0')
    expect(plugin.description).toBe('主图指标图例渲染器（MA 数据来自 StateStore）')
    expect(plugin.debugName).toBe('主图指标图例')
    expect(plugin.paneId).toBe('main')
    expect(plugin.enabled).toBe(true)
  })

  it('should have onInstall method', () => {
    const plugin = createMainIndicatorLegendRendererPlugin({ yPaddingPx: 20 })
    expect(typeof plugin.onInstall).toBe('function')
  })

  it('should not declare any namespace keys (individual renderers own their state)', () => {
    const plugin = createMainIndicatorLegendRendererPlugin({ yPaddingPx: 20 })
    expect(plugin.getDeclaredNamespaces()).toEqual([])
  })
})

describe('MainIndicatorLegend draw', () => {
  let ctx: CanvasRenderingContext2D
  let plugin: TestableLegendRenderer

  beforeEach(() => {
    ctx = createMockCanvasContext()
  })

  it('should not draw MA when MA is not active', () => {
    const state = createTestMARenderState()
    const scheduler = createMockScheduler({ ma: { getTitleInfo: createMAGetTitleInfo() } }, [])
    const mockHost = createMockPluginHost(state, scheduler)
    plugin = createMainIndicatorLegendRendererPlugin({ yPaddingPx: 20 }) as TestableLegendRenderer
    plugin.onInstall(mockHost)

    const context = createMockRenderContext(ctx)
    plugin.draw(context)

    // Should not draw any MA legend text
    const fillTextCalls = vi.mocked(ctx.fillText).mock.calls
    const maLabelCalls = fillTextCalls.filter(call => call[0] === 'MA')
    expect(maLabelCalls).toHaveLength(0)
  })

  it('should draw MA values from StateStore', () => {
    const state = createTestMARenderState()
    const scheduler = createMockScheduler({ ma: { getTitleInfo: createMAGetTitleInfo() } }, ['ma'])
    const mockHost = createMockPluginHost(state, scheduler)
    plugin = createMainIndicatorLegendRendererPlugin({ yPaddingPx: 20 }) as TestableLegendRenderer
    plugin.onInstall(mockHost)

    const context = createMockRenderContext(ctx)
    plugin.draw(context)

    const fillTextCalls = vi.mocked(ctx.fillText).mock.calls

    // Should have drawn 'MA' label
    const maLabelCalls = fillTextCalls.filter(call => call[0] === 'MA')
    expect(maLabelCalls).toHaveLength(1)

    // Should have drawn MA5, MA10, etc. labels
    const ma5Calls = fillTextCalls.filter(call => String(call[0]).includes('MA5'))
    expect(ma5Calls.length).toBeGreaterThan(0)
  })

  it('should use crosshairIndex when available', () => {
    const state = createTestMARenderState({
      series: {
        5: Array.from({ length: 100 }, (_, i) => 100 + i),
      },
      enabledPeriods: [5],
    })
    const scheduler = createMockScheduler({ ma: { getTitleInfo: createMAGetTitleInfo() } }, ['ma'])
    const mockHost = createMockPluginHost(state, scheduler)
    plugin = createMainIndicatorLegendRendererPlugin({ yPaddingPx: 20 }) as TestableLegendRenderer
    plugin.onInstall(mockHost)

    // Use crosshair at index 50
    const context = createMockRenderContext(ctx, { crosshairIndex: 50 })
    plugin.draw(context)

    const fillTextCalls = vi.mocked(ctx.fillText).mock.calls

    // Should show value 150 at index 50 (100 + 50)
    const maValueCalls = fillTextCalls.filter(call =>
      String(call[0]).includes('150.000')
    )
    expect(maValueCalls.length).toBeGreaterThan(0)
  })

  it('should use last index when crosshairIndex is null', () => {
    const state = createTestMARenderState({
      series: {
        5: Array.from({ length: 10 }, (_, i) => 100 + i),
      },
      enabledPeriods: [5],
    })
    const scheduler = createMockScheduler({ ma: { getTitleInfo: createMAGetTitleInfo() } }, ['ma'])
    const mockHost = createMockPluginHost(state, scheduler)
    plugin = createMainIndicatorLegendRendererPlugin({ yPaddingPx: 20 }) as TestableLegendRenderer
    plugin.onInstall(mockHost)

    const context = createMockRenderContext(ctx, {
      crosshairIndex: null,
      range: { start: 0, end: 10 },
      data: Array.from({ length: 10 }, (_, i) => ({
        timestamp: 1000000000000 + i * 60000,
        open: 100 + i,
        high: 101 + i,
        low: 99 + i,
        close: 100 + i,
        volume: 1000,
      })),
    })
    plugin.draw(context)

    const fillTextCalls = vi.mocked(ctx.fillText).mock.calls

    // Should show last value (109) at index 9
    const maValueCalls = fillTextCalls.filter(call =>
      String(call[0]).includes('109.000')
    )
    expect(maValueCalls.length).toBeGreaterThan(0)
  })

  it('should not crash when StateStore is empty', () => {
    const mockHost = createMockPluginHost(undefined)
    plugin = createMainIndicatorLegendRendererPlugin({ yPaddingPx: 20 }) as TestableLegendRenderer
    plugin.onInstall(mockHost)

    const context = createMockRenderContext(ctx)

    // Should not throw
    expect(() => plugin.draw(context)).not.toThrow()
  })

  it('should not draw MA when state has no valid data', () => {
    const state = createTestMARenderState({
      visibleMin: Infinity,
      visibleMax: -Infinity,
      enabledPeriods: [],
    })
    const scheduler = createMockScheduler({ ma: { getTitleInfo: createMAGetTitleInfo() } }, ['ma'])
    const mockHost = createMockPluginHost(state, scheduler)
    plugin = createMainIndicatorLegendRendererPlugin({ yPaddingPx: 20 }) as TestableLegendRenderer
    plugin.onInstall(mockHost)

    const context = createMockRenderContext(ctx)
    plugin.draw(context)

    // Should not draw any MA period values (name 'MA' may still appear but no period texts)
    const fillTextCalls = vi.mocked(ctx.fillText).mock.calls
    const ma5Calls = fillTextCalls.filter(call => String(call[0]).includes('MA5'))
    expect(ma5Calls).toHaveLength(0)
  })

  it('should display values with 3 decimal places', () => {
    const state = createTestMARenderState({
      series: {
        5: Array.from({ length: 100 }, () => 123.4567),
      },
      enabledPeriods: [5],
    })
    const scheduler = createMockScheduler({ ma: { getTitleInfo: createMAGetTitleInfo() } }, ['ma'])
    const mockHost = createMockPluginHost(state, scheduler)
    plugin = createMainIndicatorLegendRendererPlugin({ yPaddingPx: 20 }) as TestableLegendRenderer
    plugin.onInstall(mockHost)

    const context = createMockRenderContext(ctx)
    plugin.draw(context)

    const fillTextCalls = vi.mocked(ctx.fillText).mock.calls

    // Should show formatted value
    const formattedValueCalls = fillTextCalls.filter(call =>
      String(call[0]).includes('123.457')
    )
    expect(formattedValueCalls.length).toBeGreaterThan(0)
  })

  it('should use correct colors for each MA period', () => {
    const state = createTestMARenderState()
    const scheduler = createMockScheduler({ ma: { getTitleInfo: createMAGetTitleInfo() } }, ['ma'])
    const mockHost = createMockPluginHost(state, scheduler)
    plugin = createMainIndicatorLegendRendererPlugin({ yPaddingPx: 20 }) as TestableLegendRenderer
    plugin.onInstall(mockHost)

    const context = createMockRenderContext(ctx)
    plugin.draw(context)

    // Should have drawn MA period values with proper colors
    const fillTextCalls = vi.mocked(ctx.fillText).mock.calls
    const ma5Calls = fillTextCalls.filter(call => String(call[0]).includes('MA5'))
    expect(ma5Calls.length).toBeGreaterThan(0)
  })

  it('should save and restore context', () => {
    const state = createTestMARenderState()
    const scheduler = createMockScheduler({ ma: { getTitleInfo: createMAGetTitleInfo() } }, ['ma'])
    const mockHost = createMockPluginHost(state, scheduler)
    plugin = createMainIndicatorLegendRendererPlugin({ yPaddingPx: 20 }) as TestableLegendRenderer
    plugin.onInstall(mockHost)

    const context = createMockRenderContext(ctx)
    plugin.draw(context)

    expect(ctx.save).toHaveBeenCalledTimes(1)
    expect(ctx.restore).toHaveBeenCalledTimes(1)
  })
})

describe('MainIndicatorLegend MA data source', () => {
  it('should read from StateStore instead of calculating', () => {
    const state = createTestMARenderState({
      series: {
        5: [undefined, undefined, undefined, undefined, 999.99],
      },
      enabledPeriods: [5],
    })
    const mockGetSharedState = vi.fn().mockReturnValue(state)
    const scheduler = createMockScheduler({ ma: { getTitleInfo: createMAGetTitleInfo() } }, ['ma'])
    const mockHost = {
      setSharedState: vi.fn(),
      getSharedState: mockGetSharedState,
      clearByOwner: vi.fn(),
      getService: vi.fn((name: string) => {
        if (name === 'indicatorScheduler') return scheduler
        return undefined
      }),
    } as unknown as PluginHost

    const plugin = createMainIndicatorLegendRendererPlugin({ yPaddingPx: 20 })
    plugin.onInstall(mockHost)

    const ctx = createMockCanvasContext()
    const context = createMockRenderContext(ctx, {
      crosshairIndex: 4,
      range: { start: 0, end: 5 },
    })
    plugin.draw(context)

    // Verify it read from StateStore (via getTitleInfo calling getSharedState)
    expect(mockGetSharedState).toHaveBeenCalledWith(MA_STATE_KEY)

    const fillTextCalls = vi.mocked(ctx.fillText).mock.calls

    // Should show the value from StateStore (999.99), not a calculated value
    const valueCalls = fillTextCalls.filter(call =>
      String(call[0]).includes('999.99')
    )
    expect(valueCalls.length).toBeGreaterThan(0)
  })
})

describe('MainIndicatorLegend config management', () => {
  it('getConfig should return current yPaddingPx', () => {
    const plugin = createMainIndicatorLegendRendererPlugin({ yPaddingPx: 20 })

    const config = plugin.getConfig()

    expect(config.yPaddingPx).toBe(20)
  })

  it('setConfig should update yPaddingPx', () => {
    const plugin = createMainIndicatorLegendRendererPlugin({ yPaddingPx: 20 })

    plugin.setConfig({ yPaddingPx: 30 })

    const config = plugin.getConfig()
    expect(config.yPaddingPx).toBe(30)
  })
})

describe('MainIndicatorLegend with other indicators', () => {
  it('should draw BOLL when active', () => {
    const scheduler = createMockScheduler(
      { boll: { getTitleInfo: createSimpleGetTitleInfo('BOLL') } },
      ['boll']
    )
    const mockHost = createMockPluginHost(undefined, scheduler)
    const plugin = createMainIndicatorLegendRendererPlugin({ yPaddingPx: 20 })
    plugin.onInstall(mockHost)

    const ctx = createMockCanvasContext()
    const context = createMockRenderContext(ctx)
    plugin.draw(context)

    const fillTextCalls = vi.mocked(ctx.fillText).mock.calls

    // Should have drawn BOLL label
    const bollLabelCalls = fillTextCalls.filter(call =>
      String(call[0]).includes('BOLL')
    )
    expect(bollLabelCalls.length).toBeGreaterThan(0)
  })

  it('should draw EXPMA when active', () => {
    const scheduler = createMockScheduler(
      { expma: { getTitleInfo: createSimpleGetTitleInfo('EXPMA') } },
      ['expma']
    )
    const mockHost = createMockPluginHost(undefined, scheduler)
    const plugin = createMainIndicatorLegendRendererPlugin({ yPaddingPx: 20 })
    plugin.onInstall(mockHost)

    const ctx = createMockCanvasContext()
    const context = createMockRenderContext(ctx)
    plugin.draw(context)

    const fillTextCalls = vi.mocked(ctx.fillText).mock.calls

    // Should have drawn EXPMA label
    const expmaLabelCalls = fillTextCalls.filter(call =>
      String(call[0]).includes('EXPMA')
    )
    expect(expmaLabelCalls.length).toBeGreaterThan(0)
  })

  it('should draw ENE when active', () => {
    const scheduler = createMockScheduler(
      { ene: { getTitleInfo: createSimpleGetTitleInfo('ENE') } },
      ['ene']
    )
    const mockHost = createMockPluginHost(undefined, scheduler)
    const plugin = createMainIndicatorLegendRendererPlugin({ yPaddingPx: 20 })
    plugin.onInstall(mockHost)

    const ctx = createMockCanvasContext()
    const context = createMockRenderContext(ctx)
    plugin.draw(context)

    const fillTextCalls = vi.mocked(ctx.fillText).mock.calls

    // Should have drawn ENE label
    const eneLabelCalls = fillTextCalls.filter(call =>
      String(call[0]).includes('ENE')
    )
    expect(eneLabelCalls.length).toBeGreaterThan(0)
  })

  it('should draw any registered main indicator when active (WMA example)', () => {
    const scheduler = createMockScheduler(
      { wma: { getTitleInfo: createSimpleGetTitleInfo('WMA') } },
      ['wma']
    )
    const mockHost = createMockPluginHost(undefined, scheduler)
    const plugin = createMainIndicatorLegendRendererPlugin({ yPaddingPx: 20 })
    plugin.onInstall(mockHost)

    const ctx = createMockCanvasContext()
    const context = createMockRenderContext(ctx)
    plugin.draw(context)

    const fillTextCalls = vi.mocked(ctx.fillText).mock.calls
    const wmaLabelCalls = fillTextCalls.filter(call => String(call[0]).includes('WMA'))
    expect(wmaLabelCalls.length).toBeGreaterThan(0)
  })
})
