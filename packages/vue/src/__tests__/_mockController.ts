/**
 * Mock ChartController for Vue adapter tests.
 *
 * Mirrors the framework-agnostic signal-bearing shape from
 * @363045841yyt/klinechart-core without spinning up the real Chart engine.
 *
 * To keep this test file runnable from the repo root vitest (which does not
 * alias @363045841yyt/klinechart-core), we inline a tiny `Signal` implementation
 * that is shape-compatible with `packages/core/src/reactivity/signal.ts`.
 */

import type { Signal } from '@363045841yyt/klinechart-core/reactivity'
import type {
    ActiveIndicator,
    ChartController,
    ChartMountOptions,
    ChartViewport,
    DrawingController,
    DrawingState,
    IndicatorDefinition,
    IndicatorSelectorController,
    KLineData,
    PaneSpec,
    ToolbarController,
    ToolDefinition,
    ToolId,
} from '@363045841yyt/klinechart-core'

// ---------------------------------------------------------------------------
// Inline mini-signal �?Object.is-equality, sync notify. Drop-in compatible
// with `@363045841yyt/klinechart-core/reactivity` for shape-only test purposes.
// ---------------------------------------------------------------------------

function createSignal<T>(initial: T): Signal<T> {
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
    return Object.assign(read, { peek, set, subscribe }) as Signal<T>
}

export interface MockChartController extends ChartController {
    /** spy: how many times `dispose` was called */
    disposeCalls: () => number
    /** test-only signal mutators */
    _setViewport: (vp: ChartViewport) => void
    _setData: (data: ReadonlyArray<KLineData>) => void
}

function createMockIndicatorSelector(): IndicatorSelectorController {
    const catalog = createSignal<ReadonlyArray<IndicatorDefinition>>([])
    const active = createSignal<ReadonlyArray<ActiveIndicator>>([])
    const menuOpen = createSignal<boolean>(false)
    const searchQuery = createSignal<string>('')
    const filteredMain = createSignal<ReadonlyArray<IndicatorDefinition>>([])
    const filteredSub = createSignal<ReadonlyArray<IndicatorDefinition>>([])

    return {
        catalog,
        active,
        menuOpen,
        searchQuery,
        filteredMain,
        filteredSub,
        add: () => null,
        remove: () => false,
        updateParams: () => false,
        reorder: () => false,
        openMenu: () => menuOpen.set(true),
        closeMenu: () => menuOpen.set(false),
        toggleMenu: () => menuOpen.set(!menuOpen.peek()),
        setSearchQuery: (q: string) => searchQuery.set(q),
        isActive: () => false,
        dispose: () => {},
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
        selectTool: (id) => activeTool.set(id),
        clearSelection: () => activeTool.set(null),
        setDisabled: () => {},
        dispose: () => {},
    }
}

function createMockDrawing(): DrawingController {
    const state = createSignal<DrawingState>({
        activeTool: null,
        drawingCount: 0,
    })
    return {
        state,
        setActiveTool: (tool) =>
            state.set({ ...state.peek(), activeTool: tool }),
        clearAll: () => state.set({ ...state.peek(), drawingCount: 0 }),
        deleteLast: () =>
            state.set({
                ...state.peek(),
                drawingCount: Math.max(0, state.peek().drawingCount - 1),
            }),
        dispose: () => {},
    }
}

export function createMockChartController(
    opts: Partial<ChartMountOptions> = {},
): MockChartController {
    let disposeCalls = 0

    const viewport = createSignal<ChartViewport>({
        zoomLevel: opts.initialZoomLevel ?? 3,
        kWidth: 6,
        visibleFrom: 0,
        visibleTo: 0,
    })
    const data = createSignal<ReadonlyArray<KLineData>>(opts.data ?? [])
    const theme = createSignal<'light' | 'dark'>(opts.theme ?? 'light')
    const paneLayout = createSignal<ReadonlyArray<PaneSpec>>([])
    const indicatorSelector = createMockIndicatorSelector()
    const toolbar = createMockToolbar()
    const drawing = createMockDrawing()

    return {
        viewport,
        data,
        theme,
        paneLayout,
        indicatorSelector,
        toolbar,
        drawing,
        setData: (next) => data.set(next),
        appendData: (next) => data.set([...data.peek(), ...next]),
        updateData: (next) => data.set(next),
        getData: () => data.peek(),
        getZoomLevelCount: () => 10,
        setTheme: (next) => theme.set(next),
        zoomToLevel: (level) =>
            viewport.set({ ...viewport.peek(), zoomLevel: level }),
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
        addIndicator: () => null,
        removeIndicator: () => false,
        updateIndicatorParams: () => false,
        updateRendererConfig: () => {},
        setTooltipSize: () => {},
        setTooltipAnchorPositioning: () => {},
        getIndicatorTitle: () => undefined,
        setDrawingTool: (tool) => drawing.setActiveTool(tool),
        clearDrawings: () => drawing.clearAll(),
        removeDrawing: () => {},
        resizeSubPane: () => false,
        createSubPane: () => false,
        clearSubPanes: () => {},
        replaceSubPaneIndicator: () => false,
        updatePaneLayout: (_panes: PaneSpec[]) => {},
        updateCustomMarkers: () => {},
        clearCustomMarkers: () => {},
        updateSettingsFacade: () => {},
        updateOptionsFacade: () => {},
        dispose: () => {
            disposeCalls += 1
        },
        disposeCalls: () => disposeCalls,
        _setViewport: (vp) => viewport.set(vp),
        _setData: (next) => data.set(next),
    }
}

/** Signal helper used by reactivity bridge tests. */
export function createTestSignal<T>(initial: T): Signal<T> {
    return createSignal(initial)
}
