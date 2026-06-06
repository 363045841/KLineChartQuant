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
    ToolId,
} from '@363045841yyt/klinechart-core'

function createMockToolbar() {
    const tools = createSignal<ReadonlyArray<{ id: ToolId; label: string; icon?: string; group?: string }>>([])
    const activeTool = createSignal<ToolId | null>(null)
    const disabledTools = createSignal<ReadonlySet<ToolId>>(new Set())
    return {
        tools,
        activeTool,
        disabledTools,
        selectTool(id: ToolId) {
            activeTool.set(id)
        },
        clearSelection() {
            activeTool.set(null)
        },
        setDisabled(id: ToolId, disabled: boolean) {
            const next = new Set(disabledTools())
            if (disabled) next.add(id)
            else next.delete(id)
            disabledTools.set(next)
        },
        dispose() {
            /* no-op */
        },
    }
}

function createMockDrawing() {
    const state = createSignal<{ activeTool: DrawingToolType | null; drawingCount: number }>({ activeTool: null, drawingCount: 0 })
    return {
        state,
        setActiveTool(tool: DrawingToolType | null) {
            state.set({ ...state(), activeTool: tool })
        },
        clearAll() {
            state.set({ ...state(), drawingCount: 0 })
        },
        deleteLast() {
            const cur = state()
            state.set({ ...cur, drawingCount: Math.max(0, cur.drawingCount - 1) })
        },
        dispose() {
            /* no-op */
        },
    }
}

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
        desiredScrollLeft: undefined,
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

    const toolbar = createMockToolbar()
    const drawing = createMockDrawing()

    let disposeCount = 0

    const controller: ChartController = {
        viewport,
        data,
        theme,
        interactionState,
        indicators: createSignal<ReadonlyArray<IndicatorInstance>>([]),
        subPanes: createSignal<ReadonlyArray<SubPaneInfo>>([]),
        drawingTool: createSignal<DrawingToolType | null>(null),
        drawings: createSignal<ReadonlyArray<DrawingObject>>([]),
        paneRatios: createSignal<Readonly<Record<string, number>>>({}),
        paneLayout: createSignal<ReadonlyArray<PaneSpec>>([]),
        catalog: [],

        toolbar,
        drawing,

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
            drawing.setActiveTool(tool)
        },
        clearDrawings() {
            drawing.clearAll()
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
        updateSettingsFacade() {
            /* no-op */
        },
        updateOptionsFacade() {
            /* no-op */
        },
        dispose() {
            disposeCount += 1
            toolbar.dispose()
            drawing.dispose()
        },
    }

    return {
        controller,
        setViewport: (next: ChartViewport) => viewport.set(next),
        getDisposeCount: () => disposeCount,
    }
}
