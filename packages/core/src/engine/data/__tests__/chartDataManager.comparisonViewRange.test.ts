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
  { timestamp: 1743318000000, date: '2026-01-01', open: 50, high: 50, low: 50, close: 50 },
  { timestamp: 1743404400000, date: '2026-01-02', open: 51, high: 51, low: 51, close: 51 },
  { timestamp: 1743490800000, date: '2026-01-03', open: 52, high: 52, low: 52, close: 52 },
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
): DataDependencies {
  return {
    getOption: () => ({ kWidth: 8, kGap: 2 }),
    getZoomLevel: () => 1,
    setZoomLevel: () => {},
    getDom: () => dom,
    viewport: createMockViewport(),
    comparison: createComparisonState(),
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
    const dataManagerState = createDataManagerState()
    const container = document.querySelector<HTMLDivElement>('#container')!
    const scrollContent = document.querySelector<HTMLDivElement>('#scroll-content')!
    const canvasLayer = document.createElement('div')
    const rightAxisLayer = document.createElement('div')
    const xAxisCanvas = document.createElement('canvas')
    const m = new ChartDataManager(
      createDependencies(
        { container, scrollContent, canvasLayer, rightAxisLayer, xAxisCanvas },
        (symbols) => {
          dataState.actions.setSymbols(symbols)
        },
      ),
      dataState,
      dataManagerState,
    )
    manager = m
    return m
  }

  /** 仅加载 kline 主品种；对比集合为空。 */
  function loadKlineOnly(): ChartDataManager {
    const m = makeManager()
    m.setSymbols([{ symbol: 'MAIN', market: 'CN', period: 'daily', source: 'mock' }])
    m.setData(mainData)
    return m
  }

  /** 对比集合 = [MAIN, CMP]，首序列 MAIN 充当参考序列，主品种需由调用方显式加入集合。 */
  function loadWithReference(): ChartDataManager {
    const m = loadKlineOnly()
    m.setComparisonData('MAIN', mainData)
    m.setComparisonData('CMP', cmpData)
    return m
  }

  it('returns null when no comparison symbols exist', () => {
    const m = loadKlineOnly()
    expect(m.getComparisonViewLineRange({ start: 0, end: 3 })).toBeNull()
  })

  it('returns null when the reference series has no loaded data', () => {
    const m = makeManager()
    m.setComparisonData('CMP', [])
    expect(m.getComparisonViewLineRange({ start: 0, end: 3 })).toBeNull()
  })

  it('includes comparison equivalent prices and ignores raw high/low', () => {
    const m = loadWithReference()
    // 参考 MAIN 基准 100 → cmp 基准 50，等价价 100/102/104；MAIN 自身 100/102/101
    expect(m.getComparisonViewLineRange({ start: 0, end: 3 })).toEqual({ min: 100, max: 104 })
  })

  it('respects the visible range window', () => {
    const m = loadWithReference()
    // 只看前两根：MAIN 100/102，cmp 等价 100/102
    expect(m.getComparisonViewLineRange({ start: 0, end: 2 })).toEqual({ min: 100, max: 102 })
  })

  it('uses the first comparison bar at or after the visible base date', () => {
    const m = loadWithReference()
    m.setComparisonData('CMP', [cmpData[0]!, cmpData[2]!])

    expect(m.getComparisonViewLineRange({ start: 1, end: 3 })).toEqual({ min: 101, max: 102 })
  })

  it('uses binary timestamp lookup when neither series provides dates', () => {
    const m = makeManager()
    m.setSymbols([{ symbol: 'MAIN', market: 'CN', period: 'daily', source: 'mock' }])
    const noDateMain = mainData.map(({ date: _date, ...item }) => item)
    m.setData(noDateMain)
    m.setComparisonData('MAIN', noDateMain)
    m.setComparisonData(
      'CMP',
      [cmpData[0]!, cmpData[2]!].map(({ date: _date, ...item }) => item),
    )

    expect(m.getComparisonViewLineRange({ start: 1, end: 3 })).toEqual({ min: 101, max: 102 })
  })

  it('checks comparison coverage when the reference series already covers the visible range', () => {
    const m = loadKlineOnly()
    m.setComparisonData('CMP', [cmpData[1]!, cmpData[2]!])
    const comparisonManager = (m as unknown as {
      _comparisonManager: { ensureRange: (firstVisibleTs: number) => void }
    })._comparisonManager
    const ensureRange = vi.spyOn(comparisonManager, 'ensureRange')

    m.checkVisibleRangeGap()

    expect(ensureRange).toHaveBeenCalledWith(mainData[0]!.timestamp)
  })

  it('returns null when the visible window is outside the data', () => {
    const m = loadKlineOnly()
    m.setComparisonData('CMP', cmpData)
    expect(m.getComparisonViewLineRange({ start: 10, end: 20 })).toBeNull()
  })

  it('uses the first comparison series as the axis reference without a kline primary', () => {
    const m = makeManager()
    m.setComparisonData('CMP', cmpData)

    expect(m.getRenderData()).toEqual(cmpData)
  })
})
