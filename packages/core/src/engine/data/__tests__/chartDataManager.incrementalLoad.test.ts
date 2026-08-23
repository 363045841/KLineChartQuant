import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JSDOM } from 'jsdom'

import type { KLineData, SymbolSpec } from '../../../controllers/types'
import { marketDataProviderRegistry } from '../../../data/provider/registry'
import type { MarketDataProvider } from '../../../data/provider/types'
import { createSignal } from '../../../foundation/reactivity/signal'
import type { ChartDom } from '../../chartTypes'
import { createComparisonState } from '../../state/comparisonState'
import { createDataManagerState } from '../../state/dataManagerState'
import { createDataState } from '../../state/dataState'
import type { ViewportStateModule } from '../../state/viewportState'
import { ChartDataManager, type DataDependencies } from '../chartDataManager'

const MS_PER_DAY = 86_400_000

function makeKLine(timestamp: number): KLineData {
  return {
    timestamp,
    open: 100,
    high: 110,
    low: 90,
    close: 105,
    volume: 1_000,
  }
}

function createMockViewport(scrollLeft = 800): ViewportStateModule {
  let scroll = scrollLeft
  return {
    readonly: {
      dpr: { peek: () => 1 },
      scrollLeft: { peek: () => scroll },
      scrollLeftLogical: { peek: () => scroll },
      leftLoadBufferWidth: { peek: () => 800 },
      contentWidth: { peek: () => 1600 },
      viewWidth: { peek: () => 800 },
      viewHeight: { peek: () => 600 },
      visibleRange: { peek: () => ({ start: 0, end: 0 }) },
      rawVisibleRange: { peek: () => ({ start: 0, end: 0 }) },
      viewport: {
        peek: () => ({
          viewWidth: 800,
          viewHeight: 600,
          plotWidth: 800,
          plotHeight: 600,
          scrollLeft: scroll,
          dpr: 1,
        }),
      },
    },
    actions: {
      scrollTo: (v: number) => {
        scroll = v
      },
    },
  } as unknown as ViewportStateModule
}

function instrumentFor(symbol: string) {
  return {
    id: `test:${symbol}`,
    sourceId: 'test',
    symbol,
    name: symbol,
    assetClass: 'stock' as const,
    exchange: 'SZ',
    sessionId: 'CN',
    capabilities: {
      bars: { periods: ['daily'] as const, adjustments: ['none'] as const },
      timeShare: true,
    },
  }
}

function registerTestProvider(provider: MarketDataProvider): void {
  if (marketDataProviderRegistry.get('test')) marketDataProviderRegistry.unregister('test')
  marketDataProviderRegistry.register(provider)
}

function createTestProvider(options: {
  fetchBars?: MarketDataProvider['bars']
  fetchTimeShare?: NonNullable<MarketDataProvider['timeShare']>['fetch']
  fetchTimeShareRange?: NonNullable<MarketDataProvider['timeShareRange']>['fetch']
}): MarketDataProvider {
  return {
    source: {
      id: 'test',
      displayName: 'Test',
      capabilities: {
        assetClasses: ['stock'],
        bars: { periods: ['daily'], adjustments: ['none'] },
        timeShare: true,
        ...(options.fetchTimeShareRange ? { timeShareRange: { maxTradingDays: 5 } } : {}),
      },
    },
    async probe() {
      return { status: 'online', checkedAt: 1 }
    },
    catalog: {
      async search(query) {
        return [instrumentFor(query.keyword)]
      },
    },
    bars: options.fetchBars,
    timeShare: options.fetchTimeShare ? { fetch: options.fetchTimeShare } : undefined,
    timeShareRange: options.fetchTimeShareRange ? { fetch: options.fetchTimeShareRange } : undefined,
  }
}

function createDependencies(
  dom: ChartDom,
  setSymbols: (symbols: ReadonlyArray<SymbolSpec>) => void,
  symbols$: ReturnType<typeof createSignal<ReadonlyArray<SymbolSpec>>>,
  scheduleDraw: () => void = () => {},
): DataDependencies {
  return {
    getOption: () => ({ kWidth: 8, kGap: 2 }),
    getZoomLevel: () => 1,
    setZoomLevel: () => {},
    getDom: () => dom,
    viewport: createMockViewport(),
    comparison: createComparisonState({ symbols$ }),
    scheduleDraw,
    resetInteraction: () => {},
    getIndicatorScheduler: () => ({
      update: () => true,
      busySignal: createSignal(false),
    }),
    isPointerDown: () => false,
    onTimeShareDataReady: () => {},
    setSymbols,
  }
}

function createChartDom(document: Document): ChartDom {
  return {
    container: document.querySelector<HTMLDivElement>('#container')!,
    scrollContent: document.querySelector<HTMLDivElement>('#scroll-content')!,
    canvasLayer: document.createElement('div'),
    rightAxisLayer: document.createElement('div'),
    xAxisCanvas: document.createElement('canvas'),
  }
}

describe('ChartDataManager incremental load', () => {
  let manager: ChartDataManager | null = null
  let document: Document

  beforeEach(() => {
    const dom = new JSDOM('<div id="container"><div id="scroll-content"></div></div>')
    document = dom.window.document
    vi.stubGlobal('window', dom.window)
  })

  afterEach(() => {
    manager?.destroy()
    manager = null
    marketDataProviderRegistry.unregister('test')
    vi.unstubAllGlobals()
  })

  it('flushes the first prepend hint when loading becomes idle', async () => {
    const now = Date.now()
    const initialStart = now - 365 * MS_PER_DAY
    let fetchCount = 0
    registerTestProvider(
      createTestProvider({
        fetchBars: {
          async fetch() {
            fetchCount++
            return {
              instrumentId: 'test:sh.600000',
              period: 'daily',
              adjustment: 'none',
              timezone: 'Asia/Shanghai',
              olderData: fetchCount === 1 ? 'available' : 'exhausted',
              data:
                fetchCount === 1
                  ? [makeKLine(initialStart), makeKLine(now)]
                  : [makeKLine(initialStart - 90 * MS_PER_DAY)],
            }
          },
        },
      }),
    )
    const spec: SymbolSpec = {
      symbol: 'sh.600000',
      market: 'CN',
      period: 'daily',
      adjust: 'none',
      source: 'test',
      instrument: instrumentFor('sh.600000'),
    }
    const dataState = createDataState()
    const symbols$ = createSignal<ReadonlyArray<SymbolSpec>>([])
    const dataManagerState = createDataManagerState()
    manager = new ChartDataManager(
      createDependencies(
        createChartDom(document),
        (symbols) => {
          symbols$.set(symbols)
          dataState.actions.setSymbols(symbols)
        },
        symbols$,
      ),
      dataState,
      dataManagerState,
    )
    manager.setSymbols([spec])

    await vi.waitFor(() => expect(manager!.dataBuffer.loading.peek()).toBe(false))
    expect(dataState.readonly.loading.peek()).toBe(false)

    manager.dataBuffer.ensureRange(initialStart - 30 * MS_PER_DAY, initialStart)

    await vi.waitFor(() => expect(manager!.dataBuffer.loading.peek()).toBe(false))
    await vi.waitFor(() => {
      expect(dataState.readonly.loading.peek()).toBe(false)
      expect(dataManagerState.readonly.pendingIncrementalLoad.peek().count).toBe(0)
    })
    const hint = document.querySelector<HTMLDivElement>('.klc-incremental-load-hint')
    expect(hint).not.toBeNull()
    expect(hint!.style.opacity).toBe('1')
    expect(hint!.style.left).toBe('800px')
    expect(hint!.style.background).toContain('--klc-color-selection-fill')
    expect(fetchCount).toBe(2)
  })

  it('does not reuse primary data across unified markets', async () => {
    let fetchCount = 0
    registerTestProvider(
      createTestProvider({
        fetchBars: {
          async fetch() {
            fetchCount++
            return {
              instrumentId: 'test:000001',
              period: 'daily',
              adjustment: 'none',
              timezone: 'Asia/Shanghai',
              olderData: 'unknown',
              data: [makeKLine(Date.now())],
            }
          },
        },
      }),
    )
    const dataState = createDataState()
    const symbols$ = createSignal<ReadonlyArray<SymbolSpec>>([])
    const dataManagerState = createDataManagerState()
    manager = new ChartDataManager(
      createDependencies(
        createChartDom(document),
        (symbols) => {
          symbols$.set(symbols)
          dataState.actions.setSymbols(symbols)
        },
        symbols$,
      ),
      dataState,
      dataManagerState,
    )
    manager.setSymbols([
      {
        symbol: '000001',
        market: 'CN',
        period: 'daily',
        source: 'test',
        instrument: { ...instrumentFor('000001'), id: 'test:CN:000001' },
      },
    ])
    await vi.waitFor(() => expect(manager!.dataBuffer.loading.peek()).toBe(false))

    manager.setSymbols([
      {
        symbol: '000001',
        market: 'HK',
        period: 'daily',
        source: 'test',
        instrument: { ...instrumentFor('000001'), id: 'test:HK:000001', sessionId: 'HK' },
      },
    ])
    await vi.waitFor(() => expect(manager!.dataBuffer.loading.peek()).toBe(false))

    expect(fetchCount).toBe(2)
  })

  it('schedules a draw after timeshare data finishes loading', async () => {
    const dataState = createDataState()
    const symbols$ = createSignal<ReadonlyArray<SymbolSpec>>([])
    const dataManagerState = createDataManagerState()
    const scheduleDraw = vi.fn()
    manager = new ChartDataManager(
      createDependencies(
        createChartDom(document),
        (symbols) => {
          symbols$.set(symbols)
          dataState.actions.setSymbols(symbols)
        },
        symbols$,
        scheduleDraw,
      ),
      dataState,
      dataManagerState,
    )
    registerTestProvider(
      createTestProvider({
        fetchTimeShare: async () => ({
          instrumentId: 'test:000001',
          tradingDate: '2026-08-06',
          timezone: 'Asia/Shanghai',
          preClose: 9.5,
          data: [{ timestamp: 1, price: 10, average: 10 }],
        }),
      }),
    )

    manager.setSymbols([
      {
        symbol: '000001',
        market: 'CN',
        period: 'timeshare',
        source: 'test',
        instrument: instrumentFor('000001'),
      },
    ])

    await vi.waitFor(() => expect(dataState.readonly.data.peek()).toHaveLength(1))
    expect(scheduleDraw).toHaveBeenCalled()
  })

  it('loads five-day timeshare through the range Provider and stores the grouped snapshot', async () => {
    const dataState = createDataState()
    const symbols$ = createSignal<ReadonlyArray<SymbolSpec>>([])
    const dataManagerState = createDataManagerState()
    const fetchTimeShareRange = vi.fn(async () => ({
      instrumentId: 'test:000001',
      timezone: 'Asia/Shanghai',
      requestedDays: 5,
      olderData: 'unknown' as const,
      days: [
        {
          tradingDate: '2026-08-05' as const,
          preClose: 9.5,
          data: [{ timestamp: 1, price: 10, average: 10 }],
        },
        {
          tradingDate: '2026-08-06' as const,
          preClose: 10,
          data: [{ timestamp: 2, price: 11, average: 11 }],
        },
      ],
    }))
    manager = new ChartDataManager(
      createDependencies(
        createChartDom(document),
        (symbols) => {
          symbols$.set(symbols)
          dataState.actions.setSymbols(symbols)
        },
        symbols$,
      ),
      dataState,
      dataManagerState,
    )
    registerTestProvider(createTestProvider({ fetchTimeShareRange }))

    manager.setSymbols([
      {
        symbol: '000001',
        market: 'CN',
        period: '5daytimeshare',
        source: 'test',
        instrument: {
          ...instrumentFor('000001'),
          capabilities: { timeShare: true, timeShareRange: { maxTradingDays: 5 } },
        },
      },
    ])

    await vi.waitFor(() => expect(dataState.readonly.timeShareRange.peek()?.days).toHaveLength(2))
    expect(fetchTimeShareRange).toHaveBeenCalledWith(
      expect.objectContaining({ endTradingDate: expect.any(String), days: 5 }),
    )
    expect(dataState.readonly.data.peek()).toHaveLength(2)
    expect(dataState.readonly.timeShareRange.peek()?.days[1]?.preClose).toBe(10)
  })

  it('keeps custom source data isolated from a Provider with the same label', async () => {
    const providerData = makeKLine(2)
    const fetchBars = vi.fn(async () => ({
      instrumentId: 'test:000001',
      period: 'daily' as const,
      adjustment: 'none' as const,
      timezone: 'Asia/Shanghai',
      olderData: 'exhausted' as const,
      data: [providerData],
    }))
    registerTestProvider(createTestProvider({ fetchBars: { fetch: fetchBars } }))
    const dataState = createDataState()
    const symbols$ = createSignal<ReadonlyArray<SymbolSpec>>([])
    const dataManagerState = createDataManagerState()
    manager = new ChartDataManager(
      createDependencies(
        createChartDom(document),
        (symbols) => {
          symbols$.set(symbols)
          dataState.actions.setSymbols(symbols)
        },
        symbols$,
      ),
      dataState,
      dataManagerState,
    )

    manager.applyCustomData({
      market: 'CN',
      symbol: '000001',
      source: 'test',
      data: [makeKLine(1)],
    })
    expect(manager.getData()[0]?.timestamp).toBe(1)

    manager.resetToFetcher({
      market: 'CN',
      symbol: '000001',
      period: 'daily',
      adjust: 'none',
      source: 'test',
      instrument: instrumentFor('000001'),
    })

    await vi.waitFor(() => expect(manager!.getData()[0]?.timestamp).toBe(2))
    expect(fetchBars).toHaveBeenCalledOnce()
  })

  it('mirrors active buffer lastError onto dataError', async () => {
    registerTestProvider(
      createTestProvider({
        fetchBars: {
          async fetch() {
            throw new Error('[gotdx] stock/kline-by-date failed: 500')
          },
        },
      }),
    )
    const dataState = createDataState()
    const symbols$ = createSignal<ReadonlyArray<SymbolSpec>>([])
    const dataManagerState = createDataManagerState()
    manager = new ChartDataManager(
      createDependencies(
        createChartDom(document),
        (symbols) => {
          symbols$.set(symbols)
          dataState.actions.setSymbols(symbols)
        },
        symbols$,
      ),
      dataState,
      dataManagerState,
    )
    manager.setSymbols([
      {
        symbol: '158017',
        market: 'CN',
        period: 'daily',
        source: 'test',
        instrument: instrumentFor('158017'),
      },
    ])

    await vi.waitFor(
      () =>
        expect(manager!.dataError.peek()).toBe(
          '[test] Error: [gotdx] stock/kline-by-date failed: 500',
        ),
      { timeout: 10_000 },
    )
  }, 15_000)
})
