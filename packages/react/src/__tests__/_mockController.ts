/**
 * Minimal in-memory ChartController for adapter contract tests.
 *
 * Honours the public `ChartController` shape from @363045841yyt/klinechart-core but
 * skips the rendering pipeline —signals are real (so subscribe/notify works
 * end-to-end through useSyncExternalStore) but mutation methods only update
 * those signals; no canvas, no DOM.
 */

import { createSignal } from '@363045841yyt/klinechart-core/reactivity'
import type {
    ActiveIndicator,
    ChartController,
    ChartViewport,
    DrawingController,
    DrawingState,
    IndicatorDefinition,
    IndicatorSelectorController,
    KLineData,
    ToolbarController,
    ToolDefinition,
    ToolId,
} from '@363045841yyt/klinechart-core'

function createMockIndicatorSelector(): IndicatorSelectorController {
    const catalog = createSignal<ReadonlyArray<IndicatorDefinition>>([])
    const active = createSignal<ReadonlyArray<ActiveIndicator>>([])
    const menuOpen = createSignal<boolean>(false)
    const searchQuery = createSignal<string>('')
    const filteredMain = createSignal<ReadonlyArray<IndicatorDefinition>>([])
    const filteredSub = createSignal<ReadonlyArray<IndicatorDefinition>>([])

    let instanceCounter = 0

    return {
        catalog,
        active,
        menuOpen,
        searchQuery,
        filteredMain,
        filteredSub,
        add(definitionId: string): string | null {
            const def = catalog().find((d) => d.id === definitionId)
            if (def === undefined) return null
            const id = `mock-instance-${++instanceCounter}`
            const next: ActiveIndicator = {
                id,
                definitionId,
                label: def.label,
                name: def.name,
                role: def.role,
                params: {},
            }
            active.set([...active(), next])
            return id
        },
        remove(instanceId: string): boolean {
            const before = active()
            const next = before.filter((a) => a.id !== instanceId)
            if (next.length === before.length) return false
            active.set(next)
            return true
        },
        updateParams(): boolean {
            return false
        },
        reorder(): boolean {
            return false
        },
        openMenu(): void {
            menuOpen.set(true)
        },
        closeMenu(): void {
            menuOpen.set(false)
        },
        toggleMenu(): void {
            menuOpen.set(!menuOpen())
        },
        setSearchQuery(q: string): void {
            searchQuery.set(q)
        },
        isActive(definitionId: string): boolean {
            return active().some((a) => a.definitionId === definitionId)
        },
        dispose(): void {
            /* no-op for mock */
        },
    }
}

function createMockToolbar(): ToolbarController {
    const tools = createSignal<ReadonlyArray<ToolDefinition>>([])
    const activeTool = createSignal<ToolId | null>(null)
    const disabledTools = createSignal<ReadonlySet<ToolId>>(new Set())
    return {
        tools,
        activeTool,
        disabledTools,
        selectTool(id) {
            activeTool.set(id)
        },
        clearSelection() {
            activeTool.set(null)
        },
        setDisabled(id, disabled) {
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

function createMockDrawing(): DrawingController {
    const state = createSignal<DrawingState>({ activeTool: null, drawingCount: 0 })
    return {
        state,
        setActiveTool(tool) {
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
        visibleFrom: 0,
        visibleTo: 0,
    })
    const data = createSignal<ReadonlyArray<KLineData>>(initialData)
    const theme = createSignal<'light' | 'dark'>('light')

    const indicatorSelector = createMockIndicatorSelector()
    const toolbar = createMockToolbar()
    const drawing = createMockDrawing()

    let disposeCount = 0

    const controller: ChartController = {
        viewport,
        data,
        theme,
        indicatorSelector,
        toolbar,
        drawing,
        setData(next) {
            data.set(next)
        },
        appendData(next) {
            data.set([...data(), ...next])
        },
        updateData(next) {
            data.set(next)
        },
        setTheme(next) {
            theme.set(next)
        },
        zoomToLevel(level) {
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
        setDrawingTool(tool) {
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
        updateCustomMarkers() {
            /* no-op */
        },
        clearCustomMarkers() {
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
            indicatorSelector.dispose()
            toolbar.dispose()
            drawing.dispose()
        },
    }

    return {
        controller,
        setViewport: (next) => viewport.set(next),
        getDisposeCount: () => disposeCount,
    }
}
