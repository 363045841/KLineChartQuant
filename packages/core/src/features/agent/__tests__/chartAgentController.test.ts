/**
 * Agent 上下文投影测试：上下文只读取图表状态，不携带工具定义。
 */
import { describe, expect, it, vi } from 'vitest'
import type { IndicatorInstance, SymbolSpec } from '@/controllers/types'
import { SERIES_SELECTION_KIND } from '@/data/buffer/impl/seriesRepository'
import type { DrawingObject } from '@/engine/drawing/index'
import { ACTIVE_BUFFER_KIND, createDataState } from '@/engine/state/dataState'
import { CHART_AGENT_ERROR_CODES } from '@/errors'
import { createSignal } from '@/foundation/reactivity/signal'
import type { KLineData } from '@/foundation/types/price'
import { createChartAgentController } from '../impl/chartAgentController'
import type { ChartAgentToolDeps } from '../types'

const BAR_SELECTION = {
  kind: SERIES_SELECTION_KIND.bars,
  instrumentKey: 'TEST',
  sourceId: 'fixture',
  period: 'daily' as const,
  adjustment: 'none' as const,
  barAggregation: 'original' as const,
}

/** 构造一段带日期的 K 线。 */
function createBars(): KLineData[] {
  return ['2026-09-01', '2026-09-02', '2026-09-03'].map((date) => {
    const timestamp = Date.parse(date)
    return { timestamp, date, open: 1, high: 2, low: 1, close: 2, volume: 100 }
  })
}

/** 空工具依赖；上下文投影不触碰工具。 */
function stubTools(): ChartAgentToolDeps {
  return {
    indicators: {
      list: () => [],
      add: () => {
        throw new Error('not used')
      },
      update: () => false,
      move: () => false,
      remove: () => false,
      clear: () => 0,
      resolveDefinition: async () => null,
    },
    drawings: {
      list: () => [],
      create: () => {
        throw new Error('not used')
      },
      update: () => null,
      remove: () => false,
      copy: () => [],
      clear: () => 0,
    },
    comparisons: {
      list: () => [],
      add: () => false,
      create: async () => ({ status: 'added', symbol: '', name: '' }),
      remove: () => false,
      clear: () => 0,
    },
    market: {
      listSourceIds: () => [],
      lookupInstrument: async () => '',
      bars: async () => '',
      timeShare: async () => '',
      indicatorValues: async () => '',
    },
  }
}

/** 组装控制器；返回可写的状态信号以便逐项断言投影。 */
function createFixture() {
  const dataState = createDataState()
  const selectedRange = createSignal<{ from: number; to: number } | null>(null)
  const drawings = createSignal<ReadonlyArray<DrawingObject>>([])
  const selectedDrawingIds = createSignal<ReadonlyArray<string>>([])
  const controller = createChartAgentController({
    chartId: 'chart-1',
    dataState,
    currentSpec: createSignal<SymbolSpec | null>({
      symbol: 'BTCUSDT',
      market: 'crypto',
      exchange: 'BINANCE',
      period: 'daily',
      adjust: 'none',
      source: 'fixture',
    }),
    chartMode: createSignal<'kline' | 'timeshare' | 'fiveDayTimeShare'>('kline'),
    selectedRange,
    indicators: createSignal<ReadonlyArray<IndicatorInstance>>([
      {
        id: 'rsi-1',
        definitionId: 'RSI',
        label: 'RSI',
        name: 'RSI',
        paneId: 'pane-a',
        ordinal: 0,
        params: { period: 14, showLabel: true, invalid: Number.NaN },
      },
    ]),
    drawings,
    selectedDrawingIds,
    readPlacement: (paneId) => (paneId === 'main' ? 'main' : paneId === 'pane-a' ? 'rsi-1' : null),
    tools: stubTools(),
    marketDataTextFormatter: {
      formatBars: () => '',
      formatChartBars: () => 'chart bars text',
      formatInstrumentLookup: () => '',
      formatTimeShare: () => '',
      formatTimeShareRange: () => '',
    },
  })
  return { controller, dataState, selectedRange, drawings, selectedDrawingIds }
}

/** 发布一段可读的 K 线快照。 */
function publishBars(dataState: ReturnType<typeof createDataState>, bars = createBars()): void {
  dataState.actions.applyActiveBufferSnapshot({
    kind: ACTIVE_BUFFER_KIND.bars,
    selection: BAR_SELECTION,
    data: bars,
    loading: false,
    error: null,
    timezone: 'UTC',
    timeShareRange: null,
    timeSharePreClose: null,
  })
}

describe('chart agent context', () => {
  it('没有行情数据时投影为空，取上下文抛出可纠正错误', () => {
    const { controller } = createFixture()
    expect(controller.context()).toBeNull()
    expect(() => controller.getContext()).toThrow(
      expect.objectContaining({ code: CHART_AGENT_ERROR_CODES.NO_DATA }),
    )
  })

  it('投影标的信息、数据范围与已启用指标', () => {
    const { controller, dataState } = createFixture()
    publishBars(dataState)
    const context = controller.getContext()
    expect(context).toMatchObject({
      chartId: 'chart-1',
      symbol: 'BTCUSDT',
      market: 'crypto',
      exchange: 'BINANCE',
      period: 'kline',
      dataSource: 'fixture',
      adjustMode: 'none',
      timezone: 'UTC',
      dataRange: { bars: 3 },
    })
    expect(context.activeIndicators).toEqual([
      { instanceId: 'rsi-1', definitionId: 'RSI', params: { period: 14 } },
    ])
    expect(context.drawingSelection).toBeNull()
  })

  it('选定范围存在时附带已加载 K 线文本', () => {
    const { controller, dataState, selectedRange } = createFixture()
    publishBars(dataState)
    selectedRange.set({ from: Date.parse('2026-09-01'), to: Date.parse('2026-09-03') })
    expect(controller.getContext().selectedKLineBars).toBe('chart bars text')
  })

  it('选中图元按落点投影，无法寻址的容器保留为 null', () => {
    const { controller, dataState, drawings, selectedDrawingIds } = createFixture()
    publishBars(dataState)
    drawings.set([
      {
        id: 'd-main',
        kind: 'horizontal-line',
        paneId: 'main',
        visible: true,
        anchors: [{ id: 'a1', type: 'horizontal', time: 1_000, price: 10 }],
        params: {},
        style: { stroke: '#fff' },
      },
      {
        id: 'd-sub',
        kind: 'horizontal-line',
        paneId: 'pane-a',
        visible: true,
        anchors: [{ id: 'a2', type: 'horizontal', time: 1_000, price: 12 }],
        params: {},
        style: { stroke: '#fff' },
      },
      {
        id: 'd-other',
        kind: 'horizontal-line',
        paneId: 'pane-other',
        visible: true,
        anchors: [{ id: 'a3', type: 'horizontal', time: 1_000, price: 14 }],
        params: {},
        style: { stroke: '#fff' },
      },
    ])
    selectedDrawingIds.set(['d-main', 'd-sub', 'd-other'])
    const selection = controller.getContext().drawingSelection
    expect(selection?.selectedIds).toEqual(['d-main', 'd-sub', 'd-other'])
    expect(selection?.drawings.map((item) => item.placement)).toEqual(['main', 'rsi-1', null])
  })
})

describe('chart agent tool wiring', () => {
  it('控制器暴露组合根注入的工具依赖，不自行构造', () => {
    const tools = stubTools()
    const controller = createChartAgentController({
      chartId: 'chart-2',
      dataState: createDataState(),
      currentSpec: createSignal<SymbolSpec | null>(null),
      chartMode: createSignal<'kline' | 'timeshare' | 'fiveDayTimeShare'>('kline'),
      selectedRange: createSignal<{ from: number; to: number } | null>(null),
      indicators: createSignal<ReadonlyArray<IndicatorInstance>>([]),
      drawings: createSignal<ReadonlyArray<DrawingObject>>([]),
      selectedDrawingIds: createSignal<ReadonlyArray<string>>([]),
      readPlacement: () => null,
      tools,
      marketDataTextFormatter: {
        formatBars: vi.fn(() => ''),
        formatChartBars: vi.fn(() => ''),
        formatInstrumentLookup: vi.fn(() => ''),
        formatTimeShare: vi.fn(() => ''),
        formatTimeShareRange: vi.fn(() => ''),
      },
    })
    expect(controller.tools).toBe(tools)
  })
})
