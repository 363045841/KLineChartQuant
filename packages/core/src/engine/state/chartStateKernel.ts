import { StateKernel, type SubStateModule } from './stateKernel'
import {
  createZoomState,
  type ZoomStateModule,
  type ZoomDeps,
} from './zoomState'
import {
  createDataState,
  type DataStateModule,
} from './dataState'
import {
  createViewportState,
  type ViewportStateModule,
  type ViewportDomDeps,
} from './viewportState'
import {
  createPaneState,
  type PaneStateModule,
} from './paneState'
import {
  createThemeState,
  type ThemeStateModule,
} from './themeState'
import {
  createDrawingState,
  type DrawingStateModule,
} from './drawingState'
import {
  createInteractionState,
  type InteractionStateModule,
  type InteractionDeps,
} from './interactionState'
import {
  createDataManagerState,
  type DataManagerStateModule,
} from './dataManagerState'
import {
  createOptionsState,
  type OptionsStateModule,
} from './optionsState'
import {
  createComparisonState,
  type ComparisonStateModule,
} from './comparisonState'
import {
  createIndicatorState,
  type IndicatorStateModule,
} from './indicatorState'
import {
  computed,
  type ReadonlySignal,
} from '../../foundation/reactivity/signal'
import type { DrawingObject } from '../../foundation/plugin/index'
import type { PaneSpec, DrawingToolType } from '../chartTypes'
import type { SymbolSpec, SymbolInfo } from '../../controllers/types'
import type { MarkerEntity, CustomMarkerEntity } from '../marker/registry'
import type { DragMode } from './interactionState'

export interface ChartStateKernelDeps {
  initialOptions: {
    minKWidth: number
    maxKWidth: number
    zoomLevelCount: number
    bottomAxisHeight: number
    rightAxisWidth: number
    leftAxisWidth: number
    yPaddingPx: number
    priceLabelWidth?: number
    paneGap?: number
    defaultPaneMinHeightPx?: number
    panes: PaneSpec[]
    zoomLevels?: number
    initialZoomLevel?: number
    [key: string]: unknown
  }
  initialZoomLevel: number
  scheduleDraw: (level?: unknown) => void
}

export class ChartStateKernel extends StateKernel {
  readonly options: OptionsStateModule
  readonly zoom: ZoomStateModule
  readonly data: DataStateModule
  readonly viewport: ViewportStateModule
  readonly pane: PaneStateModule
  readonly theme: ThemeStateModule
  readonly drawing: DrawingStateModule
  readonly interaction: InteractionStateModule
  readonly dataManager: DataManagerStateModule
  readonly comparison: ComparisonStateModule
  readonly indicator: IndicatorStateModule

  readonly zoomLevel$: ReadonlySignal<number>
  readonly dataLength$: ReadonlySignal<number>
  readonly optionsForViewport$: ReadonlySignal<{
    bottomAxisHeight: number
    kWidth: number
  }>

  readonly signals: Record<string, ReadonlySignal<unknown>>
  readonly actions: Record<string, (...args: any[]) => void>

  constructor(deps: ChartStateKernelDeps) {
    super()

    // ── Options state (before zoom, since zoom reads from options) ──
    this.options = createOptionsState(deps.initialOptions)

    // ── Zoom state ──
    this.zoom = createZoomState({
      minKWidth$: computed(() => this.options.readonly.options().minKWidth),
      maxKWidth$: computed(() => this.options.readonly.options().maxKWidth),
      zoomLevelCount: Math.max(2, Math.round(this.options.readonly.options.peek().zoomLevelCount)),
    })
    this.zoom.actions.setZoomLevel(deps.initialZoomLevel)

    this.zoomLevel$ = computed(() => this.zoom.readonly.zoomLevel())
    this.optionsForViewport$ = computed(() => ({
      bottomAxisHeight: this.options.readonly.options().bottomAxisHeight,
      kWidth: this.zoom.readonly.kWidth(),
    }))

    // ── Data state ──
    this.data = createDataState()
    this.dataLength$ = computed(() => this.data.readonly.dataLength())

    // ── Data manager state (coordination layer) ──
    this.dataManager = createDataManagerState()

    // ── Comparison state ──
    this.comparison = createComparisonState()

    // ── Indicator state ──
    this.indicator = createIndicatorState()

    // ── Viewport state (now owned by kernel) ──
    this.viewport = createViewportState({
      options$: this.optionsForViewport$,
      dataLength$: this.dataLength$,
      period$: this.dataManager.readonly.currentPeriod,
      zoomLevel$: this.zoomLevel$,
    })

    // ── Pane state ──
    this.pane = createPaneState()

    // ── Theme state ──
    this.theme = createThemeState()

    // ── Drawing state ──
    this.drawing = createDrawingState()

    // ── Interaction state (reads viewport signals directly) ──
    this.interaction = createInteractionState({
      visibleRange$:
        this.viewport.readonly.visibleRange as unknown as ReadonlySignal<{ start: number; end: number } | null>,
      scrollLeftLogical$:
        this.viewport.readonly.scrollLeftLogical as unknown as ReadonlySignal<number>,
      dpr$: this.viewport.readonly.dpr as unknown as ReadonlySignal<number>,
      scheduleDraw: deps.scheduleDraw,
    })

    // ── Flat signals bag for framework adapters ──
    this.signals = {
      // Zoom
      zoomLevel: this.zoom.readonly.zoomLevel,
      kWidth: this.zoom.readonly.kWidth,
      kGap: this.viewport.readonly.kGap,
      // Data
      data: this.data.readonly.data,
      dataLength: this.data.readonly.dataLength,
      loading: this.data.readonly.loading,
      symbols: this.data.readonly.symbols,
      symbolCatalog: this.data.readonly.symbolCatalog,
      // Viewport
      dpr: this.viewport.readonly.dpr,
      viewport: this.viewport.readonly.viewport,
      viewportState: this.viewport.readonly.viewportState,
      visibleRange: this.viewport.readonly.visibleRange,
      scrollLeftLogical: this.viewport.readonly.scrollLeftLogical,
      // Pane
      paneRatios: this.pane.readonly.paneRatios,
      paneSpecs: this.pane.readonly.paneSpecs,
      // Theme
      theme: this.theme.readonly.theme,
      // Drawing
      drawingTool: this.drawing.readonly.drawingTool,
      drawings: this.drawing.readonly.drawings,
      // Interaction
      interactionSnapshot: this.interaction.readonly.interactionSnapshot,
      crosshairIndex: this.interaction.readonly.crosshairIndex,
      // Comparison
      comparisonColors: this.comparison.readonly.colors,
      comparisonLoading: this.comparison.readonly.loading,
      // Indicator
      mainIndicators: this.indicator.readonly.mainIndicators,
    }

    // ── Flat actions bag for framework adapters ──
    this.actions = {
      setZoomLevel: (level: number) => this.zoom.actions.setZoomLevel(level),
      setData: (data: ReadonlyArray<unknown>) => this.data.actions.setData(data),
      setLoading: (loading: boolean) => this.data.actions.setLoading(loading),
      setSymbols: (symbols: ReadonlyArray<SymbolSpec>) =>
        this.data.actions.setSymbols(symbols),
      setSymbolCatalog: (catalog: ReadonlyArray<SymbolInfo>) =>
        this.data.actions.setSymbolCatalog(catalog),
      setActiveBufferKey: (key: string | null) =>
        this.data.actions.setActiveBufferKey(key),
      resetData: () => this.data.actions.reset(),
      setPaneRatios: (ratios: Record<string, number>) =>
        this.pane.actions.setPaneRatios(ratios),
      setPaneSpecs: (specs: PaneSpec[]) => this.pane.actions.setPaneSpecs(specs),
      setTheme: (theme: 'light' | 'dark') => this.theme.actions.setTheme(theme),
      setDrawingTool: (tool: DrawingToolType | null) =>
        this.drawing.actions.setDrawingTool(tool),
      setDrawings: (drawings: ReadonlyArray<DrawingObject>) =>
        this.drawing.actions.setDrawings(drawings),
      clearDrawings: () => this.drawing.actions.clearDrawings(),
      updateCrosshair: (
        pos: { x: number; y: number } | null,
        price: number | null,
      ) => this.interaction.actions.updateCrosshair(pos, price),
      updateHover: (index: number | null, paneId: string | null) =>
        this.interaction.actions.updateHover(index, paneId),
      setHoveredIndex: (index: number | null) =>
        this.interaction.actions.setHoveredIndex(index),
      setActivePaneId: (paneId: string | null) =>
        this.interaction.actions.setActivePaneId(paneId),
      updateFramePositions: (
        positions: number[] | null,
        centers: number[] | null,
        kWidthPx: number | null,
      ) => this.interaction.actions.updateFramePositions(positions, centers, kWidthPx),
      startDrag: (mode: DragMode) => this.interaction.actions.startDrag(mode),
      endDrag: () => this.interaction.actions.endDrag(),
      setDragMode: (mode: DragMode) => this.interaction.actions.setDragMode(mode),
      setSeparatorHover: (paneId: string | null) =>
        this.interaction.actions.setSeparatorHover(paneId),
      setRightAxisHover: (paneId: string | null) =>
        this.interaction.actions.setRightAxisHover(paneId),
      updateTooltip: (
        pos: { x: number; y: number },
        placement: 'right-bottom' | 'left-bottom',
      ) => this.interaction.actions.updateTooltip(pos, placement),
      updateMarkerHover: (
        markerId: string | null,
        markerData: MarkerEntity | null,
        customMarkerData: CustomMarkerEntity | null,
      ) =>
        this.interaction.actions.updateMarkerHover(
          markerId,
          markerData,
          customMarkerData,
        ),
      resetInteraction: () => this.interaction.actions.reset(),
      setComparisonColors: (colors: ReadonlyMap<string, string>) =>
        this.comparison.actions.setColors(colors),
      setComparisonLoading: (loading: boolean) =>
        this.comparison.actions.setLoading(loading),
      upsertMainIndicator: (id, params) => this.indicator.actions.upsert(id, params),
      removeMainIndicator: (id) => this.indicator.actions.remove(id),
      setMainIndicatorParams: (id, params) => this.indicator.actions.setParams(id, params),
      replaceMainIndicators: (entries) => this.indicator.actions.replaceAll(entries),
      clearMainIndicators: () => this.indicator.actions.clear(),
    }
  }

  setViewportDomDeps(deps: ViewportDomDeps): void {
    this.viewport.setDomDeps(deps)
  }

  initViewport(): void {
    this.viewport.actions.init()
  }

  dispose(): void {
    this.options.dispose()
    this.zoom.dispose()
    this.data.dispose()
    this.viewport.dispose()
    this.pane.dispose()
    this.theme.dispose()
    this.drawing.dispose()
    this.interaction.dispose()
    this.dataManager.dispose()
    this.comparison.dispose()
    this.indicator.dispose()
  }
}

export type ChartStateKernelModule = ChartStateKernel
