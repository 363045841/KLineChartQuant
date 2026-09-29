import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MARenderState } from '@/core/indicators/state/maState'
import {
  createMockCanvasContext,
  createMockIndicatorInstanceHost,
  createMockRenderContext,
  createMockStateReader,
  type MockRenderContextOverrides,
} from '@/engine/__tests__/helpers/renderTestKit'
import { loadBuiltinIndicators } from '@/engine/indicators/registerBuiltins'
import type { PluginHost, RenderContext } from '@/plugin'
import type { KLineData } from '@/types/price'
import { createMainIndicatorLegendLayer } from '../Indicator/mainIndicatorLegend'

beforeAll(async () => {
  await loadBuiltinIndicators()
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** 固定主图实例身份：图例按实例枚举 metadata，并从帧读取器按该 ID 取投影。 */
const MA_INSTANCE_ID = 'main:MA'

/** 构造测试用 MARenderState。 */
function createTestMARenderState(overrides: Partial<MARenderState> = {}): MARenderState {
  const series: Record<number, (number | undefined)[]> = {
    5: Array.from({ length: 100 }, () => 105),
    10: Array.from({ length: 100 }, () => 110),
    20: Array.from({ length: 100 }, () => 120),
    30: Array.from({ length: 100 }, () => 130),
    60: Array.from({ length: 100 }, () => 160),
  }

  // 起始若干索引置空，验证稀疏序列跳过逻辑。
  for (let i = 0; i < 4; i++) series[5]![i] = undefined
  for (let i = 0; i < 9; i++) series[10]![i] = undefined
  for (let i = 0; i < 19; i++) series[20]![i] = undefined

  return {
    timestamp: Date.now(),
    series,
    enabledPeriods: [5, 10, 20, 30, 60],
    visibleMin: 105,
    visibleMax: 160,
    ...overrides,
  }
}

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

/**
 * 构造图例渲染上下文：overlay 与主画布共用同一 spy，指标行从帧读取器按实例 ID 读取。
 */
function createLegendContext(
  ctx: CanvasRenderingContext2D,
  reader: RenderContext['indicatorStateReader'],
  overrides: MockRenderContextOverrides = {},
): RenderContext {
  return createMockRenderContext({
    ctx,
    overlayCtx: ctx,
    indicatorStateReader: reader,
    ...overrides,
  })
}

/** 组装带固定宿主的图例 Layer。 */
function createLegendLayer(
  host: PluginHost,
  options: Parameters<typeof createMainIndicatorLegendLayer>[0] = { yPaddingPx: 20 },
) {
  return createMainIndicatorLegendLayer(options, () => host)
}

describe('createMainIndicatorLegendLayer', () => {
  it('should expose the legend layer identity', () => {
    const layer = createLegendLayer(createLegendHost([]))

    expect(layer.id).toBe('plugin:mainIndicatorLegend')
    expect(layer.role).toBe('overlay')
    expect(layer.pane).toBe('main')
    expect(layer.visible).toBe(true)
  })
})

describe('MainIndicatorLegend paint', () => {
  let ctx: CanvasRenderingContext2D

  beforeEach(() => {
    ctx = createMockCanvasContext()
  })

  it('should not draw MA when MA is not active', () => {
    const state = createTestMARenderState()
    const layer = createLegendLayer(createLegendHost([]))

    layer.paint(createLegendContext(ctx, createMockStateReader(MA_INSTANCE_ID, state)))

    const maLabelCalls = vi.mocked(ctx.fillText).mock.calls.filter((call) => call[0] === 'MA')
    expect(maLabelCalls).toHaveLength(0)
  })

  it('should draw MA values from the frame state reader', () => {
    const state = createTestMARenderState()
    const layer = createLegendLayer(
      createLegendHost([{ instanceId: MA_INSTANCE_ID, definitionId: 'ma' }]),
    )

    layer.paint(createLegendContext(ctx, createMockStateReader(MA_INSTANCE_ID, state)))

    const fillTextCalls = vi.mocked(ctx.fillText).mock.calls
    const maLabelCalls = fillTextCalls.filter((call) => call[0] === 'MA')
    expect(maLabelCalls).toHaveLength(1)

    const ma5Calls = fillTextCalls.filter((call) => String(call[0]).includes('MA5'))
    expect(ma5Calls.length).toBeGreaterThan(0)
  })

  it('should use crosshairIndex when available', () => {
    const state = createTestMARenderState({
      series: { 5: Array.from({ length: 100 }, (_, i) => 100 + i) },
      enabledPeriods: [5],
    })
    const layer = createLegendLayer(
      createLegendHost([{ instanceId: MA_INSTANCE_ID, definitionId: 'ma' }]),
    )

    layer.paint(
      createLegendContext(ctx, createMockStateReader(MA_INSTANCE_ID, state), {
        crosshairIndex: 50,
      }),
    )

    const maValueCalls = vi
      .mocked(ctx.fillText)
      .mock.calls.filter((call) => String(call[0]).includes('150.000'))
    expect(maValueCalls.length).toBeGreaterThan(0)
  })

  it('should use last index when crosshairIndex is null', () => {
    const state = createTestMARenderState({
      series: { 5: Array.from({ length: 10 }, (_, i) => 100 + i) },
      enabledPeriods: [5],
    })
    const layer = createLegendLayer(
      createLegendHost([{ instanceId: MA_INSTANCE_ID, definitionId: 'ma' }]),
    )

    layer.paint(
      createLegendContext(ctx, createMockStateReader(MA_INSTANCE_ID, state), {
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

    const maValueCalls = vi
      .mocked(ctx.fillText)
      .mock.calls.filter((call) => String(call[0]).includes('109.000'))
    expect(maValueCalls.length).toBeGreaterThan(0)
  })

  it('should not crash when the frame state is empty', () => {
    const layer = createLegendLayer(
      createLegendHost([{ instanceId: MA_INSTANCE_ID, definitionId: 'ma' }]),
    )

    const context = createLegendContext(ctx, createMockStateReader(MA_INSTANCE_ID))

    expect(() => layer.paint(context)).not.toThrow()
  })

  it('should not draw MA period values when state has no valid data', () => {
    const state = createTestMARenderState({
      visibleMin: Infinity,
      visibleMax: -Infinity,
      enabledPeriods: [],
    })
    const layer = createLegendLayer(
      createLegendHost([{ instanceId: MA_INSTANCE_ID, definitionId: 'ma' }]),
    )

    layer.paint(createLegendContext(ctx, createMockStateReader(MA_INSTANCE_ID, state)))

    const ma5Calls = vi
      .mocked(ctx.fillText)
      .mock.calls.filter((call) => String(call[0]).includes('MA5'))
    expect(ma5Calls).toHaveLength(0)
  })

  it('should display values with 3 decimal places', () => {
    const state = createTestMARenderState({
      series: { 5: Array.from({ length: 100 }, () => 123.4567) },
      enabledPeriods: [5],
    })
    const layer = createLegendLayer(
      createLegendHost([{ instanceId: MA_INSTANCE_ID, definitionId: 'ma' }]),
    )

    layer.paint(createLegendContext(ctx, createMockStateReader(MA_INSTANCE_ID, state)))

    const formattedValueCalls = vi
      .mocked(ctx.fillText)
      .mock.calls.filter((call) => String(call[0]).includes('123.457'))
    expect(formattedValueCalls.length).toBeGreaterThan(0)
  })

  it('should save and restore context', () => {
    const state = createTestMARenderState()
    const layer = createLegendLayer(
      createLegendHost([{ instanceId: MA_INSTANCE_ID, definitionId: 'ma' }]),
    )

    layer.paint(createLegendContext(ctx, createMockStateReader(MA_INSTANCE_ID, state)))

    expect(ctx.save).toHaveBeenCalledTimes(1)
    expect(ctx.restore).toHaveBeenCalledTimes(1)
  })
})

describe('MainIndicatorLegend MA data source', () => {
  it('should read from the frame reader instead of calculating', () => {
    const state = createTestMARenderState({
      series: { 5: [undefined, undefined, undefined, undefined, 999.99] },
      enabledPeriods: [5],
    })
    const layer = createLegendLayer(
      createLegendHost([{ instanceId: MA_INSTANCE_ID, definitionId: 'ma' }]),
    )

    const ctx = createMockCanvasContext()
    const context = createLegendContext(ctx, createMockStateReader(MA_INSTANCE_ID, state), {
      crosshairIndex: 4,
      range: { start: 0, end: 5 },
    })
    layer.paint(context)

    // getTitleInfo 从帧读取器取值，而非重新计算。
    expect(context.indicatorStateReader?.get).toHaveBeenCalledWith(MA_INSTANCE_ID)

    const valueCalls = vi
      .mocked(ctx.fillText)
      .mock.calls.filter((call) => String(call[0]).includes('999.99'))
    expect(valueCalls.length).toBeGreaterThan(0)
  })
})

describe('MainIndicatorLegend with other indicators', () => {
  it('should draw BOLL when active', () => {
    const layer = createLegendLayer(
      createLegendHost([{ instanceId: 'main:BOLL', definitionId: 'boll' }]),
    )

    const ctx = createMockCanvasContext()
    layer.paint(
      createLegendContext(
        ctx,
        createMockStateReader('main:BOLL', {
          timestamp: 1,
          series: [{ upper: 120, middle: 100, lower: 80 }],
          params: { period: 20, multiplier: 2 },
          visibleMin: 80,
          visibleMax: 120,
        }),
        { crosshairIndex: 0 },
      ),
    )

    const bollLabelCalls = vi
      .mocked(ctx.fillText)
      .mock.calls.filter((call) => String(call[0]).includes('BOLL'))
    expect(bollLabelCalls.length).toBeGreaterThan(0)
  })

  it('should draw EXPMA when active', () => {
    const layer = createLegendLayer(
      createLegendHost([{ instanceId: 'main:EXPMA', definitionId: 'expma' }]),
    )

    const ctx = createMockCanvasContext()
    layer.paint(
      createLegendContext(
        ctx,
        createMockStateReader('main:EXPMA', {
          timestamp: 1,
          series: [{ fast: 10, slow: 8 }],
          params: { fastPeriod: 12, slowPeriod: 50 },
          visibleMin: 8,
          visibleMax: 10,
        }),
        { crosshairIndex: 0 },
      ),
    )

    const expmaLabelCalls = vi
      .mocked(ctx.fillText)
      .mock.calls.filter((call) => String(call[0]).includes('EXPMA'))
    expect(expmaLabelCalls.length).toBeGreaterThan(0)
  })

  it('should draw ENE when active', () => {
    const layer = createLegendLayer(
      createLegendHost([{ instanceId: 'main:ENE', definitionId: 'ene' }]),
    )

    const ctx = createMockCanvasContext()
    layer.paint(
      createLegendContext(
        ctx,
        createMockStateReader('main:ENE', {
          timestamp: 1,
          series: [{ upper: 20, middle: 15, lower: 10 }],
          params: { period: 10, deviation: 11 },
          visibleMin: 10,
          visibleMax: 20,
        }),
        { crosshairIndex: 0 },
      ),
    )

    const eneLabelCalls = vi
      .mocked(ctx.fillText)
      .mock.calls.filter((call) => String(call[0]).includes('ENE'))
    expect(eneLabelCalls.length).toBeGreaterThan(0)
  })

  it('should draw any registered main indicator when active (WMA example)', () => {
    const layer = createLegendLayer(
      createLegendHost([{ instanceId: 'main:WMA', definitionId: 'wma' }]),
    )

    const ctx = createMockCanvasContext()
    layer.paint(
      createLegendContext(
        ctx,
        createMockStateReader('main:WMA', {
          timestamp: 1,
          series: [123],
          params: { period: 10 },
        }),
        { crosshairIndex: 0 },
      ),
    )

    const wmaLabelCalls = vi
      .mocked(ctx.fillText)
      .mock.calls.filter((call) => String(call[0]).includes('WMA'))
    expect(wmaLabelCalls.length).toBeGreaterThan(0)
  })
})

describe('MainIndicatorLegend external mode & context callback', () => {
  it('publishes legend context via onContext while still painting in canvas mode', () => {
    const onContext = vi.fn()
    const state = createTestMARenderState()
    const layer = createLegendLayer(
      createLegendHost([{ instanceId: MA_INSTANCE_ID, definitionId: 'ma' }]),
      { yPaddingPx: 20, onContext },
    )

    const ctx = createMockCanvasContext()
    layer.paint(
      createLegendContext(ctx, createMockStateReader(MA_INSTANCE_ID, state), {
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
    expect(vi.mocked(ctx.fillText).mock.calls.length).toBeGreaterThan(0)
  })

  it('does not paint canvas text when renderMode is external but still publishes context', () => {
    const onContext = vi.fn()
    const state = createTestMARenderState()
    const layer = createLegendLayer(
      createLegendHost([{ instanceId: MA_INSTANCE_ID, definitionId: 'ma' }]),
      { yPaddingPx: 20, onContext, renderMode: 'external' },
    )

    const ctx = createMockCanvasContext()
    layer.paint(
      createLegendContext(ctx, createMockStateReader(MA_INSTANCE_ID, state), {
        crosshairIndex: 10,
      }),
    )

    expect(onContext).toHaveBeenCalledTimes(1)
    expect(onContext.mock.calls[0]![0]).not.toBeNull()
    expect(vi.mocked(ctx.fillText)).not.toHaveBeenCalled()
  })

  it('retains custom KLineData fields in the currentBar slot context', () => {
    const onContext = vi.fn()
    const layer = createLegendLayer(createLegendHost([]), {
      yPaddingPx: 20,
      onContext,
      renderMode: 'external',
    })

    const ctx = createMockCanvasContext()
    const context = createLegendContext(ctx, createMockStateReader(MA_INSTANCE_ID), {
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
