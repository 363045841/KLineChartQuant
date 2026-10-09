/** 主图 Legend 数据投影测试，Canvas 不再绘制标题。 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createContextWithInstanceState,
  createMARenderState,
  createMockCanvasContext,
  createMockIndicatorInstanceHost,
  type MockCanvasContext,
  type MockRenderContextOverrides,
} from '@/engine/__tests__/helpers/renderTestKit'
import { loadBuiltinIndicators } from '@/engine/indicators/registerBuiltins'
import type { LegendRow } from '@/engine/renderers/legend/types'
import type { PluginHost, RenderContext } from '@/plugin'
import type { KLineData } from '@/types/price'
import { createMainIndicatorLegendLayer } from '../impl/createMainIndicatorLegendLayer.js'
import type { LegendOptions } from '../types.js'

beforeAll(async () => {
  await loadBuiltinIndicators()
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** 固定主图实例身份：图例按实例枚举 metadata，并从帧读取器按该 ID 取投影。 */
const MA_INSTANCE_ID = 'main:MA'

let ctx: MockCanvasContext
let rows: ReadonlyArray<LegendRow> = []

beforeEach(() => {
  ctx = createMockCanvasContext()
  rows = []
})

/** 构造携带主图实例清单的图例宿主；空数组表示当前没有启用主图指标。 */
function createLegendHost(
  mainInstances: ReadonlyArray<{ instanceId: string; definitionId: string; hidden?: boolean }>,
): PluginHost {
  return createMockIndicatorInstanceHost(
    mainInstances.map(({ instanceId, definitionId, hidden }) => ({
      instanceId,
      definitionId,
      paneId: 'main',
      hidden: hidden === true,
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

/** 以固定主图实例构造图例宿主；definitionId 使用对外规范 ID（displayName）。 */
function createMAHost(definitionId = 'MA'): PluginHost {
  return createLegendHost([{ instanceId: MA_INSTANCE_ID, definitionId }])
}

/** 统计发布给 DOM renderer 的指标标题。 */
function countTitleRows(title: string): number {
  return countLegendTexts((text) => text === title)
}

/** 在已发布的展示文本中匹配字段。 */
function countLegendTexts(predicate: (text: string) => boolean): number {
  return rows.flatMap((row) => row.texts).filter((item) => predicate(item.text)).length
}

/**
 * 构造图例帧上下文，捕获发布给 DOM renderer 的展示行。
 */
function createLegendContext(
  instanceId: string,
  state: unknown,
  overrides: MockRenderContextOverrides = {},
): RenderContext {
  return createContextWithInstanceState(ctx, instanceId, state, {
    overlayCtx: ctx,
    publishLegendRows: (_paneId, next) => {
      rows = next
    },
    ...overrides,
  })
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
  it('keeps the indicator hover identity and position stable when the crosshair enters or leaves', () => {
    const layer = createLegendLayer(createMAHost())
    const state = createMARenderState()
    layer.paint(createLegendContext(MA_INSTANCE_ID, state, { crosshairIndex: null }))
    const idle = rows.find((row) => row.key === MA_INSTANCE_ID)!
    expect(idle.indicator).toEqual({ instanceId: MA_INSTANCE_ID, definitionId: 'MA' })

    layer.paint(createLegendContext(MA_INSTANCE_ID, state, { crosshairIndex: 50 }))
    const active = rows.find((row) => row.key === MA_INSTANCE_ID)!
    expect(active.y).toBe(idle.y)
    expect(active.indicator).toEqual(idle.indicator)

    layer.paint(createLegendContext(MA_INSTANCE_ID, state, { crosshairIndex: null }))
    expect(rows.find((row) => row.key === MA_INSTANCE_ID)?.y).toBe(idle.y)
  })

  it('reads visibility changes each frame while still publishing external context', () => {
    let config: LegendOptions = { visible: false }
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
    { configuredIds: ['MA'], viewIds: ['MA'], expected: 1 },
    { configuredIds: undefined, viewIds: ['MA'], expected: 1 },
    { configuredIds: [], viewIds: ['MA'], expected: 0 },
    { configuredIds: ['MA'], viewIds: [], expected: 0 },
    { configuredIds: ['BOLL'], viewIds: ['MA'], expected: 0 },
  ])(
    'intersects configured IDs with the view-visible IDs (expected $expected rows)',
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

  it('matches the configured ID and instance identity in the same canonical ID space', () => {
    const layer = createLegendLayer(createMAHost('MA'), {
      yPaddingPx: 20,
      getVisibleIndicatorIds: () => ['MA'],
    })
    layer.paint(createLegendContext(MA_INSTANCE_ID, createMARenderState()))
    expect(countTitleRows('MA')).toBe(1)
    expect(rows.find((row) => row.key === MA_INSTANCE_ID)?.indicator).toEqual({
      instanceId: MA_INSTANCE_ID,
      definitionId: 'MA',
    })
    expect(countLegendTexts((text) => text.includes('MA5'))).toBeGreaterThan(0)
  })

  it('does not paint MA when MA is not active', () => {
    const layer = createLegendLayer(createLegendHost([]))

    layer.paint(createLegendContext(MA_INSTANCE_ID, createMARenderState()))

    expect(countTitleRows('MA')).toBe(0)
  })

  it('carries the hidden flag into the legend row without dropping it', () => {
    const layer = createLegendLayer(
      createLegendHost([{ instanceId: MA_INSTANCE_ID, definitionId: 'MA', hidden: true }]),
    )

    layer.paint(createLegendContext(MA_INSTANCE_ID, createMARenderState()))

    const row = rows.find((entry) => entry.key === MA_INSTANCE_ID)
    expect(row?.hidden).toBe(true)
    expect(countTitleRows('MA')).toBe(1)
  })

  it('uses crosshairIndex when available', () => {
    const state = createMARenderState({
      series: { 5: Array.from({ length: 100 }, (_, i) => 100 + i) },
      enabledPeriods: [5],
    })
    const layer = createLegendLayer(createMAHost())

    layer.paint(createLegendContext(MA_INSTANCE_ID, state, { crosshairIndex: 50 }))

    expect(countLegendTexts((text) => text.includes('150.000'))).toBeGreaterThan(0)
  })

  it('uses the latest bar when crosshairIndex is null, not the visible range end', () => {
    const state = createMARenderState({
      series: { 5: Array.from({ length: 10 }, (_, i) => 100 + i) },
      enabledPeriods: [5],
    })
    const layer = createLegendLayer(createMAHost())

    layer.paint(
      createLegendContext(MA_INSTANCE_ID, state, {
        crosshairIndex: null,
        // 视口只覆盖前 5 根，取值仍应落在最新一根（索引 9），不随视口漂移。
        range: { start: 0, end: 5 },
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

    expect(countLegendTexts((text) => text.includes('109.000'))).toBeGreaterThan(0)
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

    expect(countLegendTexts((text) => text.includes('123.457'))).toBeGreaterThan(0)
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
    expect(countLegendTexts((text) => text.includes('999.99'))).toBeGreaterThan(0)
  })
})

/**
 * 主图指标标题行用例表：各指标 state 形状、展示名与取值格式不同，绘制路径相同。
 * 表驱动避免为每个指标复制同一套宿主、上下文与断言；expectedValueTexts
 * 逐条校验 getTitleInfo 的 state → 展示文本契约，而非仅确认标题出现。
 */
const MAIN_INDICATOR_CASES: ReadonlyArray<{
  instanceId: string
  definitionId: string
  title: string
  /** 各指标 getTitleInfo 消费的专属 state 形状。 */
  state: unknown
  /** 标题行应发布的取值文本（label + 三位小数），逐条校验 formatting。 */
  expectedValueTexts: readonly string[]
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
    expectedValueTexts: ['UP 120.000', 'MID 100.000', 'DN 80.000'],
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
    expectedValueTexts: ['FAST 10.000', 'SLOW 8.000'],
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
    expectedValueTexts: ['UP 20.000', 'MID 15.000', 'DN 10.000'],
  },
  {
    instanceId: 'main:WMA',
    definitionId: 'wma',
    title: 'WMA',
    state: { timestamp: 1, series: [123], params: { period: 10 } },
    expectedValueTexts: ['WMA 123.000'],
  },
]

describe('MainIndicatorLegend indicator rows', () => {
  it.each(MAIN_INDICATOR_CASES)(
    'publishes $title value rows from the frame state when active',
    ({ instanceId, definitionId, title, state, expectedValueTexts }) => {
      const layer = createLegendLayer(createLegendHost([{ instanceId, definitionId }]))

      layer.paint(createLegendContext(instanceId, state, { crosshairIndex: 0 }))

      expect(countTitleRows(title)).toBeGreaterThan(0)
      for (const text of expectedValueTexts) {
        expect(countLegendTexts((item) => item === text)).toBeGreaterThan(0)
      }
    },
  )
})

describe('MainIndicatorLegend context callback', () => {
  it('publishes DOM rows and the custom slot context from the same projection', () => {
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
    expect(countTitleRows('MA')).toBe(1)
    expect(ctx.fillText).not.toHaveBeenCalled()
  })

  it('retains custom KLineData fields in the currentBar slot context', () => {
    const onContext = vi.fn()
    const layer = createLegendLayer(createLegendHost([]), {
      yPaddingPx: 20,
      onContext,
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

describe('MainIndicatorLegend footprint title', () => {
  /** 足迹图进图例只依赖实例参数与身份：无逐柱数值，也不要求帧内有渲染状态。 */
  it('publishes the footprint name and params without a render state', () => {
    const host = createMockIndicatorInstanceHost([
      {
        instanceId: 'main:Footprint',
        definitionId: 'Footprint',
        paneId: 'main',
        hidden: false,
        params: { ticksPerRow: 300, imbalanceRatio: 3 },
      },
    ])
    const layer = createLegendLayer(host)

    layer.paint(createLegendContext('main:Footprint', undefined, { crosshairIndex: 0 }))

    expect(countTitleRows('足迹图')).toBe(1)
    expect(countLegendTexts((text) => text === '(300,3)')).toBe(1)
  })
})
