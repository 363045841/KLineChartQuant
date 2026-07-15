import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JSDOM } from 'jsdom'

import type { DataFetcher, KLineData, SymbolSpec } from '../../../controllers/types'
import { computed, createSignal } from '../../../foundation/reactivity/signal'
import type { ChartDom } from '../../chartTypes'
import { createDataManagerState } from '../../state/dataManagerState'
import { createDataState } from '../../state/dataState'
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

function createDependencies(
  dom: ChartDom,
  setSymbols: (symbols: ReadonlyArray<SymbolSpec>) => void,
  symbols$: ReturnType<typeof createSignal<ReadonlyArray<SymbolSpec>>>,
): DataDependencies {
  let scrollLeft = 800
  return {
    getOption: () => ({ kWidth: 8, kGap: 2 }),
    getEffectiveDpr: () => 1,
    getLogicalScrollLeft: () => scrollLeft,
    getCachedScrollLeft: () => scrollLeft,
    setScrollLeft: (value) => {
      scrollLeft = value
    },
    getDom: () => dom,
    getObservedSize: () => ({ width: 800, height: 600 }),
    getViewport: () => null,
    getVisibleRange: () => null,
    getLeftLoadBufferWidth: () => 800,
    getContentWidth: () => 1600,
    scheduleDraw: () => {},
    resetInteraction: () => {},
    getIndicatorScheduler: () => ({
      update: () => true,
      busySignal: createSignal(false),
    }),
    isPointerDown: () => false,
    onTimeShareDataReady: () => {},
    setSymbols,
    setComparisonLoading: () => {},
    comparisonSpecs$: computed(() => symbols$().slice(1)),
    comparisonColors$: createSignal(new Map() as ReadonlyMap<string, string>),
    comparisonLoading$: createSignal(false),
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
})
