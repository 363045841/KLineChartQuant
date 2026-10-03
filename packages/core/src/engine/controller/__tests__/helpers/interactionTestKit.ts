// InteractionController 测试设施：图表替身与交互内核替身的单一事实来源。
// 由 interaction.dpr.test.ts / interaction.future.test.ts 共享，替身结构变更只需改这里。

import { createInteractionState } from '@/engine/state/interactionState'
import type { SlotGrid } from '@/engine/viewport/slotGrid'
import { writableRef } from '@/foundation/reactivity/signal'
import { type ChartDataView, ChartDataViewId } from '@/foundation/types/chartView'
import type { KLineData } from '@/types/price'

/** 交互内核替身：直接复用生产实现，测试不再手抄 snapshot 字段。 */
export function createMockInteractionState() {
  return createInteractionState({
    visibleRange$: writableRef({ start: 0, end: 0 }),
    scrollLeftLogical$: writableRef(0),
    dpr$: writableRef(1),
    scheduleDraw: () => {},
  })
}

/** 交互测试用恒价 K 线 OHLC：kit 的 yAxis 替身为恒等映射，价格须落在窄区间才能命中 candle。 */
const INTERACTION_BAR = { open: 10, high: 12, low: 8, close: 11 } as const

/**
 * 构造交互测试用的恒价 K 线序列。
 * @param length K 线根数。
 * @param volumeStep 成交量步长（0 表示全部 1000）。
 * @returns 仅时间戳与成交量随索引变化的 K 线数组。
 */
export function createInteractionBars(length: number, volumeStep = 0): KLineData[] {
  return Array.from({ length }, (_, i) => ({
    timestamp: 20260101 + i,
    ...INTERACTION_BAR,
    volume: 1000 + i * volumeStep,
  }))
}

/** InteractionController 依赖的 Chart 表面替身；测试只声明与默认值不同的差异项。 */
export function createChartStub(args: {
  dpr: number
  plotWidth: number
  plotHeight: number
  /** 逻辑滚动偏移：getViewport().scrollLeft 与 kernel.viewport.readonly.scrollLeft/scrollLeftLogical.peek() 同源。 */
  scrollLeft?: number
  slotGrid?: SlotGrid
  /** 内部 K 线数据；省略时使用 2 根默认数据。 */
  data?: KLineData[]
  paneByY?: Array<{
    id: string
    top: number
    height: number
    candleHitTest: boolean
  }>
  markerManager?: {
    hitTest: (worldX: number, y: number, radius: number) => any
    setHover: (id: string | null) => void
    hitTestCustomMarker: (x: number, y: number) => any
  }
  dataView?: ChartDataView
  scrollTo?: (value: number) => boolean
  scheduleDraw?: () => void
}) {
  const container = document.createElement('div') as HTMLDivElement
  Object.defineProperty(container, 'scrollLeft', { configurable: true, writable: true, value: 0 })
  Object.defineProperty(container, 'clientWidth', { configurable: true, value: 320 })
  Object.defineProperty(container, 'clientHeight', { configurable: true, value: 200 })
  Object.defineProperty(container, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ left: 0, top: 0, width: 320, height: 200 }),
  })
  container.setPointerCapture = () => undefined
  container.hasPointerCapture = () => false
  container.releasePointerCapture = () => undefined

  const data: KLineData[] = args.data ?? createInteractionBars(2, 200)

  const paneDefs = args.paneByY ?? [{ id: 'main', top: 0, height: 160, candleHitTest: true }]
  const paneRenderers = paneDefs.map((paneDef) => ({
    getPane: () => ({
      id: paneDef.id,
      top: paneDef.top,
      height: paneDef.height,
      capabilities: {
        showPriceAxisTicks: true,
        showCrosshairPriceLabel: true,
        candleHitTest: paneDef.candleHitTest,
        supportsPriceTranslate: true,
      },
      yAxis: {
        yToPrice: (y: number) => y,
        priceToY: (p: number) => p,
        getPaddingTop: () => 0,
        getPaddingBottom: () => 0,
        getPriceOffset: () => 0,
      },
    }),
  }))

  const markerManager =
    args.markerManager ??
    ({
      hitTest: () => null,
      setHover: () => undefined,
      hitTestCustomMarker: () => null,
    } as const)

  const rightAxisLayer = document.createElement('div') as HTMLDivElement
  const scrollLeft = args.scrollLeft ?? 0

  const chart = {
    getDom: () => ({ container, rightAxisLayer }),
    viewport: {
      peek: () => ({
        zoomLevel: 1,
        plotWidth: args.plotWidth,
        plotHeight: args.plotHeight,
        dpr: args.dpr,
        visibleFrom: 0,
        visibleTo: 2,
        kWidth: 6,
        kGap: 2,
      }),
    },
    getViewport: () => ({
      viewWidth: 320,
      viewHeight: 200,
      plotWidth: args.plotWidth,
      plotHeight: args.plotHeight,
      scrollLeft,
      dpr: args.dpr,
    }),
    getCurrentDpr: () => args.dpr,
    kernel: {
      viewport: {
        readonly: {
          scrollLeft: { peek: () => scrollLeft },
          scrollLeftLogical: { peek: () => scrollLeft },
          slotGrid: { peek: () => args.slotGrid ?? { origin: 5 / args.dpr, step: 10 / args.dpr } },
          maxScrollLeft: { peek: () => 1_000 },
        },
        actions: {
          scrollTo: args.scrollTo ?? (() => false),
        },
      },
      settings: {
        readonly: {
          settings: { peek: () => ({}) },
        },
      },
      mode: {
        readonly: {
          dataView: { peek: () => args.dataView ?? ChartDataViewId.KLine },
          interactionCapabilities: { peek: () => ({ allowPan: true }) },
        },
      },
    },
    markers: { getManager: () => markerManager },
    getPaneRenderers: () => paneRenderers,
    getData: () => data,
    getRenderData: () => data,
    getInternalData: () => data,
    currentPeriod: 'daily',
    handlePinchZoom: () => undefined,
    translatePrice: () => undefined,
    updateDrawingHover: () => undefined,
    clearDrawingHover: () => undefined,
    scheduleDraw: args.scheduleDraw ?? (() => undefined),
    zoomAt: () => undefined,
    resetPriceOffset: () => undefined,
    resetPriceTransform: () => undefined,
    panes: { resizeBoundary: () => false },
    scalePrice: () => undefined,
  }

  return chart
}
