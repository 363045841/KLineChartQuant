/**
 * Minimal in-memory ChartController for adapter contract tests.
 *
 * Honours the public `ChartController` shape from @363045841yyt/klinechart-core but
 * skips the rendering pipeline —signals are real (so subscribe/notify works
 * end-to-end through coreSignalToAngular / toSignal) but mutation methods only
 * update those signals; no canvas, no DOM.
 *
 * Mirrors the React adapter's _mockController.ts so contract tests stay
 * symmetric across adapters.
 */

import { createSignal } from '@363045841yyt/klinechart-core/reactivity'
import type {
  ChartController,
  ChartViewport,
  DrawingObject,
  DrawingToolType,
  IndicatorInstance,
  InteractionSnapshot,
  KLineData,
  PaneSpec,
  SubPaneInfo,
  SymbolSpec,
  SymbolInfo,
} from '@363045841yyt/klinechart-core'

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
    kGap: 1,
    plotWidth: 800,
    plotHeight: 600,
    dpr: 1,
    visibleFrom: 0,
    visibleTo: 0,
  })
  const data = createSignal<ReadonlyArray<KLineData>>(initialData)
  const theme = createSignal<'light' | 'dark'>('light')
  const interactionState = createSignal<InteractionSnapshot>({
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
  })

  const drawingTool = createSignal<DrawingToolType | null>(null)
  const drawings = createSignal<ReadonlyArray<DrawingObject>>([])
  const paneRatios = createSignal<Readonly<Record<string, number>>>({})
  const paneLayout = createSignal<ReadonlyArray<PaneSpec>>([])

  let disposeCount = 0

  const controller: ChartController = {
    viewport,
    data,
    theme,
    interactionState,
    indicators: createSignal<ReadonlyArray<IndicatorInstance>>([]),
    subPanes: createSignal<ReadonlyArray<SubPaneInfo>>([]),
    drawingTool,
    drawings,
    paneRatios,
    paneLayout,
    dataLoading: createSignal(false),
    symbols: createSignal([] as ReadonlyArray<SymbolSpec>),
    comparisonColors: createSignal<ReadonlyMap<string, string>>(new Map()),
    comparisonLoading: createSignal(false),
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
    setTheme(next: 'light' | 'dark') {
      theme.set(next)
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
    setDrawingTool(tool: DrawingToolType | null) {
      drawingTool.set(tool)
    },
    clearDrawings() {
      drawings.set([])
    },
    removeDrawing() {
      /* no-op */
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
    symbolCatalog: createSignal([] as ReadonlyArray<SymbolInfo>),
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
    setDrawings() {
      /* no-op */
    },
    getFullDrawings() {
      return []
    },
    setSelectedDrawingId() {
      /* no-op */
    },
    getViewport() {
      return null
    },
    getKWidthKGap() {
      return { kWidth: 2, kGap: 1 }
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
    setViewport: (next: ChartViewport) => viewport.set(next),
    getDisposeCount: () => disposeCount,
  }
}
