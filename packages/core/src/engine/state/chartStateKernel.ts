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
  computed,
  type ReadonlySignal,
} from '../../foundation/reactivity/signal'
import type { DrawingObject } from '../../foundation/plugin/index'
import type { PaneSpec, DrawingToolType } from '../chartTypes'
import type { SymbolSpec, SymbolInfo } from '../../controllers/types'
import type { MarkerEntity, CustomMarkerEntity } from '../marker/registry'
import type { DragMode } from './interactionState'

export interface ChartStateKernelDeps {
  options$: ReadonlySignal<{
    minKWidth: number
    maxKWidth: number
    zoomLevelCount: number
    bottomAxisHeight: number
  }>
  initialZoomLevel: number
  dpr$: ReadonlySignal<number>
  visibleRange$: ReadonlySignal<{ start: number; end: number } | null>
  scrollLeftLogical$: ReadonlySignal<number>
  scheduleDraw: (level?: unknown) => void
}

export class ChartStateKernel extends StateKernel {
  /** 子状态模块 — 供 Chart 内部遗留管理器直接访问 */
  readonly zoom: ZoomStateModule
  readonly data: DataStateModule
  readonly pane: PaneStateModule
  readonly theme: ThemeStateModule
  readonly drawing: DrawingStateModule
  readonly interaction: InteractionStateModule

  /** Bridge computed signals for ChartViewportManager */
  readonly zoomLevel$: ReadonlySignal<number>
  readonly dataLength$: ReadonlySignal<number>

  /**
   * Options view for viewport: combines optionsSignal's bottomAxisHeight
   * with zoomState's kWidth/kGap computed signals.
   */
  readonly optionsForViewport$: ReadonlySignal<{
    bottomAxisHeight: number
    kWidth: number
    kGap: number
  }>

  /** Flat signals bag — consumed by createChartController facade */
  readonly signals: Record<string, ReadonlySignal<unknown>>
  /** Flat actions bag — consumed by createChartController facade */
  readonly actions: Record<string, (...args: any[]) => void>

  constructor(deps: ChartStateKernelDeps) {
    super()

    // ── Zoom state ──────────────────────────────────────────
    this.zoom = createZoomState({
      dpr$: deps.dpr$,
      minKWidth$: computed(() => deps.options$().minKWidth),
      maxKWidth$: computed(() => deps.options$().maxKWidth),
      zoomLevelCount: Math.max(2, Math.round(deps.options$().zoomLevelCount)),
    })
    this.zoom.actions.setZoomLevel(deps.initialZoomLevel)

    this.zoomLevel$ = computed(() => this.zoom.readonly.zoomLevel())
    this.optionsForViewport$ = computed(() => {
      const o = deps.options$()
      return {
        bottomAxisHeight: o.bottomAxisHeight,
        kWidth: this.zoom.readonly.kWidth(),
        kGap: this.zoom.readonly.kGap(),
      }
    })

    // ── Data state ──────────────────────────────────────────
    this.data = createDataState()

    this.dataLength$ = computed(() => this.data.readonly.dataLength())

    // ── Pane state ──────────────────────────────────────────
    this.pane = createPaneState()

    // ── Theme state ─────────────────────────────────────────
    this.theme = createThemeState()

    // ── Drawing state ───────────────────────────────────────
    this.drawing = createDrawingState()

    // ── Interaction state ───────────────────────────────────
    this.interaction = createInteractionState({
      visibleRange$: deps.visibleRange$,
      scrollLeftLogical$: deps.scrollLeftLogical$,
      dpr$: deps.dpr$,
      scheduleDraw: deps.scheduleDraw,
    })

    // ── Flat signals bag for framework adapters ─────────────
    this.signals = {
      // Zoom
      zoomLevel: this.zoom.readonly.zoomLevel,
      kWidth: this.zoom.readonly.kWidth,
      kGap: this.zoom.readonly.kGap,
      // Data
      data: this.data.readonly.data,
      dataLength: this.data.readonly.dataLength,
      loading: this.data.readonly.loading,
      symbols: this.data.readonly.symbols,
      symbolCatalog: this.data.readonly.symbolCatalog,
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
    }

    // ── Flat actions bag for framework adapters ─────────────
    this.actions = {
      // Zoom
      setZoomLevel: (level: number) => this.zoom.actions.setZoomLevel(level),
      // Data
      setData: (data: ReadonlyArray<unknown>) => this.data.actions.setData(data),
      setLoading: (loading: boolean) => this.data.actions.setLoading(loading),
      setSymbols: (symbols: ReadonlyArray<SymbolSpec>) =>
        this.data.actions.setSymbols(symbols),
      setSymbolCatalog: (catalog: ReadonlyArray<SymbolInfo>) =>
        this.data.actions.setSymbolCatalog(catalog),
      setActiveBufferKey: (key: string | null) =>
        this.data.actions.setActiveBufferKey(key),
      resetData: () => this.data.actions.reset(),
      // Pane
      setPaneRatios: (ratios: Record<string, number>) =>
        this.pane.actions.setPaneRatios(ratios),
      setPaneSpecs: (specs: PaneSpec[]) => this.pane.actions.setPaneSpecs(specs),
      // Theme
      setTheme: (theme: 'light' | 'dark') => this.theme.actions.setTheme(theme),
      // Drawing
      setDrawingTool: (tool: DrawingToolType | null) =>
        this.drawing.actions.setDrawingTool(tool),
      setDrawings: (drawings: ReadonlyArray<DrawingObject>) =>
        this.drawing.actions.setDrawings(drawings),
      clearDrawings: () => this.drawing.actions.clearDrawings(),
      // Interaction
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
    }
  }

  dispose(): void {
    this.zoom.dispose()
    this.data.dispose()
    this.pane.dispose()
    this.theme.dispose()
    this.drawing.dispose()
    this.interaction.dispose()
  }
}

export type ChartStateKernelModule = ChartStateKernel
