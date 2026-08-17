import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JSDOM } from 'jsdom'

import type { KLineData, SymbolSpec } from '../../../controllers/types'
import { createSignal } from '../../../foundation/reactivity/signal'
import type { ChartDom } from '../../chartTypes'
import { createComparisonState } from '../../state/comparisonState'
import { createDataManagerState } from '../../state/dataManagerState'
import { createDataState } from '../../state/dataState'
import type { ViewportStateModule } from '../../state/viewportState'
import { ChartDataManager, type DataDependencies } from '../chartDataManager'

const mainData: KLineData[] = [
  { timestamp: 1743318000000, date: '2026-01-01', open: 100, high: 110, low: 90, close: 100 },
  { timestamp: 1743404400000, date: '2026-01-02', open: 100, high: 112, low: 88, close: 102 },
  { timestamp: 1743490800000, date: '2026-01-03', open: 102, high: 113, low: 89, close: 101 },
]

const cmpData: KLineData[] = [
  { timestamp: 1743318000000, date: '2026-01-01', close: 50 },
  { timestamp: 1743404400000, date: '2026-01-02', close: 51 },
  { timestamp: 1743490800000, date: '2026-01-03', close: 52 },
]

function createMockViewport(): ViewportStateModule {
  return {
    readonly: {
      dpr: { peek: () => 1 },
      scrollLeft: { peek: () => 0 },
      scrollLeftLogical: { peek: () => 0 },
      leftLoadBufferWidth: { peek: () => 0 },
      contentWidth: { peek: () => 1600 },
      viewWidth: { peek: () => 800 },
      viewHeight: { peek: () => 600 },
      visibleRange: { peek: () => ({ start: 0, end: 3 }) },
      rawVisibleRange: { peek: () => ({ start: 0, end: 3 }) },
      viewport: {
        peek: () => ({
          viewWidth: 800,
          viewHeight: 600,
          plotWidth: 800,
          plotHeight: 600,
          scrollLeft: 0,
          dpr: 1,
        }),
      },
    },
    actions: {
      scrollTo: () => {},
    },
  } as unknown as ViewportStateModule
}

function createDependencies(
  dom: ChartDom,
  setSymbols: (symbols: ReadonlyArray<SymbolSpec>) => void,
  symbols$: ReturnType<typeof createSignal<ReadonlyArray<SymbolSpec>>>,
): DataDependencies {
  return {
    getOption: () => ({ kWidth: 8, kGap: 2 }),
    getZoomLevel: () => 1,
    setZoomLevel: () => {},
    getDom: () => dom,
    viewport: createMockViewport(),
    comparison: createComparisonState({ symbols$ }),
    scheduleDraw: () => {},
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

describe('ChartDataManager.getComparisonViewLineRange', () => {
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

  function makeManager(): ChartDataManager {
    const dataState = createDataState()
    const symbols$ = createSignal<ReadonlyArray<SymbolSpec>>([])
    const dataManagerState = createDataManagerState()
    const container = document.querySelector<HTMLDivElement>('#container')!
    const scrollContent = document.querySelector<HTMLDivElement>('#scroll-content')!
    const m = new ChartDataManager(
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
    manager = m
    return m
  }

  function loadMain(primary: SymbolSpec): ChartDataManager {
    const m = makeManager()
    m.setSymbols([primary])
    m.setData(mainData)
    return m
  }

  it('returns null when no comparison symbols exist', () => {
    const m = loadMain({ symbol: 'MAIN', market: 'CN', period: 'daily', source: 'mock' })
    expect(m.getComparisonViewLineRange({ start: 0, end: 3 })).toBeNull()
  })

  it('falls back to main close extremes when comparison data is not loaded yet', () => {
    const m = loadMain({ symbol: 'MAIN', market: 'CN', period: 'daily', source: 'mock' })
    m.addComparisonSymbol({ symbol: 'CMP', market: 'CN', period: 'daily', source: 'mock' })
    // 仅主商品 close（100/102/101），不含 high(113)/low(88)
    expect(m.getComparisonViewLineRange({ start: 0, end: 3 })).toEqual({ min: 100, max: 102 })
  })

  it('includes comparison equivalent prices and ignores main high/low', () => {
    const m = loadMain({ symbol: 'MAIN', market: 'CN', period: 'daily', source: 'mock' })
    m.setComparisonData('CMP', cmpData)
    // cmp 基准 50 → 等价价 100/102/104；主商品 close 100/102/101
    expect(m.getComparisonViewLineRange({ start: 0, end: 3 })).toEqual({ min: 100, max: 104 })
  })

  it('respects the visible range window', () => {
    const m = loadMain({ symbol: 'MAIN', market: 'CN', period: 'daily', source: 'mock' })
    m.setComparisonData('CMP', cmpData)
    // 只看前两根：主 100/102，cmp 等价 100/102
    expect(m.getComparisonViewLineRange({ start: 0, end: 2 })).toEqual({ min: 100, max: 102 })
  })

  it('returns null when the visible window is outside the data', () => {
    const m = loadMain({ symbol: 'MAIN', market: 'CN', period: 'daily', source: 'mock' })
    m.setComparisonData('CMP', cmpData)
    expect(m.getComparisonViewLineRange({ start: 10, end: 20 })).toBeNull()
  })
})
