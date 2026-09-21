/**
 * ChartDataManager / ScrollCompensator 测试共享夹具：ViewportStateModule 替身、
 * DataDependencies 工厂与 JSDOM 容器。
 * 仅供 __tests__ 消费；vitest 只收集 *.test.ts，本文件不会被当作测试。
 *
 * 约束：ViewportStateModule 成员众多且与本组用例无关，替身只实现被消费的 readonly/actions，
 * 唯一一处集中强转在本文件内；JSDOM 与 ChartDom 用真实 DOM API 构造。
 */
import { JSDOM } from 'jsdom'
import { vi } from 'vitest'

import type { KLineData, SymbolSpec } from '@/controllers/types'
import { marketDataProviderRegistry } from '@/data/provider/registry'
import type {
  BarAggregation,
  BarSeries,
  MarketDataProvider,
  OlderDataStatus,
  TimeShareRange,
} from '@/data/provider/types'
import type { ChartDom } from '@/engine/chartTypes'
import { ChartDataManager, type DataDependencies } from '@/engine/data/chartDataManager'
import { createComparisonState } from '@/engine/state/comparisonState'
import {
  createDataManagerState,
  type DataManagerStateModule,
} from '@/engine/state/dataManagerState'
import { createDataState, type DataStateModule } from '@/engine/state/dataState'
import type { ViewportStateModule } from '@/engine/state/viewportState'
import type { TimeShareData } from '@/foundation/types/price'

/** ViewportStateModule 替身入参。 */
export interface MockViewportOptions {
  scrollLeft?: number
  leftLoadBufferWidth?: number
  contentWidth?: number
  viewWidth?: number
  viewHeight?: number
  dpr?: number
  visibleRange?: { start: number; end: number }
}

/** ViewportStateModule 替身与其滚动量读取器。 */
export interface MockViewport {
  viewport: ViewportStateModule
  getScrollLeft: () => number
}

/** 构造只实现被消费字段的 ViewportStateModule 替身；actions.scrollTo 会更新内部滚动量。 */
export function createMockViewport(options: MockViewportOptions = {}): MockViewport {
  const {
    scrollLeft: initialScrollLeft = 0,
    leftLoadBufferWidth = 800,
    contentWidth = 1600,
    viewWidth = 800,
    viewHeight = 600,
    dpr = 1,
    visibleRange = { start: 0, end: 0 },
  } = options
  let scrollLeft = initialScrollLeft

  const viewport = {
    readonly: {
      dpr: { peek: () => dpr },
      scrollLeft: { peek: () => scrollLeft },
      scrollLeftLogical: { peek: () => scrollLeft },
      leftLoadBufferWidth: { peek: () => leftLoadBufferWidth },
      contentWidth: { peek: () => contentWidth },
      viewWidth: { peek: () => viewWidth },
      viewHeight: { peek: () => viewHeight },
      visibleRange: { peek: () => visibleRange },
      rawVisibleRange: { peek: () => visibleRange },
      viewport: {
        peek: () => ({
          viewWidth,
          viewHeight,
          plotWidth: viewWidth,
          plotHeight: viewHeight,
          scrollLeft,
          dpr,
        }),
      },
    },
    actions: {
      scrollTo: (value: number) => {
        scrollLeft = value
      },
    },
  } as unknown as ViewportStateModule

  return { viewport, getScrollLeft: () => scrollLeft }
}

/** DataDependencies 工厂入参。 */
export interface MockDataDependenciesOptions {
  /** 透传给 createMockViewport 的差异项。 */
  viewport?: MockViewportOptions
  /** 加载完成后的重绘回调。 */
  scheduleDraw?: () => void
  /** 数据变更后的交互重置回调；用例用它断言重置时机。 */
  resetInteraction?: () => void
}

/** 构造最小可用的 DataDependencies，只声明用例关心的差异。 */
export function createMockDataDependencies(
  dom: ChartDom,
  setSymbols: (symbols: ReadonlyArray<SymbolSpec>) => void,
  options: MockDataDependenciesOptions = {},
): DataDependencies {
  const { viewport, scheduleDraw = () => {}, resetInteraction = () => {} } = options
  return {
    getOption: () => ({ kWidth: 8, kGap: 2 }),
    getZoomLevel: () => 1,
    setZoomLevel: () => {},
    getDom: () => dom,
    viewport: createMockViewport(viewport).viewport,
    comparison: createComparisonState(),
    scheduleDraw,
    resetInteraction,
    updateIndicatorData: () => {},
    isPointerDown: () => false,
    onTimeShareDataReady: () => {},
    setSymbols,
  }
}

/** ChartDataManager 分时读取替身入参。 */
export interface MockChartDataManagerOptions {
  currentPeriod?: string
  timeShareData?: TimeShareData[]
  preClose?: number | null
  timeShareRange?: TimeShareRange
}

/**
 * 构造只实现分时读取的 ChartDataManager 替身。
 * ChartDataManager 是含私有字段的 class，结构化对象无法满足，强转集中在本文件内。
 */
export function createMockChartDataManager(
  options: MockChartDataManagerOptions = {},
): ChartDataManager {
  const {
    currentPeriod = 'timeshare',
    timeShareData = [],
    preClose = null,
    timeShareRange,
  } = options
  return {
    currentPeriod,
    getTimeShareData: () => timeShareData,
    getTimeSharePreClose: () => preClose,
    getTimeShareRange: () => timeShareRange,
  } as unknown as ChartDataManager
}

/** 创建测试用 JSDOM Document，并把其 window 注入全局。 */
export function createTestDocument(): Document {
  const dom = new JSDOM('<div id="container"><div id="scroll-content"></div></div>')
  vi.stubGlobal('window', dom.window)
  return dom.window.document
}

/** 从测试 Document 构造 ChartDom。 */
export function createChartDom(document: Document): ChartDom {
  return {
    container: document.querySelector<HTMLDivElement>('#container')!,
    scrollContent: document.querySelector<HTMLDivElement>('#scroll-content')!,
    canvasLayer: document.createElement('div'),
    rightAxisLayer: document.createElement('div'),
    xAxisCanvas: document.createElement('canvas'),
  }
}

/** ChartDataManager 测试装置：被销毁的实例与用例要断言的 Kernel 状态。 */
export interface TestChartDataManagerHarness {
  manager: ChartDataManager
  dataState: DataStateModule
  dataManagerState: DataManagerStateModule
}

/**
 * 构造接入 Mock 依赖的 ChartDataManager 及其 Kernel 状态。
 * 用例只声明差异：viewport 选项、scheduleDraw、resetInteraction。
 */
export function createTestChartDataManager(
  document: Document,
  options: MockDataDependenciesOptions = {},
): TestChartDataManagerHarness {
  const dataState = createDataState()
  const dataManagerState = createDataManagerState()
  const manager = new ChartDataManager(
    createMockDataDependencies(
      createChartDom(document),
      (symbols) => {
        dataState.actions.setSymbols(symbols)
      },
      options,
    ),
    dataState,
    dataManagerState,
  )
  return { manager, dataState, dataManagerState }
}

/** 构造接入测试 Provider 的日线品种描述；用例只声明差异。 */
export function makeTestSymbolSpec(
  symbol: string,
  overrides: Partial<SymbolSpec> = {},
): SymbolSpec {
  return {
    symbol,
    market: 'CN',
    period: 'daily',
    adjust: 'none',
    source: 'test',
    instrument: instrumentFor(symbol),
    ...overrides,
  }
}

/** 构造 Provider 日线响应；用例只声明数据与增量状态差异。 */
export function makeBarsPage(
  data: ReadonlyArray<KLineData>,
  options: { instrumentId?: string; olderData?: OlderDataStatus } = {},
): TestBarSeries {
  return {
    instrumentId: options.instrumentId ?? 'test:sh.600000',
    period: 'daily',
    adjustment: 'none',
    timezone: 'Asia/Shanghai',
    olderData: options.olderData ?? 'exhausted',
    data,
  }
}

/** 一天毫秒数；行情夹具按日线构造时间戳。 */
export const MS_PER_DAY = 86_400_000

/** 构造一根固定 OHLC 的日线，用例只声明时间戳差异。 */
export function makeKLine(timestamp: number): KLineData {
  return {
    timestamp,
    open: 100,
    high: 110,
    low: 90,
    close: 105,
    volume: 1_000,
  }
}

/** 构造测试 Provider 的品种描述。 */
export function instrumentFor(symbol: string) {
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

/** 注销测试 Provider；用例收尾统一调用。 */
export function unregisterTestProvider(): void {
  if (marketDataProviderRegistry.get('test')) marketDataProviderRegistry.unregister('test')
}

/** 注册（或替换）测试 Provider。 */
export function registerTestProvider(provider: MarketDataProvider): void {
  unregisterTestProvider()
  marketDataProviderRegistry.register(provider)
}

export type TestBarSeries = Omit<BarSeries, 'barAggregation'> & { barAggregation?: BarAggregation }

export type TestBarsSource = {
  fetch: (
    query: Parameters<NonNullable<MarketDataProvider['bars']>['fetch']>[0],
  ) => Promise<TestBarSeries>
}

/** 构造只声明用例关心能力的测试 Provider。 */
export function createTestProvider(options: {
  fetchBars?: TestBarsSource
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
    bars: options.fetchBars
      ? {
          fetch: async (query) => ({
            ...(await options.fetchBars!.fetch(query)),
            barAggregation: 'original',
          }),
        }
      : undefined,
    timeShare: options.fetchTimeShare ? { fetch: options.fetchTimeShare } : undefined,
    timeShareRange: options.fetchTimeShareRange
      ? { fetch: options.fetchTimeShareRange }
      : undefined,
  }
}
