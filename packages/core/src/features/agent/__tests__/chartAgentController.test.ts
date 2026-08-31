import { describe, expect, it, vi } from 'vitest'

import { createDataState } from '../../../engine/state/dataState'
import { MarketDataProviderRegistry } from '../../../data/provider/registry'
import { createSignal } from '../../../foundation/reactivity/signal'
import { createChartAgentController } from '../chartAgentController'
import { getRegisteredChartTools } from '../chartAgentController'
import { CHART_AGENT_ERROR_CODES } from '../errors'

import type { IndicatorInstance, SymbolSpec } from '../../../controllers/types'
import type { KLineData } from '../../../foundation/types/price'

const BAR_SELECTION = {
  kind: 'bars' as const,
  instrumentKey: 'TEST',
  sourceId: 'fixture',
  period: 'daily' as const,
  adjustment: 'none' as const,
}

function createBars(): KLineData[] {
  return [1_000, 2_000, 3_000, 4_000].map((timestamp) => ({
    timestamp,
    open: timestamp,
    high: timestamp + 1,
    low: timestamp - 1,
    close: timestamp,
    volume: 100,
  }))
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
  publishBars(dataState)

  const currentSpec = createSignal<SymbolSpec | null>({
    symbol: 'BTCUSDT',
    market: 'crypto',
    exchange: 'BINANCE',
    period: 'daily',
    adjust: 'none',
    source: 'fixture',
  })
  const selectedRange = createSignal<{ from: number; to: number } | null>(null)
  const chartMode = createSignal<'kline' | 'timeshare' | 'fiveDayTimeShare' | 'comparison'>(
    'kline',
  )
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
  const search = vi.fn(async () => [])
  const marketDataProviderRegistry = new MarketDataProviderRegistry()
  marketDataProviderRegistry.register({
    source: { id: 'fixture', displayName: 'Fixture' },
    probe: async () => ({ status: 'online', checkedAt: 1 }),
    catalog: { search },
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
      dataRange: { from: 1_000, to: 4_000, bars: 4 },
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

    await expect(fixture.controller.queryIndicator(input)).resolves.toBe('RSI compact text')
    expect(fixture.queryIndicator).toHaveBeenCalledOnce()
    expect(fixture.queryIndicator).toHaveBeenCalledWith(input)
  })

  it('delegates instrument searches through the shared Provider registry', async () => {
    const fixture = createFixture()
    const input = { keyword: '600519', limit: 20, sourceIds: ['fixture'] }

    await expect(fixture.controller.searchInstruments(input)).resolves.toEqual([])
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
    const tool = getRegisteredChartTools().find((item) => item.config.name === 'instruments_query_name')

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
})
