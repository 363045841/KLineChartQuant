import { describe, expect, it, vi } from 'vitest'

import { createDataState } from '../../../engine/state/dataState'
import { createDrawingState } from '../../../engine/state/drawingState'
import { DrawingDocument } from '../../../engine/drawing/DrawingDocument'
import { DrawingCommands } from '../../../engine/drawing/DrawingCommands'
import { MarketDataProviderRegistry } from '../../../data/provider/registry'
import { MarketDataCache } from '../../../data/buffer/marketDataCache'
import { createSignal } from '../../../foundation/reactivity/signal'
import { createChartAgentController } from '../chartAgentController'
import { getRegisteredChartTools } from '../chartAgentController'
import { CHART_AGENT_ERROR_CODES } from '../errors'

import type { IndicatorInstance, SymbolSpec } from '../../../controllers/types'
import type { BarSeries, TimeShareRange, TimeShareSeries } from '../../../data/provider/types'
import type { KLineData } from '../../../foundation/types/price'

const BAR_SELECTION = {
  kind: 'bars' as const,
  instrumentKey: 'TEST',
  sourceId: 'fixture',
  period: 'daily' as const,
  adjustment: 'none' as const,
}

function createBars(): KLineData[] {
  return ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'].map((date, index) => {
    const timestamp = Date.parse(date) + (index === 0 ? 25_200_000 : 0)
    return {
      timestamp,
      date,
      open: timestamp,
      high: timestamp + 1,
      low: timestamp - 1,
      close: timestamp,
      volume: 100,
    }
  })
}

function publishBars(dataState: ReturnType<typeof createDataState>, bars = createBars()): void {
  dataState.actions.applyActiveBufferSnapshot({
    kind: 'bars',
    selection: BAR_SELECTION,
    data: bars,
    loading: false,
    error: null,
    timeShareRange: null,
    timeSharePreClose: null,
  })
}

function createFixture() {
  const dataState = createDataState()
  const bars = createBars()
  publishBars(dataState, bars)
  const drawingState = createDrawingState()
  const drawingDocument = new DrawingDocument({
    drawingState,
    getLogicalIndexAtTimestamp: (timestamp) => {
      const index = bars.findIndex((bar) => bar.timestamp === timestamp)
      return index === -1 ? null : index
    },
    findAnchorAtTradingDate: (tradingDate) => {
      const index = bars.findIndex((bar) => bar.date === tradingDate)
      const bar = index === -1 ? undefined : bars[index]
      return bar === undefined ? null : { index, timestamp: bar.timestamp }
    },
    hasPaneId: (paneId) => paneId === 'main',
  })
  const requestDraw = vi.fn()
  const drawingCommands = new DrawingCommands({ document: drawingDocument, requestDraw })

  const currentSpec = createSignal<SymbolSpec | null>({
    symbol: 'BTCUSDT',
    market: 'crypto',
    exchange: 'BINANCE',
    period: 'daily',
    adjust: 'none',
    source: 'fixture',
  })
  const selectedRange = createSignal<{ from: number; to: number } | null>(null)
  const chartMode = createSignal<'kline' | 'timeshare' | 'fiveDayTimeShare' | 'comparison'>('kline')
  const indicatorParams = { period: 14, showLabel: true, invalid: Number.NaN }
  const indicators = createSignal<ReadonlyArray<IndicatorInstance>>([
    {
      id: 'rsi-1',
      definitionId: 'RSI',
      label: 'RSI',
      name: 'RSI',
      role: 'sub',
      paneId: 'rsi-pane',
      params: indicatorParams,
    },
  ])
  const queryIndicator = vi.fn(async () => 'RSI compact text')
  const marketDataProviderRegistry = new MarketDataProviderRegistry()
  const instrument = {
    id: 'fixture:BTCUSDT',
    sourceId: 'fixture',
    symbol: 'BTCUSDT',
    name: 'Bitcoin',
    assetClass: 'crypto' as const,
    exchange: 'BINANCE',
    capabilities: {
      bars: { periods: ['daily'] as const, adjustments: ['none'] as const },
      timeShare: true,
      timeShareRange: { maxTradingDays: 5 },
    },
  }
  const search = vi.fn(async () => [instrument])
  const fetchBars = vi.fn(async (): Promise<BarSeries> => ({
    instrumentId: instrument.id,
    period: 'daily',
    adjustment: 'none',
    timezone: 'UTC',
    data: createBars(),
    olderData: 'exhausted',
  }))
  const fetchTimeShare = vi.fn(async (): Promise<TimeShareSeries> => ({
    instrumentId: instrument.id,
    tradingDate: '2026-09-01' as const,
    timezone: 'UTC',
    preClose: 100,
    data: [{ timestamp: 3_600_000, price: 101, average: 100, volume: 10 }],
  }))
  const fetchTimeShareRange = vi.fn(async (): Promise<TimeShareRange> => ({
    instrumentId: instrument.id,
    timezone: 'UTC',
    requestedDays: 2,
    olderData: 'available' as const,
    days: [
      {
        tradingDate: '2026-09-01' as const,
        preClose: 100,
        data: [{ timestamp: 7_200_000, price: 102, average: 101, volume: 20 }],
      },
    ],
  }))
  marketDataProviderRegistry.register({
    source: {
      id: 'fixture',
      displayName: 'Fixture',
      capabilities: {
        assetClasses: ['crypto'],
        bars: { periods: ['daily'], adjustments: ['none'] },
        timeShare: true,
        timeShareRange: { maxTradingDays: 5 },
      },
    },
    probe: async () => ({ status: 'online', checkedAt: 1 }),
    catalog: {
      search,
    },
    bars: { fetch: fetchBars },
    timeShare: { fetch: fetchTimeShare },
    timeShareRange: { fetch: fetchTimeShareRange },
  })
  const controller = createChartAgentController({
    chartId: 'chart-fixture',
    dataState,
    currentSpec,
    chartMode,
    selectedRange,
    indicators,
    indicatorQuery: { queryIndicator },
    marketDataProviderRegistry,
    marketDataCache: new MarketDataCache(marketDataProviderRegistry),
    drawingDocument,
    drawingCommands,
    getDrawingPaneIds: () => ['main'],
  })

  return {
    controller,
    currentSpec,
    chartMode,
    dataState,
    selectedRange,
    indicatorParams,
    indicators,
    queryIndicator,
    search,
    fetchBars,
    fetchTimeShare,
    fetchTimeShareRange,
    drawingDocument,
    requestDraw,
  }
}

describe('createChartAgentController', () => {
  it('returns a detached, deeply immutable, serializable context snapshot', () => {
    const fixture = createFixture()

    const snapshot = fixture.controller.getContext()

    expect(snapshot).toEqual({
      chartId: 'chart-fixture',
      symbol: 'BTCUSDT',
      market: 'crypto',
      exchange: 'BINANCE',
      period: 'kline',
      dataSource: 'fixture',
      timezone: null,
      adjustMode: 'none',
      dataRange: {
          from: Date.parse('2026-09-01') + 25_200_000,
        to: Date.parse('2026-09-04'),
        bars: 4,
      },
      visibleRange: null,
      activeIndicators: [{ instanceId: 'rsi-1', definitionId: 'RSI', params: { period: 14 } }],
      dataRevision: 1,
    })
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot)
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.dataRange)).toBe(true)
    expect(Object.isFrozen(snapshot.activeIndicators)).toBe(true)
    expect(Object.isFrozen(snapshot.activeIndicators[0])).toBe(true)
    expect(Object.isFrozen(snapshot.activeIndicators[0]?.params)).toBe(true)

    fixture.currentSpec.set({ symbol: 'ETHUSDT', market: 'crypto' })
    fixture.indicatorParams.period = 9

    expect(snapshot.symbol).toBe('BTCUSDT')
    expect(snapshot.activeIndicators[0]?.params.period).toBe(14)
  })

  it('returns a stable chart identity and fresh read-only snapshots', () => {
    const fixture = createFixture()

    const first = fixture.controller.getContext()
    const second = fixture.controller.getContext()

    expect(first).not.toBe(second)
    expect(first.chartId).toBe(second.chartId)
  })

  it('rejects an unavailable market-data source ID with enabled IDs needed to retry', async () => {
    const fixture = createFixture()

    await expect(
      fixture.controller.queryBars({
        symbol: 'BTCUSDT',
        sourceId: 'akshare',
        period: 'daily',
        adjustment: 'none',
        limit: 100,
      }),
    ).rejects.toMatchObject({
      code: CHART_AGENT_ERROR_CODES.INVALID_QUERY,
      message:
        "Unknown or disabled sourceId 'akshare'. Available sourceIds: fixture. Omit sourceId to allow automatic routing across every enabled source.",
    })
  })

  it('projects StateKernel changes through the context signal', () => {
    const fixture = createFixture()
    const observed: Array<string | null> = []
    const unsubscribe = fixture.controller.context.subscribe(() => {
      observed.push(fixture.controller.context()?.symbol ?? null)
    })

    fixture.currentSpec.set({ symbol: 'ETHUSDT', market: 'crypto' })

    expect(fixture.controller.context()?.symbol).toBe('ETHUSDT')
    expect(observed).toEqual(['ETHUSDT'])
    unsubscribe()
  })

  it('uses only the StateKernel range-selection for its displayed range', () => {
    const fixture = createFixture()

    fixture.selectedRange.set({ from: 1_000, to: 3_000 })

    expect(fixture.controller.context()?.visibleRange).toEqual({ from: 1_000, to: 3_000 })
    fixture.selectedRange.set(null)
    expect(fixture.controller.context()?.visibleRange).toBeNull()
  })

  it('uses the StateKernel chart mode without inferring from the data buffer', () => {
    const fixture = createFixture()

    fixture.chartMode.set('fiveDayTimeShare')

    expect(fixture.controller.context()?.period).toBe('fiveDayTimeShare')
  })

  it('throws a typed no-data error for an absent or empty active series', () => {
    const fixture = createFixture()
    fixture.dataState.actions.reset()

    expect(() => fixture.controller.getContext()).toThrowError(
      expect.objectContaining({ code: CHART_AGENT_ERROR_CODES.NO_DATA }),
    )

    publishBars(fixture.dataState, [])
    expect(() => fixture.controller.getContext()).toThrowError(
      expect.objectContaining({ code: CHART_AGENT_ERROR_CODES.NO_DATA }),
    )
  })

  it('delegates indicator queries and preserves compact text verbatim', async () => {
    const fixture = createFixture()
    const input = { definitionId: 'RSI', params: { period: 14 }, limit: 20 }
    const tool = getRegisteredChartTools().find((item) => item.config.name === 'indicators_query')

    await expect(fixture.controller.queryIndicator(input)).resolves.toBe('RSI compact text')
    await expect(
      tool?.execute(fixture.controller, input, {
        signal: new AbortController().signal,
        progress: () => undefined,
      }),
    ).resolves.toBe('RSI compact text')
    expect(fixture.queryIndicator).toHaveBeenCalledTimes(2)
    expect(fixture.queryIndicator).toHaveBeenLastCalledWith(input)
  })

  it('executes drawing CRUD through the registered document tools', async () => {
    const fixture = createFixture()
    const signal = new AbortController().signal
    const create = getRegisteredChartTools().find((tool) => tool.config.name === 'drawing_create')!
    const update = getRegisteredChartTools().find((tool) => tool.config.name === 'drawing_update')!
    const list = getRegisteredChartTools().find((tool) => tool.config.name === 'drawings_list')!
    const remove = getRegisteredChartTools().find((tool) => tool.config.name === 'drawing_delete')!

    const created = (await create.execute(
      fixture.controller,
      {
        kind: 'trend-line',
        paneId: 'main',
        anchors: [
          { tradingDate: '2026-09-01', price: 10 },
          { tradingDate: '2026-09-02', price: 12 },
        ],
      },
      { signal, progress: () => undefined },
    )) as { id: string; anchors: Array<{ timestamp: number; price: number; index?: number }> }

    expect(created.anchors).toEqual([
      { timestamp: Date.parse('2026-09-01') + 25_200_000, price: 10 },
      { timestamp: Date.parse('2026-09-02'), price: 12 },
    ])
    await expect(
      update.execute(
        fixture.controller,
        {
          drawingId: created.id,
          patch: {
            anchors: [
              { tradingDate: '2026-09-03', price: 11 },
              { tradingDate: '2026-09-04', price: 13 },
            ],
          },
        },
        { signal, progress: () => undefined },
      ),
    ).resolves.toMatchObject({
      id: created.id,
      anchors: [
        { timestamp: Date.parse('2026-09-03'), price: 11 },
        { timestamp: Date.parse('2026-09-04'), price: 13 },
      ],
    })
    await expect(
      list.execute(fixture.controller, {}, { signal, progress: () => undefined }),
    ).resolves.toEqual([expect.objectContaining({ id: created.id })])
    await expect(
      remove.execute(
        fixture.controller,
        { drawingId: created.id },
        { signal, progress: () => undefined },
      ),
    ).resolves.toEqual({ removed: true })
    expect(fixture.drawingDocument.listDrawings()).toEqual([])
    expect(fixture.requestDraw).toHaveBeenCalledTimes(3)
  })

  it('creates a horizontal line from a price-only Agent anchor', async () => {
    const fixture = createFixture()
    const create = getRegisteredChartTools().find((tool) => tool.config.name === 'drawing_create')!
    const signal = new AbortController().signal

    await expect(
      create.execute(
        fixture.controller,
        { kind: 'horizontal-line', paneId: 'main', anchors: [{ price: 9 }] },
        { signal, progress: () => undefined },
      ),
    ).resolves.toMatchObject({ kind: 'horizontal-line', anchors: [{ timestamp: null, price: 9 }] })
  })

  it('delegates instrument searches through the shared Provider registry', async () => {
    const fixture = createFixture()
    const input = { keyword: '600519', limit: 20, sourceIds: ['fixture'] }

    await expect(fixture.controller.searchInstruments(input)).resolves.toEqual([
      expect.objectContaining({ symbol: 'BTCUSDT' }),
    ])
    expect(fixture.search).toHaveBeenCalledWith({
      keyword: '600519',
      limit: 20,
      sourceIds: undefined,
      assetClasses: undefined,
      signal: undefined,
    })
  })

  it('exposes exact instrument lookup through the same decorated Core method', async () => {
    const fixture = createFixture()
    const match = {
      id: 'stock:600519',
      sourceId: 'fixture',
      symbol: '600519',
      name: '贵州茅台',
      assetClass: 'stock' as const,
      exchange: 'SH',
      capabilities: {},
    }
    fixture.search.mockResolvedValue([match])
    const input = { symbol: '600519', sourceIds: ['fixture'] }
    const tool = getRegisteredChartTools().find(
      (item) => item.config.name === 'instruments_query_name',
    )

    await expect(fixture.controller.lookupInstrumentsBySymbol(input)).resolves.toEqual([match])
    await expect(
      tool?.execute(fixture.controller, input, {
        signal: new AbortController().signal,
        progress: () => undefined,
      }),
    ).resolves.toEqual([match])
    expect(fixture.search).toHaveBeenLastCalledWith({
      keyword: '600519',
      limit: 100,
      signal: expect.any(AbortSignal),
    })
  })

  it('queries market data through the same decorated APIs without changing chart state', async () => {
    const fixture = createFixture()
    const signal = new AbortController().signal
    const barsInput = {
      symbol: 'BTCUSDT',
      sourceId: 'fixture',
      exchange: 'BINANCE',
      assetClass: 'crypto' as const,
      period: 'daily' as const,
      adjustment: 'none' as const,
      limit: 100,
    }
    const timeShareInput = {
      symbol: 'BTCUSDT',
      sourceId: 'fixture',
      tradingDate: '2026-09-01' as const,
    }
    const rangeInput = {
      symbol: 'BTCUSDT',
      sourceId: 'fixture',
      endTradingDate: '2026-09-01' as const,
      days: 2,
    }

    const barsTool = getRegisteredChartTools().find(
      (item) => item.config.name === 'market_bars_query',
    )
    const timeShareTool = getRegisteredChartTools().find(
      (item) => item.config.name === 'market_timeshare_query',
    )
    const rangeTool = getRegisteredChartTools().find(
      (item) => item.config.name === 'market_timeshare_range_query',
    )

    await expect(fixture.controller.queryBars(barsInput)).resolves.toContain('source=fixture')
    await expect(
      barsTool?.execute(fixture.controller, barsInput, { signal, progress: () => undefined }),
    ).resolves.toContain('source=fixture')
    await expect(fixture.controller.queryTimeShare(timeShareInput)).resolves.toContain(
      'source=fixture',
    )
    await expect(
      timeShareTool?.execute(fixture.controller, timeShareInput, {
        signal,
        progress: () => undefined,
      }),
    ).resolves.toContain('source=fixture')
    await expect(fixture.controller.queryTimeShareRange(rangeInput)).resolves.toContain(
      'source=fixture',
    )
    await expect(
      rangeTool?.execute(fixture.controller, rangeInput, { signal, progress: () => undefined }),
    ).resolves.toContain('source=fixture')

    expect(fixture.fetchBars).toHaveBeenCalledOnce()
    expect(fixture.fetchTimeShare).toHaveBeenCalledOnce()
    expect(fixture.fetchTimeShareRange).toHaveBeenCalledOnce()
    expect(fixture.controller.getContext().symbol).toBe('BTCUSDT')
  })

  it('passes the registered market bars timestamp cursor through unchanged', async () => {
    const fixture = createFixture()
    const tool = getRegisteredChartTools().find((item) => item.config.name === 'market_bars_query')

    await expect(
      tool?.execute(
        fixture.controller,
        {
          symbol: 'BTCUSDT',
          sourceId: 'fixture',
          period: 'daily',
          adjustment: 'none',
          limit: 100,
          beforeTimestamp: Date.parse('2026-09-01'),
        },
        { signal: new AbortController().signal, progress: () => undefined },
      ),
    ).resolves.toContain('source=fixture')

    expect(fixture.fetchBars).toHaveBeenCalledWith(
      expect.objectContaining({ beforeTimestamp: Date.parse('2026-09-01') }),
    )
  })

  it('formats market query timestamps with the returned timezone', async () => {
    const fixture = createFixture()

    await expect(
      fixture.controller.queryBars({
        symbol: 'BTCUSDT',
        sourceId: 'fixture',
        period: 'daily',
        adjustment: 'none',
        limit: 100,
      }),
    ).resolves.toMatch(/\| 2026-09-01/)
    await expect(
      fixture.controller.queryTimeShare({
        symbol: 'BTCUSDT',
        sourceId: 'fixture',
        tradingDate: '2026-09-01',
      }),
    ).resolves.toContain('| 1970-01-01 01:00 |')
    await expect(
      fixture.controller.queryTimeShareRange({
        symbol: 'BTCUSDT',
        sourceId: 'fixture',
        endTradingDate: '2026-09-01',
        days: 2,
      }),
    ).resolves.toContain('| 1970-01-01 02:00 |')
  })
})
