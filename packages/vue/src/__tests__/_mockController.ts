/**
 * Vue 适配层测试用的 ChartController 替身。
 *
 * 只声明 KLineChart SFC 与测试实际消费的成员，并以 `Partial<ChartController>`
 * 约束各成员签名：core 接口新增成员不会再强制补桩，仅当组件真正读取某成员时才需补。
 * 内联 mini-signal 与 `packages/core/src/foundation/reactivity/signal.ts` 形状兼容，
 * 使测试可在不启动渲染引擎的前提下驱动信号变化。
 */

import type {
  AlertController,
  AlertEvent,
  AlertRule,
  ChartController,
  ChartMountOptions,
  ChartViewport,
  DrawingObject,
  IndicatorInstance,
  InteractionSnapshot,
  KLineData,
  PaneSpec,
  SubPaneInfo,
  SymbolSpec,
  SymbolInfo,
} from '@363045841yyt/klinechart-core'
import type { Signal } from '@363045841yyt/klinechart-core/reactivity'

// ---------------------------------------------------------------------------
// 内联 mini-signal：Object.is 相等性短路、同步通知，仅用于测试替身。
// ---------------------------------------------------------------------------

type TestSignal<T> = Signal<T> & { subscriberCount: () => number }

function createSignal<T>(initial: T): TestSignal<T> {
  let value = initial
  const subs = new Set<() => void>()
  const read = (): T => value
  const peek = (): T => value
  const set = (next: T): void => {
    if (Object.is(value, next)) return
    value = next
    for (const listener of [...subs]) listener()
  }
  const subscribe = (listener: () => void): (() => void) => {
    subs.add(listener)
    return () => {
      subs.delete(listener)
    }
  }
  return Object.assign(read, {
    peek,
    set,
    subscribe,
    subscriberCount: () => subs.size,
  }) as TestSignal<T>
}

export interface MockChartController extends ChartController {
  /** spy: how many times `dispose` was called */
  disposeCalls: () => number
  /** spy: themes passed to `setTheme` */
  setThemeCalls: () => ReadonlyArray<'light' | 'dark'>
  /** spy: main legend renderer configuration updates */
  rendererConfigCalls: () => ReadonlyArray<{ name: string; config: Record<string, unknown> }>
  /** 当前 legendTemplateContext Signal 的订阅数量 */
  legendSubscriberCount: () => number
  /** test-only signal mutators */
  _setViewport: (vp: ChartViewport) => void
  _setData: (data: ReadonlyArray<KLineData>) => void
  /** test-only: emit a theme change as the controller would */
  _emitTheme: (next: 'light' | 'dark') => void
}

export function createMockChartController(
  opts: Partial<ChartMountOptions> = {},
): MockChartController {
  let disposeCalls = 0
  const setThemeCalls: Array<'light' | 'dark'> = []

  const viewport = createSignal<ChartViewport>({
    zoomLevel: opts.initialZoomLevel ?? 3,
    kWidth: 6,
    kGap: 2,
    plotWidth: 0,
    plotHeight: 0,
    dpr: 1,
    visibleFrom: 0,
    visibleTo: 0,
  })
  const data = createSignal<ReadonlyArray<KLineData>>(opts.data ?? [])
  const themePreference = opts.theme ?? 'light'
  const theme = createSignal<'light' | 'dark'>(themePreference)
  const settings = createSignal({ theme: themePreference } as Record<string, unknown>)
  const paneLayout = createSignal<ReadonlyArray<PaneSpec>>([])
  const rangeSelection = createSignal({
    startTimestamp: null as number | null,
    endTimestamp: null as number | null,
    isDragging: false,
  })
  const legendTemplateContext = createSignal(null)
  const rendererConfigCalls: Array<{ name: string; config: Record<string, unknown> }> = []
  const alertController: AlertController = {
    rules: createSignal<ReadonlyArray<AlertRule>>([]),
    events: createSignal<ReadonlyArray<AlertEvent>>([]),
    addRule: () => false,
    removeRule: () => false,
    setRuleEnabled: () => false,
    updateRule: () => false,
    evaluate: () => [],
    clearEvents: () => {},
    onEvent: () => () => {},
    dispose: () => {},
  }

  const controller: Partial<ChartController> = {
    viewport,
    data,
    dataLoading: createSignal(false),
    dataError: createSignal<string | null>(null),
    symbols: createSignal([] as ReadonlyArray<SymbolSpec>),
    theme,
    settings,
    rendererRuntime: createSignal({
      effective: 'webgl' as const,
      status: 'ready' as const,
      error: null,
    }),
    chartMode: createSignal('kline' as const),
    lastBarPeriod: createSignal('daily'),
    indicators: createSignal<ReadonlyArray<IndicatorInstance>>([]),
    subPanes: createSignal<ReadonlyArray<SubPaneInfo>>([]),
    drawingTool: createSignal('cursor' as const),
    drawings: createSignal<ReadonlyArray<DrawingObject>>([]),
    selectedDrawingIds: createSignal<ReadonlyArray<string>>([]),
    paneRatios: createSignal<Readonly<Record<string, number>>>({}),
    paneLayout,
    interactionState: createSignal<InteractionSnapshot>({
      crosshairPos: null,
      crosshairIndex: null,
      crosshairPrice: null,
      hoveredIndex: null,
      activePaneId: null,
      tooltipPos: { x: 0, y: 0 },
      tooltipAnchorPlacement: 'right-bottom',
      hoveredMarkerData: null,
      hoveredCustomMarker: null,
      isDragging: false,
      isResizingPaneBoundary: false,
      isHoveringPaneBoundary: false,
      hoveredPaneBoundaryId: null,
      isHoveringRightAxis: false,
    }),
    selectedRange: createSignal<{ from: number; to: number } | null>(null),
    rangeSelection,
    legendTemplateContext,
    comparisonColors: createSignal<ReadonlyMap<string, string>>(new Map()),
    comparisonLoading: createSignal(false),
    symbolCatalog: createSignal([] as ReadonlyArray<SymbolInfo>),
    catalog: [],

    setData: (next) => data.set(next),
    appendData: (next) => data.set([...data.peek(), ...next]),
    updateData: (next) => data.set(next),
    getData: () => data.peek(),
    getZoomLevelCount: () => 10,
    setSymbols: () => {},
    registerSymbols: () => {},
    addComparisonSymbol: () => {},
    removeComparisonSymbol: () => {},
    setComparisonData: () => {},
    setCurrentSymbol: () => {},
    setCurrentPeriod: () => {},
    switchToTimeShareForDate: () => {},
    applyCustomData: () => {},
    ensureDataRange: () => {},
    setTheme: (next) => {
      setThemeCalls.push(next)
      settings.set({ ...settings.peek(), theme: next })
      theme.set(next)
    },
    setSystemTheme: (next) => {
      // 仅 settings.theme === auto 时影响生效主题（对齐 Chart.setSystemTheme）
      if ((settings.peek() as { theme?: string }).theme === 'auto') {
        theme.set(next)
      }
    },
    zoomToLevel: (level) => viewport.set({ ...viewport.peek(), zoomLevel: level }),
    zoomIn: () =>
      viewport.set({
        ...viewport.peek(),
        zoomLevel: viewport.peek().zoomLevel + 1,
      }),
    zoomOut: () =>
      viewport.set({
        ...viewport.peek(),
        zoomLevel: viewport.peek().zoomLevel - 1,
      }),
    handlePointerEvent: () => false,
    handleWheelEvent: () => {},
    handleScrollEvent: () => {},
    handlePinchZoom: () => {},
    startRangeSelection: (timestamp) =>
      rangeSelection.set({ startTimestamp: timestamp, endTimestamp: timestamp, isDragging: true }),
    updateRangeSelection: (timestamp) =>
      rangeSelection.set({ ...rangeSelection.peek(), endTimestamp: timestamp }),
    finishRangeSelection: (timestamp) =>
      rangeSelection.set({
        ...rangeSelection.peek(),
        endTimestamp: timestamp ?? rangeSelection.peek().endTimestamp,
        isDragging: false,
      }),
    setRangeSelection: (startTimestamp, endTimestamp) =>
      rangeSelection.set({ startTimestamp, endTimestamp, isDragging: false }),
    clearRangeSelection: () =>
      rangeSelection.set({ startTimestamp: null, endTimestamp: null, isDragging: false }),
    addIndicator: () => null,
    removeIndicator: () => false,
    updateIndicatorParams: () => false,
    updateRendererConfig: (name, config) => {
      rendererConfigCalls.push({ name, config })
    },
    setDrawingTool: () => {},
    setDrawingToolId: () => {},
    getDrawingToolId: () => 'cursor' as const,
    registerDrawingSession: () => {},
    clearDrawings: () => {},
    createDrawing: () => ({}) as DrawingObject,
    updateDrawing: () => null,
    commitDrawingDrag: () => null,
    updateBatch: () => [],
    getBatchStyleKeys: () => [],
    removeDrawing: () => false,
    removeBatch: () => false,
    replaceDrawings: () => {},
    getFullDrawings: () => [],
    setSelectedDrawingIds: () => {},
    getSelectedDrawingIds: () => [],
    alertController,
    resetToFetcher: () => {},
    getViewport: () => null,
    getKWidthKGap: () => ({ kWidth: 6, kGap: 2 }),
    getCurrentDpr: () => 1,
    getLogicalIndexAtX: () => null,
    getTimestampAtLogicalIndex: () => null,
    priceToY: () => 0,
    yToPrice: () => 0,
    getPaneInfo: () => undefined,
    createPane: () => false,
    updatePane: () => false,
    removePane: () => false,
    movePane: () => false,
    replacePaneContent: () => false,
    updatePaneContent: () => false,
    clearPanes: () => {},
    updateCustomMarkers: () => {},
    clearCustomMarkers: () => {},
    setTooltipSize: () => {},
    setTooltipAnchorPositioning: () => {},
    getIndicatorTitle: () => undefined,
    getContentWidth: () => 0,
    getLeftLoadBufferWidth: () => 0,
    scrollToRight: () => {},
    updateSettingsFacade: () => {},
    updateOptionsFacade: () => {},
    dispose: () => {
      disposeCalls += 1
    },
  }

  return {
    ...(controller as ChartController),
    disposeCalls: () => disposeCalls,
    setThemeCalls: () => setThemeCalls,
    rendererConfigCalls: () => rendererConfigCalls,
    legendSubscriberCount: () => legendTemplateContext.subscriberCount(),
    _setViewport: (vp) => viewport.set(vp),
    _setData: (next) => data.set(next),
    _emitTheme: (next) => theme.set(next),
  }
}

/** Signal helper used by reactivity bridge tests. */
export function createTestSignal<T>(initial: T): Signal<T> {
  return createSignal(initial)
}
