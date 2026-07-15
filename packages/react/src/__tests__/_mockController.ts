/**
 * Minimal in-memory ChartController for adapter contract tests.
 *
 * Honours the public `ChartController` shape from @363045841yyt/klinechart-core but
 * skips the rendering pipeline —signals are real (so subscribe/notify works
 * end-to-end through useSyncExternalStore) but mutation methods only update
 * those signals; no canvas, no DOM.
 */

import type {
  ChartController,
  ChartViewport,
  DrawingObject,
  DrawingToolType,
  IndicatorDefinition,
  IndicatorInstance,
  InteractionSnapshot,
  KLineData,
  PaneSpec,
  SubPaneInfo,
  SymbolSpec,
  SymbolInfo,
} from '@363045841yyt/klinechart-core'
import { createSignal } from '@363045841yyt/klinechart-core/reactivity'

export interface MockControllerHandle {
  controller: ChartController
  /** test helper: directly mutate the viewport signal */
  setViewport: (next: ChartViewport) => void
  /** test helper: count of dispose() invocations */
  getDisposeCount: () => number
}

export function createMockChartController(
  initialData: ReadonlyArray<KLineData> = [],
): MockControllerHandle {
  const viewport = createSignal<ChartViewport>({
    zoomLevel: 1,
    kWidth: 2,
    kGap: 2,
    plotWidth: 800,
    plotHeight: 600,
    dpr: 1,
    visibleFrom: 0,
    visibleTo: 0,
  })
  const data = createSignal<ReadonlyArray<KLineData>>(initialData)
  const theme = createSignal<'light' | 'dark'>('light')
  const settings = createSignal({ theme: 'light' as 'light' | 'dark' | 'auto' } as any)

  let disposeCount = 0

  const controller: ChartController = {
    viewport,
    data,
    dataLoading: createSignal(false),
    symbols: createSignal([] as ReadonlyArray<SymbolSpec>),
    theme,
    settings,
    chartMode: createSignal('kline' as const),
    indicators: createSignal<ReadonlyArray<IndicatorInstance>>([]),
    subPanes: createSignal<ReadonlyArray<SubPaneInfo>>([]),
    drawingTool: createSignal('cursor' as const),
    drawings: createSignal<ReadonlyArray<DrawingObject>>([]),
    paneRatios: createSignal<Readonly<Record<string, number>>>({}),
    paneLayout: createSignal<ReadonlyArray<PaneSpec>>([]),
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
    comparisonColors: createSignal<ReadonlyMap<string, string>>(new Map()),
    comparisonLoading: createSignal(false),
    symbolCatalog: createSignal([] as ReadonlyArray<SymbolInfo>),
    catalog: [],

    setData(next: ReadonlyArray<KLineData>) {
      data.set(next)
    },
    appendData(next: ReadonlyArray<KLineData>) {
      data.set([...data(), ...next])
    },
    updateData(next: ReadonlyArray<KLineData>) {
      data.set(next)
    },
    getData() {
      return data()
    },
    getZoomLevelCount() {
      return 10
    },
    setSymbols() {
      /* no-op */
    },
    registerSymbols() {
      /* no-op */
    },
    addComparisonSymbol() {
      /* no-op */
    },
    removeComparisonSymbol() {
      /* no-op */
    },
    setComparisonData() {
      /* no-op */
    },
    setCurrentSymbol() {
      /* no-op */
    },
    setCurrentPeriod() {
      /* no-op */
    },
    switchToTimeShareForDate() {
      /* no-op */
    },
    applyCustomData() {
      /* no-op */
    },
    setDataFetcher() {
      /* no-op */
    },
    ensureDataRange() {
      /* no-op */
    },
    setTheme(next: 'light' | 'dark') {
      settings.set({ ...settings(), theme: next })
      theme.set(next)
    },
    setSystemTheme(next: 'light' | 'dark') {
      // 仅 settings.theme === auto 时影响生效主题（对齐 Chart.setSystemTheme）
      if ((settings() as { theme?: string }).theme === 'auto') {
        theme.set(next)
      }
    },
    zoomToLevel(level: number) {
      viewport.set({ ...viewport(), zoomLevel: level })
    },
    zoomIn() {
      viewport.set({ ...viewport(), zoomLevel: viewport().zoomLevel + 1 })
    },
    zoomOut() {
      viewport.set({ ...viewport(), zoomLevel: Math.max(1, viewport().zoomLevel - 1) })
    },
    handlePointerEvent() {
      return false
    },
    handleWheelEvent() {
      /* no-op */
    },
    handleScrollEvent() {
      /* no-op */
    },
    handlePinchZoom() {
      /* no-op */
    },
    addIndicator() {
      return null
    },
    removeIndicator() {
      return false
    },
    updateIndicatorParams() {
      return false
    },
    updateRendererConfig() {
      /* no-op */
    },
    setDrawingTool() {
      /* no-op */
    },
    setDrawingToolId() {
      /* no-op */
    },
    getDrawingToolId() {
      return 'cursor' as const
    },
    registerDrawingSession() {
      /* no-op */
    },
    clearDrawings() {
      /* no-op */
    },
    removeDrawing() {
      /* no-op */
    },
    setDrawings() {
      /* no-op */
    },
    getFullDrawings() {
      return []
    },
    getSelectedDrawingId() {
      return null
    },
    setSelectedDrawingId() {
      /* no-op */
    },
    getViewport() {
      return null
    },
    getKWidthKGap() {
      return { kWidth: 2, kGap: 2 }
    },
    getCurrentDpr() {
      return 1
    },
    getLogicalIndexAtX() {
      return null
    },
    getTimestampAtLogicalIndex() {
      return null
    },
    priceToY() {
      return 0
    },
    yToPrice() {
      return 0
    },
    getPaneInfo() {
      return undefined
    },
    resizeSubPane() {
      return false
    },
    createSubPane() {
      return false
    },
    clearSubPanes() {
      /* no-op */
    },
    replaceSubPaneIndicator() {
      return false
    },
    updatePaneLayout() {
      /* no-op */
    },
    updateCustomMarkers() {
      /* no-op */
    },
    clearCustomMarkers() {
      /* no-op */
    },
    setTooltipSize() {
      /* no-op */
    },
    setTooltipAnchorPositioning() {
      /* no-op */
    },
    getIndicatorTitle() {
      return undefined
    },
    getContentWidth() {
      return 0
    },
    getLeftLoadBufferWidth() {
      return 0
    },
    scrollToRight() {
      /* no-op */
    },
    updateSettingsFacade() {
      /* no-op */
    },
    updateOptionsFacade() {
      /* no-op */
    },
    dispose() {
      disposeCount += 1
    },
  }

  return {
    controller,
    setViewport: (next) => viewport.set(next),
    getDisposeCount: () => disposeCount,
  }
}
