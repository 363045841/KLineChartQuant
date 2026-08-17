import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JSDOM } from 'jsdom'

import type { DataFetcher, KLineData, SymbolSpec } from '../../../controllers/types'
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
    vi.unstubAllGlobals()
  })

  it('flushes the first prepend hint when loading becomes idle', async () => {
    const now = Date.now()
    const initialStart = now - 365 * MS_PER_DAY
    let fetchCount = 0
    const fetcher: DataFetcher = async () => {
      fetchCount++
      return fetchCount === 1
        ? [makeKLine(initialStart), makeKLine(now)]
        : [makeKLine(initialStart - 90 * MS_PER_DAY)]
    }
    const spec: SymbolSpec = {
      symbol: 'sh.600000',
      market: 'CN',
      period: 'daily',
      adjust: 'none',
      source: 'mock',
    }
    const dataState = createDataState()
    const symbols$ = createSignal<ReadonlyArray<SymbolSpec>>([])
    const dataManagerState = createDataManagerState()
    const container = document.querySelector<HTMLDivElement>('#container')!
    const scrollContent = document.querySelector<HTMLDivElement>('#scroll-content')!
    manager = new ChartDataManager(
      createDependencies(
        { container, scrollContent },
        (symbols) => {
          symbols$.set(symbols)
          dataState.actions.setSymbols(symbols)
        },
        symbols$,
      ),
      dataState,
      dataManagerState,
    )
    manager.setDataFetcher(fetcher)
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
    const fetcher: DataFetcher = async () => {
      fetchCount++
      return [makeKLine(Date.now())]
    }
    const dataState = createDataState()
    const symbols$ = createSignal<ReadonlyArray<SymbolSpec>>([])
    const dataManagerState = createDataManagerState()
    const container = document.querySelector<HTMLDivElement>('#container')!
    const scrollContent = document.querySelector<HTMLDivElement>('#scroll-content')!
    manager = new ChartDataManager(
      createDependencies(
        { container, scrollContent },
        (symbols) => {
          symbols$.set(symbols)
          dataState.actions.setSymbols(symbols)
        },
        symbols$,
      ),
      dataState,
      dataManagerState,
    )
    manager.setDataFetcher(fetcher)

    manager.setSymbols([
      { symbol: '000001', market: 'CN', period: 'daily', source: 'mock' },
    ])
    await vi.waitFor(() => expect(manager!.dataBuffer.loading.peek()).toBe(false))

    manager.setSymbols([
      { symbol: '000001', market: 'HK', period: 'daily', source: 'mock' },
    ])
    await vi.waitFor(() => expect(manager!.dataBuffer.loading.peek()).toBe(false))

    expect(fetchCount).toBe(2)
  })

  it('schedules a draw after timeshare data finishes loading', async () => {
    const dataState = createDataState()
    const symbols$ = createSignal<ReadonlyArray<SymbolSpec>>([])
    const dataManagerState = createDataManagerState()
    const scheduleDraw = vi.fn()
    const container = document.querySelector<HTMLDivElement>('#container')!
    const scrollContent = document.querySelector<HTMLDivElement>('#scroll-content')!
    manager = new ChartDataManager(
      createDependencies(
        { container, scrollContent },
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
    manager.setTimeShareFetcher(async () => ({
      data: [{ timestamp: 1, price: 10, average: 10 }],
      preClose: 9.5,
    }))

    manager.setSymbols([{ symbol: '000001', market: 'CN', period: 'timeshare', source: 'mock' }])

    await vi.waitFor(() => expect(dataState.readonly.data.peek()).toHaveLength(1))
    expect(scheduleDraw).toHaveBeenCalled()
  })

  it(
    'mirrors active buffer lastError onto dataError',
    async () => {
      const fetcher: DataFetcher = async () => {
        throw new Error('[gotdx] stock/kline-by-date failed: 500')
      }
      const dataState = createDataState()
      const symbols$ = createSignal<ReadonlyArray<SymbolSpec>>([])
      const dataManagerState = createDataManagerState()
      const container = document.querySelector<HTMLDivElement>('#container')!
      const scrollContent = document.querySelector<HTMLDivElement>('#scroll-content')!
      manager = new ChartDataManager(
        createDependencies(
          { container, scrollContent },
          (symbols) => {
            symbols$.set(symbols)
            dataState.actions.setSymbols(symbols)
          },
          symbols$,
        ),
        dataState,
        dataManagerState,
      )
      manager.setDataFetcher(fetcher)
      manager.setSymbols([{ symbol: '158017', market: 'CN', period: 'daily', source: 'gotdx' }])

      await vi.waitFor(
        () =>
          expect(manager!.dataError.peek()).toBe('[gotdx] stock/kline-by-date failed: 500'),
        { timeout: 10_000 },
      )
    },
    15_000,
  )
})
