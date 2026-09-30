import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  countFillTexts,
  createContextWithInstanceState,
  createMARenderState,
  createMockCanvasContext,
  createMockIndicatorInstanceHost,
  type MockCanvasContext,
  type MockRenderContextOverrides,
} from '@/engine/__tests__/helpers/renderTestKit'
import { loadBuiltinIndicators } from '@/engine/indicators/registerBuiltins'
import type { PluginHost, RenderContext } from '@/plugin'
import type { KLineData } from '@/types/price'
import {
  type CanvasLegendOptions,
  createMainIndicatorLegendLayer,
} from '../Indicator/mainIndicatorLegend'

beforeAll(async () => {
  await loadBuiltinIndicators()
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** 固定主图实例身份：图例按实例枚举 metadata，并从帧读取器按该 ID 取投影。 */
const MA_INSTANCE_ID = 'main:MA'

let ctx: MockCanvasContext

beforeEach(() => {
  ctx = createMockCanvasContext()
})

/** 构造携带主图实例清单的图例宿主；空数组表示当前没有启用主图指标。 */
function createLegendHost(
  mainInstances: ReadonlyArray<{ instanceId: string; definitionId: string }>,
): PluginHost {
  return createMockIndicatorInstanceHost(
    mainInstances.map(({ instanceId, definitionId }) => ({
      instanceId,
      definitionId,
      paneId: 'main',
      params: {},
    })),
  )
}

/** 组装带固定宿主的图例 Layer；options 只声明差异项。 */
function createLegendLayer(
  host: PluginHost,
  options: Parameters<typeof createMainIndicatorLegendLayer>[0] = { yPaddingPx: 20 },
) {
  return createMainIndicatorLegendLayer(options, () => host)
}

/** 以固定主图实例构造图例宿主。 */
function createMAHost(definitionId = 'ma'): PluginHost {
  return createLegendHost([{ instanceId: MA_INSTANCE_ID, definitionId }])
}

/** 统计图例绘制的指标标题行数量（标题行文本与指标展示名完全相等）。 */
function countTitleRows(title: string): number {
  return countFillTexts(ctx, (text) => text === title)
}

/**
 * 构造图例帧上下文：图例绘制在 overlay 画布，这里让 overlay 与主画布共用同一 spy，
 * 以便直接断言图例文本；运行时不共享画布。
 */
function createLegendContext(
  instanceId: string,
  state: unknown,
  overrides: MockRenderContextOverrides = {},
): RenderContext {
  return createContextWithInstanceState(ctx, instanceId, state, { overlayCtx: ctx, ...overrides })
}

describe('MainIndicatorLegend identity', () => {
  it('exposes the legend layer identity', () => {
    const layer = createLegendLayer(createLegendHost([]))

    expect(layer.id).toBe('plugin:mainIndicatorLegend')
    expect(layer.role).toBe('overlay')
    expect(layer.pane).toBe('main')
    expect(layer.visible).toBe(true)
  })
})

describe('MainIndicatorLegend paint', () => {
  it('reads visibility changes each frame while still publishing external context', () => {
    let config: CanvasLegendOptions = { visible: false }
    const onContext = vi.fn()
    const layer = createLegendLayer(createMAHost(), {
      yPaddingPx: 20,
      getLegendOptions: () => config,
      onContext,
    })
    const context = createLegendContext(MA_INSTANCE_ID, createMARenderState())

    layer.paint(context)
    expect(ctx.fillText).not.toHaveBeenCalled()
    expect(onContext).toHaveBeenLastCalledWith(
      expect.objectContaining({ indicators: expect.any(Array) }),
    )

    config = { visible: true }
    layer.paint(context)
    expect(countTitleRows('MA')).toBe(1)
  })

  it.each([
    { configuredIds: undefined, viewIds: ['ma'], expected: 1 },
    { configuredIds: ['ma'], viewIds: ['ma'], expected: 1 },
    { configuredIds: [], viewIds: ['ma'], expected: 0 },
    { configuredIds: ['ma'], viewIds: [], expected: 0 },
  ])(
    'intersects configured IDs with the view-projected IDs (expected $expected rows)',
    ({ configuredIds, viewIds, expected }) => {
      const layer = createLegendLayer(createMAHost(), {
        yPaddingPx: 20,
        getLegendOptions: () => ({ visibleIndicatorIds: configuredIds }),
        getVisibleIndicatorIds: () => viewIds,
      })

      layer.paint(createLegendContext(MA_INSTANCE_ID, createMARenderState()))

      expect(countTitleRows('MA')).toBe(expected)
    },
  )

  it('does not paint MA when MA is not active', () => {
    const layer = createLegendLayer(createLegendHost([]))

    layer.paint(createLegendContext(MA_INSTANCE_ID, createMARenderState()))

    expect(countTitleRows('MA')).toBe(0)
  })

  it('draws MA values from the frame state reader', () => {
    const layer = createLegendLayer(createMAHost())

    layer.paint(createLegendContext(MA_INSTANCE_ID, createMARenderState()))

    expect(countTitleRows('MA')).toBe(1)
    expect(countFillTexts(ctx, (text) => text.includes('MA5'))).toBeGreaterThan(0)
  })

  it('uses crosshairIndex when available', () => {
    const state = createMARenderState({
      series: { 5: Array.from({ length: 100 }, (_, i) => 100 + i) },
      enabledPeriods: [5],
    })
    const layer = createLegendLayer(createMAHost())

    layer.paint(createLegendContext(MA_INSTANCE_ID, state, { crosshairIndex: 50 }))

    expect(countFillTexts(ctx, (text) => text.includes('150.000'))).toBeGreaterThan(0)
  })

  it('uses last index when crosshairIndex is null', () => {
    const state = createMARenderState({
      series: { 5: Array.from({ length: 10 }, (_, i) => 100 + i) },
      enabledPeriods: [5],
    })
    const layer = createLegendLayer(createMAHost())

    layer.paint(
      createLegendContext(MA_INSTANCE_ID, state, {
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
      }),
    )

    expect(countFillTexts(ctx, (text) => text.includes('109.000'))).toBeGreaterThan(0)
  })

  it.each([
    { label: 'the instance projection is missing', state: undefined },
    {
      label: 'state has no valid data',
      state: createMARenderState({
        visibleMin: Infinity,
        visibleMax: -Infinity,
        enabledPeriods: [],
      }),
    },
  ])('does not paint MA and does not throw when $label', ({ state }) => {
    const layer = createLegendLayer(createMAHost())
    const context = createLegendContext(MA_INSTANCE_ID, state)

    expect(() => layer.paint(context)).not.toThrow()
    expect(countTitleRows('MA')).toBe(0)
  })

  it('displays values with 3 decimal places', () => {
    const state = createMARenderState({
      series: { 5: Array.from({ length: 100 }, () => 123.4567) },
      enabledPeriods: [5],
    })
    const layer = createLegendLayer(createMAHost())

    layer.paint(createLegendContext(MA_INSTANCE_ID, state))

    expect(countFillTexts(ctx, (text) => text.includes('123.457'))).toBeGreaterThan(0)
  })

  it('saves and restores context', () => {
    const layer = createLegendLayer(createMAHost())

    layer.paint(createLegendContext(MA_INSTANCE_ID, createMARenderState()))

    expect(ctx.save).toHaveBeenCalledTimes(1)
    expect(ctx.restore).toHaveBeenCalledTimes(1)
  })
})

describe('MainIndicatorLegend frame state source', () => {
  it('reads from the frame reader instead of calculating', () => {
    const state = createMARenderState({
      series: { 5: [undefined, undefined, undefined, undefined, 999.99] },
      enabledPeriods: [5],
    })
    const layer = createLegendLayer(createMAHost())
    const context = createLegendContext(MA_INSTANCE_ID, state, {
      crosshairIndex: 4,
      range: { start: 0, end: 5 },
    })

    layer.paint(context)

    // getTitleInfo 从帧读取器取值，而非重新计算。
    expect(context.indicatorStateReader?.get).toHaveBeenCalledWith(MA_INSTANCE_ID)
    expect(countFillTexts(ctx, (text) => text.includes('999.99'))).toBeGreaterThan(0)
  })
})

/**
 * 主图指标标题行用例表：各指标 state 形状与展示名不同，绘制路径相同。
 * 表驱动避免为每个指标复制同一套宿主、上下文与断言。
 */
const MAIN_INDICATOR_CASES: ReadonlyArray<{
  instanceId: string
  definitionId: string
  title: string
  /** 各指标 getTitleInfo 消费的专属 state 形状。 */
  state: unknown
}> = [
  {
    instanceId: 'main:BOLL',
    definitionId: 'boll',
    title: 'BOLL',
    state: {
      timestamp: 1,
      series: [{ upper: 120, middle: 100, lower: 80 }],
      params: { period: 20, multiplier: 2 },
      visibleMin: 80,
      visibleMax: 120,
    },
  },
  {
    instanceId: 'main:EXPMA',
    definitionId: 'expma',
    title: 'EXPMA',
    state: {
      timestamp: 1,
      series: [{ fast: 10, slow: 8 }],
      params: { fastPeriod: 12, slowPeriod: 50 },
      visibleMin: 8,
      visibleMax: 10,
    },
  },
  {
    instanceId: 'main:ENE',
    definitionId: 'ene',
    title: 'ENE',
    state: {
      timestamp: 1,
      series: [{ upper: 20, middle: 15, lower: 10 }],
      params: { period: 10, deviation: 11 },
      visibleMin: 10,
      visibleMax: 20,
    },
  },
  {
    instanceId: 'main:WMA',
    definitionId: 'wma',
    title: 'WMA',
    state: { timestamp: 1, series: [123], params: { period: 10 } },
  },
]

describe('MainIndicatorLegend indicator rows', () => {
  it.each(MAIN_INDICATOR_CASES)(
    'paints the $title title row when active',
    ({ instanceId, definitionId, title, state }) => {
      const layer = createLegendLayer(createLegendHost([{ instanceId, definitionId }]))

      layer.paint(createLegendContext(instanceId, state, { crosshairIndex: 0 }))

      expect(countTitleRows(title)).toBeGreaterThan(0)
    },
  )
})

describe('MainIndicatorLegend external mode & context callback', () => {
  it('publishes legend context via onContext while still painting in canvas mode', () => {
    const onContext = vi.fn()
    const layer = createLegendLayer(createMAHost(), { yPaddingPx: 20, onContext })

    layer.paint(
      createLegendContext(MA_INSTANCE_ID, createMARenderState(), {
        crosshairIndex: 50,
      }),
    )

    expect(onContext).toHaveBeenCalledTimes(1)
    const legend = onContext.mock.calls[0]![0]
    expect(legend).not.toBeNull()
    expect(legend.index).toBe(50)
    expect(legend.hasCrosshair).toBe(true)
    expect(legend.currentBar).not.toBeNull()
    expect(legend.indicators.some((row: { name: string }) => row.name === 'MA')).toBe(true)
    expect(ctx.fillText).toHaveBeenCalled()
  })

  it('does not paint canvas text when renderMode is external but still publishes context', () => {
    const onContext = vi.fn()
    const layer = createLegendLayer(createMAHost(), {
      yPaddingPx: 20,
      onContext,
      renderMode: 'external',
    })

    layer.paint(
      createLegendContext(MA_INSTANCE_ID, createMARenderState(), {
        crosshairIndex: 10,
      }),
    )

    expect(onContext).toHaveBeenCalledTimes(1)
    expect(onContext.mock.calls[0]![0]).not.toBeNull()
    expect(ctx.fillText).not.toHaveBeenCalled()
  })

  it('retains custom KLineData fields in the currentBar slot context', () => {
    const onContext = vi.fn()
    const layer = createLegendLayer(createLegendHost([]), {
      yPaddingPx: 20,
      onContext,
      renderMode: 'external',
    })
    const context = createLegendContext(MA_INSTANCE_ID, undefined, {
      crosshairIndex: 10,
    })
    Object.assign((context.data as KLineData[])[10]!, {
      turnoverRate: 3.14,
      customLabel: 'featured',
    })

    layer.paint(context)

    const legend = onContext.mock.calls[0]![0]
    expect(legend.currentBar.turnoverRate).toBe(3.14)
    expect(legend.currentBar.customLabel).toBe('featured')
  })
})
