/**
 * Framework-agnostic controller interfaces.
 *
 * Every adapter (React, Vue, Angular) consumes these. Controllers expose state as
 * `Signal<T>` so adapters bridge with their own reactivity (useSyncExternalStore,
 * shallowRef, toSignal).
 *
 * Mutation methods are imperative — adapters call them in event handlers.
 */

import type { Signal } from '../reactivity'
import type { CustomMarkerEntity, MarkerEntity } from '../engine/marker/registry'
import type { PaneSpec } from '../engine/chart'

// Controller-owned public surface. Legacy engine types may mirror these
// shapes internally, but adapters depend only on core-defined contracts.
export interface ChartViewport {
    zoomLevel: number
    plotWidth: number
    plotHeight: number
    dpr: number
    visibleFrom: number
    visibleTo: number
    desiredScrollLeft: number | undefined
    kWidth: number
    kGap: number
}

export type IndicatorRole = 'main' | 'sub'

export interface IndicatorInstance {
    id: string
    definitionId: string
    label: string
    name: string
    role: IndicatorRole
    paneId?: string
    params: Record<string, unknown>
}

export interface SubPaneInfo {
    paneId: string
    indicatorId: string
    params: Record<string, unknown>
    ratio: number
}

export type DrawingToolType = 'trendline' | 'horizontal' | 'fib' | 'rectangle' | 'arrow'

export interface DrawingObject {
    id: string
    type: DrawingToolType
}

export type IndicatorPaneRole = IndicatorRole

// ---------------------------------------------------------------------------
// Data shapes (mirror src/types/price.ts — single source of truth lives here
// long-term; the legacy types re-export from here once migration completes)
// ---------------------------------------------------------------------------

export interface KLineData {
    timestamp: number
    open: number
    high: number
    low: number
    close: number
    volume?: number
    turnover?: number
    stockCode?: string
    amplitude?: number
    changePercent?: number
    changeAmount?: number
    turnoverRate?: number
}

export type { PaneSpec }

// ---------------------------------------------------------------------------
// Symbol specification & DataFetcher adapter
// ---------------------------------------------------------------------------

export interface SymbolSpec {
    symbol: string
    exchange?: string
    period?: string
    adjust?: string
    source?: string
    startDate?: string
    endDate?: string
}

export type DataFetcher = (
    source: string,
    config: {
        symbol: string
        startDate: string
        endDate: string
        period: string
        adjust: string
    },
) => Promise<ReadonlyArray<KLineData>>

// ---------------------------------------------------------------------------
// Indicator metadata
// ---------------------------------------------------------------------------

export interface IndicatorParamDef {
    key: string
    label: string
    type: 'number' | 'string' | 'boolean' | 'color' | 'select'
    default: number | string | boolean
    min?: number
    max?: number
    step?: number
    options?: ReadonlyArray<{ value: string; label: string }>
}

export interface IndicatorDefinition {
    id: string
    label: string
    name?: string
    description?: string
    role: IndicatorPaneRole
    params: ReadonlyArray<IndicatorParamDef>
}

// ---------------------------------------------------------------------------
// Interaction state
// ---------------------------------------------------------------------------

export interface InteractionSnapshot {
    crosshairPos: { x: number; y: number } | null
    crosshairIndex: number | null
    crosshairPrice: number | null
    hoveredIndex: number | null
    activePaneId: string | null
    tooltipPos: { x: number; y: number }
    tooltipAnchorPlacement: 'right-bottom' | 'left-bottom'
    hoveredMarkerData: MarkerEntity | null
    hoveredCustomMarker: CustomMarkerEntity | null
    isDragging: boolean
    isResizingPaneBoundary: boolean
    isHoveringPaneBoundary: boolean
    hoveredPaneBoundaryId: string | null
    isHoveringRightAxis: boolean
}

// ---------------------------------------------------------------------------
// Pane info (read-only pane metadata for DrawingChartAdapter)
// ---------------------------------------------------------------------------

export interface PaneInfo {
    paneId: string
    top: number
    height: number
}

// ---------------------------------------------------------------------------
// Drawing adapter — narrow interface for DrawingInteractionController
// ---------------------------------------------------------------------------

export interface DrawingChartViewport {
    scrollLeft: number
    plotWidth: number
    plotHeight: number
}

export interface DrawingChartAdapter {
    /** persist full drawing list to the chart engine */
    setDrawings(drawings: any[]): void
    /** highlight a drawing by ID */
    setSelectedDrawingId(id: string | null): void
    /** current viewport (nullable if chart not ready) */
    getViewport(): DrawingChartViewport | null
    /** resolved chart options (kWidth, kGap) */
    getKWidthKGap(): { kWidth: number; kGap: number }
    /** device pixel ratio */
    getCurrentDpr(): number
    /** raw K-line data */
    getData(): ReadonlyArray<KLineData>
    /** screen-x → logical bar index */
    getLogicalIndexAtX(mouseX: number): number | null
    /** logical index → unix timestamp (ms) */
    getTimestampAtLogicalIndex(index: number): number | null
    /** price → Y within the given pane */
    priceToY(paneId: string, price: number): number
    /** Y within the given pane → price */
    yToPrice(paneId: string, y: number): number
    /** read-only pane metadata by pane ID */
    getPaneInfo(paneId: string): PaneInfo | undefined
}

// ---------------------------------------------------------------------------
// Drawing controller callback type (passed to handlePointerEvent)
// ---------------------------------------------------------------------------

export interface DrawingControllerCallbacks {
    onPointerDown?: (e: PointerEvent, container: HTMLElement) => boolean
    onPointerMove?: (e: PointerEvent, container: HTMLElement) => boolean
    onPointerUp?: (e: PointerEvent, container: HTMLElement) => boolean
}

// ---------------------------------------------------------------------------
// ChartController — top-level facade; what `useChart` / `<KLineChart>` expose
// ---------------------------------------------------------------------------

export interface ChartMountOptions {
    container: HTMLElement
    data: ReadonlyArray<KLineData>
    symbols?: ReadonlyArray<SymbolSpec>
    dataFetcher?: DataFetcher
    initialZoomLevel?: number
    zoomLevels?: number
    theme?: 'light' | 'dark'

    // Pre-existing DOM elements (skip buildDom when provided)
    canvasLayer?: HTMLElement
    rightAxisLayer?: HTMLElement
    xAxisCanvas?: HTMLCanvasElement

    // Chart options overrides
    yPaddingPx?: number
    rightAxisWidth?: number
    bottomAxisHeight?: number
    priceLabelWidth?: number
    minKWidth?: number
    maxKWidth?: number
}

export interface ChartController extends DrawingChartAdapter {
    // ---- Signals ----
    readonly viewport: Signal<ChartViewport>
    readonly data: Signal<ReadonlyArray<KLineData>>
    readonly symbols: Signal<ReadonlyArray<SymbolSpec>>
    readonly theme: Signal<'light' | 'dark'>
    readonly indicators: Signal<ReadonlyArray<IndicatorInstance>>
    readonly subPanes: Signal<ReadonlyArray<SubPaneInfo>>
    readonly drawingTool: Signal<DrawingToolType | null>
    readonly drawings: Signal<ReadonlyArray<DrawingObject>>
    readonly paneRatios: Signal<Readonly<Record<string, number>>>
    readonly paneLayout: Signal<ReadonlyArray<PaneSpec>>
    readonly interactionState: Signal<InteractionSnapshot>

    // indicator catalog (static — adapters use for picker UI)
    readonly catalog: ReadonlyArray<IndicatorDefinition>

    // ---- Data ----
    setSymbols(next: ReadonlyArray<SymbolSpec>): void
    setDataFetcher(fetcher: DataFetcher | null): void
    setData(next: ReadonlyArray<KLineData>): void
    appendData(next: ReadonlyArray<KLineData>): void
    updateData(next: ReadonlyArray<KLineData>): void
    getData(): ReadonlyArray<KLineData>
    getZoomLevelCount(): number

    // ---- Theme ----
    setTheme(theme: 'light' | 'dark'): void

    // ---- Zoom ----
    zoomToLevel(level: number, anchorX?: number): void
    zoomIn(anchorX?: number): void
    zoomOut(anchorX?: number): void

    // ---- Interaction ----
    handlePointerEvent(e: PointerEvent, drawingController?: DrawingControllerCallbacks): boolean
    handleWheelEvent(e: WheelEvent): void
    handleScrollEvent(): void
    handlePinchZoom(delta: number, centerClientX: number): void

    // ---- Indicators ----
    addIndicator(
        definitionId: string,
        role: 'main' | 'sub',
        params?: Record<string, unknown>,
    ): string | null
    removeIndicator(instanceId: string): boolean
    updateIndicatorParams(instanceId: string, params: Record<string, unknown>): boolean
    updateRendererConfig(name: string, config: Record<string, unknown>): void

    // ---- Drawing ----
    setDrawingTool(tool: DrawingToolType | null): void
    clearDrawings(): void
    removeDrawing(drawingId: string): void

    // ---- Layout ----
    resizeSubPane(paneId: string, deltaY: number): boolean
    createSubPane(paneId: string, indicatorId: string, params?: Record<string, unknown>): boolean
    clearSubPanes(): void
    replaceSubPaneIndicator(paneId: string, indicatorId: string, params?: Record<string, unknown>): boolean
    updatePaneLayout(panes: PaneSpec[]): void

    // ---- Drawing / Markers ----
    updateCustomMarkers(markers: ReadonlyArray<CustomMarkerEntity>): void
    clearCustomMarkers(): void

    // ---- Interaction sub-methods ----
    setTooltipSize(size: { width: number; height: number }): void
    setTooltipAnchorPositioning(enabled: boolean): void

    // ---- Narrow queries ----
    getIndicatorTitle(instanceId: string): string | undefined
    /** total scrollable content width (replaces direct computeContentWidth imports) */
    getContentWidth(): number

    // ---- Settings ----
    updateSettingsFacade(settings: Record<string, unknown>): void
    updateOptionsFacade(options: Record<string, unknown>): void

    /** tear down DOM + listeners; idempotent */
    dispose(): void
}

/**
 * Factory contract — adapters call this on mount.
 *
 * Implementation lives in packages/core/src/controllers/createChartController.ts
 * (Phase 1 deliverable). It wires the existing Chart engine in src/core/chart.ts.
 */
export type ChartControllerFactory = (opts: ChartMountOptions) => ChartController

// ---------------------------------------------------------------------------
// Legacy type aliases (deprecated — kept for internal sub-controller tests)
// ---------------------------------------------------------------------------

export interface ActiveIndicator {
    id: string
    definitionId: string
    label: string
    name: string
    role: IndicatorPaneRole
    params: Readonly<Record<string, number | string | boolean>>
}

export interface IndicatorSelectorController {
    readonly catalog: Signal<ReadonlyArray<IndicatorDefinition>>
    readonly active: Signal<ReadonlyArray<ActiveIndicator>>
    readonly menuOpen: Signal<boolean>
    readonly searchQuery: Signal<string>
    readonly filteredMain: Signal<ReadonlyArray<IndicatorDefinition>>
    readonly filteredSub: Signal<ReadonlyArray<IndicatorDefinition>>
    add(definitionId: string): string | null
    remove(instanceId: string): boolean
    updateParams(instanceId: string, params: Record<string, number | string | boolean>): boolean
    reorder(fromInstanceId: string, toInstanceId: string): boolean
    openMenu(): void
    closeMenu(): void
    toggleMenu(): void
    setSearchQuery(q: string): void
    isActive(definitionId: string): boolean
    dispose(): void
}

export type ToolId = string

export interface ToolDefinition {
    id: ToolId
    label: string
    icon?: string
    group?: string
    disabled?: boolean
}

export interface ToolbarController {
    readonly tools: Signal<ReadonlyArray<ToolDefinition>>
    readonly activeTool: Signal<ToolId | null>
    readonly disabledTools: Signal<ReadonlySet<ToolId>>
    selectTool(id: ToolId): void
    clearSelection(): void
    setDisabled(id: ToolId, disabled: boolean): void
    dispose(): void
}

export interface DrawingState {
    readonly activeTool: DrawingToolType | null
    readonly drawingCount: number
}

export interface DrawingController {
    readonly state: Signal<DrawingState>
    setActiveTool(tool: DrawingToolType | null): void
    clearAll(): void
    deleteLast(): void
    dispose(): void
}
