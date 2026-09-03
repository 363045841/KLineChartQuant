/** Chart 业务状态的 composition root：组合全部子状态并暴露派生信号。 */
import { StateKernel, type SubStateModule } from './stateKernel'
import { createZoomState, type ZoomStateModule, type ZoomDeps } from './zoomState'
import { createDataState, type DataStateModule } from './dataState'
import {
  createViewportState,
  type ViewportStateModule,
  type ViewportDomDeps,
} from './viewportState'
import { createPaneState, type PaneStateModule } from './paneState'
import { PaneManager } from '../paneManager'
import { createSystemThemeState, type SystemThemeStateModule } from './themeState'
import { createSettingsState, type SettingsStateModule } from './settingsState'
import {
  ChartDataViewId,
  createModeState,
  isTimeShareDataView,
  type ChartDataView,
  type ModeStateModule,
} from './modeState'
import { createDrawingState, type DrawingStateModule } from './drawingState'
import {
  createInteractionState,
  type InteractionStateModule,
  type InteractionDeps,
} from './interactionState'
import { createDataManagerState, type DataManagerStateModule } from './dataManagerState'
import { createOptionsState, type OptionsStateModule } from './optionsState'
import { createComparisonState, type ComparisonStateModule } from './comparisonState'
import {
  createIndicatorState,
  resolveModeIndicatorInstances,
  type IndicatorInstanceSpec,
  type IndicatorStateModule,
} from './indicatorState'
import { createMarkerState, type MarkerStateModule } from './markerState'
import { createRendererState, type RendererStateModule } from './rendererState'
import {
  createIndicatorResultState,
  resolveIndicatorResultAvailability,
  type IndicatorResultAvailability,
  type IndicatorResultStateModule,
} from './indicatorResultState'
import { batch, computed, type ReadonlySignal } from '../../foundation/reactivity/signal'
import { makePluginLayerId } from '../../foundation/plugin/rendererLayerId'
import type { DrawingObject } from '../../foundation/plugin/index'
import type { PaneSpec } from '../chartTypes'
import type { DrawingToolId } from '../drawing/toolConfig'
import type { SymbolSpec, SymbolInfo } from '../../controllers/types'
import type { MarkerEntity, CustomMarkerEntity } from '../marker/registry'
import type { DragMode } from './interactionState'
import type { ChartSettings } from '../../foundation/config/chartSettings'
import type { RendererBackendRuntime } from '../../rendering/render/rendererHost'
import { getRegisteredIndicatorDefinition } from '../indicators/indicatorDefinitionRegistry'
import type { IndicatorMetadata } from '../indicators/indicatorMetadata'
import type { MarketSessionRegistry } from '../market/marketSessionRegistry'
import { resolveSymbolMarketSession } from '../market/resolveSymbolMarketSession'
import { resolveMarketSessionSlots } from '../../foundation/utils/sessionTimeLabels'
import '../renderers/extremaMarkers'
import '../renderers/lastPrice'

/** Chart 投影到 Scene 的受管 renderer layer 描述。 */
export interface ActiveRendererDescriptor {
  readonly name: string
  readonly layerId: string
}

/** 判断指标是否可在当前数据视图参与渲染；旧指标默认仅支持 K 线。 */
function supportsIndicatorDataView(
  definition: IndicatorMetadata,
  dataView: ChartDataView,
): boolean {
  if (!definition.dataViews) return dataView === ChartDataViewId.KLine
  return (
    definition.dataViews.includes(dataView) ||
    (isTimeShareDataView(dataView) && definition.dataViews.includes(ChartDataViewId.TimeShare))
  )
}

/** 在支持当前数据视图时解析指标的 renderer plugin 名称。 */
function tryResolveIndicatorMetadata(
  definition: IndicatorMetadata | undefined,
  dataView: ChartDataView,
  paneId: string,
  indicatorId: string,
): IndicatorMetadata | null {
  if (!definition || !supportsIndicatorDataView(definition, dataView)) return null
  return definition
}

/** 从已启用指标状态解析当前数据视图实际需要的 renderer layer。 */
function resolveIndicatorRenderers(
  dataView: ChartDataView,
  instances: ReadonlyArray<IndicatorInstanceSpec>,
): ReadonlyArray<ActiveRendererDescriptor> {
  const mainRenderers: ActiveRendererDescriptor[] = []
  const subRenderers: ActiveRendererDescriptor[] = []
  const seen = new Set<string>()
  let hasMainIndicatorRenderer = false
  const add = (target: ActiveRendererDescriptor[], name: string | null): void => {
    if (!name || seen.has(name)) return
    seen.add(name)
    target.push({ name, layerId: makePluginLayerId(name) })
  }

  // 主图和副图指标均从统一实例集合读取；主图数据 Layer 共用一个 legend Layer。
  for (const instance of instances) {
    const definition = getRegisteredIndicatorDefinition(instance.indicatorId)
    // mode 实例的业务 renderer 由 @Indicator.dataViews 声明可见性，且不参与用户指标图例。
    if (instance.source === 'mode' && instance.role === 'main' && definition) {
      const modeDefinition = tryResolveIndicatorMetadata(
        definition,
        dataView,
        instance.paneId,
        instance.indicatorId,
      )
      if (modeDefinition) {
        add(
          mainRenderers,
          modeDefinition.getRendererName({
            paneId: instance.paneId,
            indicatorId: instance.indicatorId,
          }),
        )
        continue
      }
    }
    if (
      instance.source === 'mode' &&
      (instance.indicatorId === 'candle' ||
        instance.indicatorId === 'timeShare' ||
        instance.indicatorId === ChartDataViewId.FiveDayTimeShare ||
        instance.indicatorId === 'comparisonLine')
    ) {
      add(mainRenderers, instance.indicatorId)
      continue
    }
    const resolvedDefinition = tryResolveIndicatorMetadata(
      definition,
      dataView,
      instance.paneId,
      instance.indicatorId,
    )
    if (!resolvedDefinition) continue

    const options = { paneId: instance.paneId, indicatorId: instance.indicatorId }
    if (instance.role === 'main') {
      const rendererName = resolvedDefinition.getRendererName(options)
      add(mainRenderers, rendererName)
      hasMainIndicatorRenderer ||= Boolean(rendererName)
    } else {
      // 副图由数据、坐标轴和标题三个独立 Layer 组成。
      add(subRenderers, resolvedDefinition.getRendererName(options))
      add(subRenderers, resolvedDefinition.getScaleRendererName(options))
      add(subRenderers, resolvedDefinition.getPaneTitleRendererName(options))
    }
  }
  if (hasMainIndicatorRenderer) add(mainRenderers, 'mainIndicatorLegend')
  return [...mainRenderers, ...subRenderers]
}
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
  initialSettings?: Partial<ChartSettings>
  initialRendererRuntime?: RendererBackendRuntime
  /** 各市场分时交易时段注册表（分时几何 / 槽位共用）；未注入时分时槽位退化为 0 */
  marketSessions?: MarketSessionRegistry
  scheduleDraw: (level?: unknown) => void
}

export class ChartStateKernel extends StateKernel {
  readonly options: OptionsStateModule
  readonly zoom: ZoomStateModule
  readonly data: DataStateModule
  readonly viewport: ViewportStateModule
  readonly pane: PaneStateModule
  /** Pane 领域唯一写入口；布局和副图内容在此原子同步。 */
  readonly paneManager: PaneManager
  /** 系统主题注入（非用户偏好）；用户偏好在 settings.theme */
  readonly systemTheme: SystemThemeStateModule
  readonly settings: SettingsStateModule
  readonly mode: ModeStateModule
  readonly drawing: DrawingStateModule
  readonly interaction: InteractionStateModule
  readonly dataManager: DataManagerStateModule
  readonly comparison: ComparisonStateModule
  readonly indicator: IndicatorStateModule
  readonly indicatorResult: IndicatorResultStateModule
  readonly marker: MarkerStateModule
  readonly renderer: RendererStateModule

  readonly zoomLevel$: ReadonlySignal<number>
  readonly dataLength$: ReadonlySignal<number>
  /** 生效主题 light|dark（settings.theme + systemTheme 推导） */
  readonly effectiveTheme$: ReadonlySignal<'light' | 'dark'>
  /** 当前图表状态要求启用的受管 renderer layer。 */
  readonly activeRenderers$: ReadonlySignal<ReadonlyArray<ActiveRendererDescriptor>>
  readonly optionsForViewport$: ReadonlySignal<{
    bottomAxisHeight: number
    kWidth: number
  }>
  /** 分时交易时段槽位数（由当前品种 market 派生，供可见区间与布局共用） */
  readonly sessionSlots$: ReadonlySignal<number>
  /** 指标结果相对于当前数据和配置快照的可用性。 */
  readonly indicatorResultAvailability$: ReadonlySignal<IndicatorResultAvailability>

  readonly signals: Record<string, ReadonlySignal<unknown>>
  readonly actions: Record<string, (...args: any[]) => void>

  constructor(deps: ChartStateKernelDeps) {
    super()

    // ── Options state (before zoom, since zoom reads from options) ──
    this.options = createOptionsState(deps.initialOptions)

    // ── Data view state（缩放宽度需按视图派生）──
    this.mode = createModeState()

    // ── Zoom state ──
    this.zoom = createZoomState({
      minKWidth$: computed(() => this.options.readonly.options().minKWidth),
      maxKWidth$: computed(() => this.options.readonly.options().maxKWidth),
      dataView$: this.mode.readonly.dataView,
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
    const timeShareDayCount$ = computed(() => this.data.readonly.timeShareRange()?.days.length ?? 0)

    // ── Data manager state (coordination layer) ──
    this.dataManager = createDataManagerState()
    // computed() 立即求值一次，故须在 dataManager 创建之后定义
    this.sessionSlots$ = computed(() => {
      const spec = this.dataManager.readonly.currentSpec()
      if (!deps.marketSessions || !spec?.market) return 0
      try {
        return resolveMarketSessionSlots(resolveSymbolMarketSession(spec, deps.marketSessions))
      } catch {
        return 0
      }
    })

    // ── Comparison state ──
    this.comparison = createComparisonState({ symbols$: this.data.readonly.symbols })

    // ── Indicator state ──
    this.indicator = createIndicatorState()
    this.indicatorResult = createIndicatorResultState()
    this.indicatorResultAvailability$ = computed(() =>
      resolveIndicatorResultAvailability(
        this.indicatorResult.readonly.snapshot(),
        this.data.readonly.dataRevision(),
        this.indicator.readonly.configRevision(),
      ),
    )

    // ── Marker business state ──
    this.marker = createMarkerState()

    // ── Viewport state (now owned by kernel) ──
    this.viewport = createViewportState({
      options$: this.optionsForViewport$,
      dataLength$: this.dataLength$,
      period$: this.dataManager.readonly.currentPeriod,
      zoomLevel$: this.zoomLevel$,
      sessionSlots$: this.sessionSlots$,
      timeShareDayCount$,
      timeShareSlotWidth$: this.zoom.readonly.timeShareSlotWidth,
    })

    // ── Pane state（从 initialOptions.panes 初始化，避免 layout 与 kernel 初始不一致）──
    this.pane = createPaneState()
    {
      const initialPanes = (deps.initialOptions.panes ?? []).map((spec) => ({ ...spec }))
      const initialRatios: Record<string, number> = {}
      for (const spec of initialPanes) {
        initialRatios[spec.id] = spec.ratio ?? 1
      }
      this.pane.actions.commitLayout(initialRatios, initialPanes)
    }
    this.paneManager = new PaneManager({ pane: this.pane, indicator: this.indicator })

    // ── Settings state（用户偏好 SSOT，含 theme light|dark|auto）──
    this.settings = createSettingsState(deps.initialSettings)
    this.renderer = createRendererState(
      deps.initialRendererRuntime ?? { effective: 'webgl', status: 'ready', error: null },
    )

    // ── 系统主题（auto 时参与 effectiveTheme 推导）──
    this.systemTheme = createSystemThemeState()
    this.effectiveTheme$ = computed(() => {
      const pref = this.settings.readonly.settings().theme
      if (pref === 'auto') return this.systemTheme.readonly.systemTheme()
      return pref === 'dark' ? 'dark' : 'light'
    })

    // ── 数据视图投影（数据视图、主序列渲染偏好与交互能力派生）──
    // 主图和指标统一从 kernel 状态投影；此处只输出意图，不执行 Layer 副作用。
    this.activeRenderers$ = computed(() => {
      const dataView = this.mode.readonly.dataView()
      const renderers = resolveIndicatorRenderers(dataView, this.indicator.readonly.instances())
      return Object.freeze([
        ...new Map(
          renderers.map((descriptor) => [descriptor.layerId, Object.freeze(descriptor)]),
        ).values(),
      ])
    })

    // ── Drawing state ──
    this.drawing = createDrawingState()

    // ── Interaction state (reads viewport signals directly) ──
    this.interaction = createInteractionState({
      visibleRange$: this.viewport.readonly.visibleRange as unknown as ReadonlySignal<{
        start: number
        end: number
      } | null>,
      scrollLeftLogical$: this.viewport.readonly
        .scrollLeftLogical as unknown as ReadonlySignal<number>,
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
      // Theme（生效主题；偏好在 settings.theme）
      theme: this.effectiveTheme$,
      // Settings
      settings: this.settings.readonly.settings,
      rendererRuntime: this.renderer.readonly.runtime,
      // Mode
      chartMode: this.mode.readonly.chartMode,
      dataView: this.mode.readonly.dataView,
      lastBarPeriod: this.mode.readonly.lastBarPeriod,
      primaryRendererByView: this.mode.readonly.primaryRendererByView,
      effectivePrimaryRenderer: this.mode.readonly.effectivePrimaryRenderer,
      interactionCapabilities: this.mode.readonly.interactionCapabilities,
      activeRenderers: this.activeRenderers$,
      // Pane scale types
      paneScaleTypes: this.pane.readonly.paneScaleTypes,
      // Drawing
      drawingTool: this.drawing.readonly.drawingTool,
      drawings: this.drawing.readonly.drawings,
      selectedDrawingId: this.drawing.readonly.selectedDrawingId,
      // Interaction
      interactionSnapshot: this.interaction.readonly.interactionSnapshot,
      crosshairIndex: this.interaction.readonly.crosshairIndex,
      // Comparison
      comparisonColors: this.comparison.readonly.colors,
      comparisonLoading: this.comparison.readonly.loading,
      // Indicator
      subPanes: this.indicator.readonly.subPanes,
      indicatorResult: this.indicatorResult.readonly.snapshot,
      indicatorResultAvailability: this.indicatorResultAvailability$,
      // Marker
      customMarkers: this.marker.readonly.customMarkers,
    }

    // ── Flat actions bag for framework adapters ──
    this.actions = {
      setZoomLevel: (level: number) => this.zoom.actions.setZoomLevel(level),
      setTimeShareKWidth: (kWidth: number) => this.zoom.actions.setTimeShareKWidth(kWidth),
      clearTimeShareKWidth: () => this.zoom.actions.clearTimeShareKWidth(),
      setSymbols: (symbols: ReadonlyArray<SymbolSpec>) => {
        const snapshot = symbols.map((symbol) => ({ ...symbol }))
        batch(() => {
          this.data.actions.setSymbols(snapshot)
          this.comparison.actions.syncColors(snapshot.slice(1))
        })
      },
      setSymbolCatalog: (catalog: ReadonlyArray<SymbolInfo>) =>
        this.data.actions.setSymbolCatalog(catalog),
      resetData: () => this.data.actions.reset(),
      setPaneRatios: (ratios: Record<string, number>) => this.pane.actions.setPaneRatios(ratios),
      setPaneSpecs: (specs: PaneSpec[]) => this.pane.actions.setPaneSpecs(specs),
      commitPaneLayout: (ratios: Record<string, number>, specs: PaneSpec[]) =>
        this.pane.actions.commitLayout(ratios, specs),
      setTheme: (theme: 'light' | 'dark') => this.settings.actions.patch({ theme }),
      setSystemTheme: (theme: 'light' | 'dark') => this.systemTheme.actions.setSystemTheme(theme),
      setRendererRuntime: (runtime: RendererBackendRuntime) =>
        this.renderer.actions.setRuntime(runtime),
      setDataView: (view: ChartDataView, lastBarPeriod?: string) => {
        const modeInstances: IndicatorInstanceSpec[] =
          view === ChartDataViewId.FiveDayTimeShare
            ? [
                {
                  instanceId: 'mode:five-day-timeshare',
                  indicatorId: ChartDataViewId.FiveDayTimeShare,
                  paneId: 'main',
                  role: 'main',
                  ordinal: 0,
                  params: {},
                },
                {
                  instanceId: 'mode:timeshare-volume',
                  indicatorId: 'volume',
                  paneId: 'timeshare_volume',
                  role: 'sub',
                  ordinal: 0,
                  params: {},
                },
              ]
            : isTimeShareDataView(view)
              ? [
                  {
                    instanceId: 'mode:timeshare',
                    indicatorId: 'timeShare',
                    paneId: 'main',
                    role: 'main',
                    ordinal: 0,
                    params: {},
                  },
                  {
                    instanceId: 'mode:timeshare-volume',
                    indicatorId: 'volume',
                    paneId: 'timeshare_volume',
                    role: 'sub',
                    ordinal: 0,
                    params: {},
                  },
                ]
              : view === ChartDataViewId.Comparison
                ? [
                    {
                      instanceId: 'mode:comparison',
                      indicatorId: 'comparisonLine',
                      paneId: 'main',
                      role: 'main',
                      ordinal: 0,
                      params: {},
                    },
                  ]
                : [
                    {
                      instanceId: 'mode:candle',
                      indicatorId: 'candle',
                      paneId: 'main',
                      role: 'main',
                      ordinal: 0,
                      params: {},
                    },
                    {
                      instanceId: 'mode:extrema-markers',
                      indicatorId: 'extremaMarkers',
                      paneId: 'main',
                      role: 'main',
                      ordinal: 0,
                      params: {},
                    },
                    {
                      instanceId: 'mode:last-price-line',
                      indicatorId: 'lastPriceLine',
                      paneId: 'main',
                      role: 'main',
                      ordinal: 0,
                      params: {},
                    },
                    {
                      instanceId: 'mode:last-price-label',
                      indicatorId: 'lastPriceLabelRegistrar',
                      paneId: 'main',
                      role: 'main',
                      ordinal: 0,
                      params: {},
                    },
                  ]
        // mode 仅声明所需能力；统一实例调度器决定复用用户副图还是创建系统实例。
        const resolvedModeInstances = resolveModeIndicatorInstances(
          modeInstances,
          this.indicator.readonly.instances.peek(),
        )
        const needsSystemTimeShareVolume = resolvedModeInstances.some(
          (instance) => instance.role === 'sub' && instance.paneId === 'timeshare_volume',
        )
        const currentSpecs = this.pane.readonly.paneSpecs.peek()
        const nextSpecs = isTimeShareDataView(view)
          ? !needsSystemTimeShareVolume ||
            currentSpecs.some((pane) => pane.id === 'timeshare_volume')
            ? currentSpecs
            : [
                ...currentSpecs,
                { id: 'timeshare_volume', ratio: 1, visible: true, role: 'indicator' as const },
              ]
          : currentSpecs.filter((pane) => pane.id !== 'timeshare_volume')
        const rawRatios = { ...this.pane.readonly.paneRatios.peek() }
        delete rawRatios.timeshare_volume
        if (isTimeShareDataView(view) && needsSystemTimeShareVolume) {
          // 分时量默认占主图高度的三分之一，避免仅有主图时平分为 50%。
          rawRatios.timeshare_volume = (rawRatios.main ?? 1) / 3
        }
        const visible = nextSpecs.filter((pane) => pane.visible !== false)
        const total = visible.reduce((sum, pane) => sum + (rawRatios[pane.id] ?? 1), 0) || 1
        const normalizeRatio = (value: number) =>
          Math.round(value * 1_000_000_000_000) / 1_000_000_000_000
        const ratios = Object.fromEntries(
          nextSpecs.map((pane) => [
            pane.id,
            pane.visible === false
              ? (rawRatios[pane.id] ?? pane.ratio ?? 1)
              : normalizeRatio((rawRatios[pane.id] ?? 1) / total),
          ]),
        )
        batch(() => {
          this.mode.actions.setDataView(view, lastBarPeriod)
          this.indicator.actions.replaceModeInstances(resolvedModeInstances)
          this.pane.actions.commitLayout(
            ratios,
            nextSpecs.map((pane) => ({ ...pane, ratio: ratios[pane.id] })),
          )
        })
      },
      setLastBarPeriod: (period: string) => this.mode.actions.setLastBarPeriod(period),
      setPrimaryRenderer: (
        view: ChartDataView,
        renderer: 'candlestick' | 'ohlc-bar' | 'line' | 'area',
      ) => this.mode.actions.setPrimaryRenderer(view, renderer),
      setDrawingTool: (tool: DrawingToolId) => this.drawing.actions.setDrawingTool(tool),
      setDrawings: (drawings: ReadonlyArray<DrawingObject>) =>
        this.drawing.actions.setDrawings(drawings),
      clearDrawings: () => this.drawing.actions.clearDrawings(),
      updateCrosshair: (
        pos: { x: number; y: number } | null,
        price: number | null,
        index?: number | null,
      ) => this.interaction.actions.updateCrosshair(pos, price, index),
      setCrosshairIndex: (index: number | null) =>
        this.interaction.actions.setCrosshairIndex(index),
      updateHover: (index: number | null, paneId: string | null) =>
        this.interaction.actions.updateHover(index, paneId),
      setHoveredIndex: (index: number | null) => this.interaction.actions.setHoveredIndex(index),
      setActivePaneId: (paneId: string | null) => this.interaction.actions.setActivePaneId(paneId),
      startDrag: (mode: DragMode) => this.interaction.actions.startDrag(mode),
      endDrag: () => this.interaction.actions.endDrag(),
      setDragMode: (mode: DragMode) => this.interaction.actions.setDragMode(mode),
      setSeparatorHover: (paneId: string | null) =>
        this.interaction.actions.setSeparatorHover(paneId),
      setRightAxisHover: (paneId: string | null) =>
        this.interaction.actions.setRightAxisHover(paneId),
      updateTooltip: (pos: { x: number; y: number }, placement: 'right-bottom' | 'left-bottom') =>
        this.interaction.actions.updateTooltip(pos, placement),
      updateMarkerHover: (
        markerId: string | null,
        markerData: MarkerEntity | null,
        customMarkerData: CustomMarkerEntity | null,
      ) => this.interaction.actions.updateMarkerHover(markerId, markerData, customMarkerData),
      resetInteraction: () => this.interaction.actions.reset(),
      setComparisonColors: (colors: ReadonlyMap<string, string>) =>
        this.comparison.actions.setColors(colors),
      setComparisonLoading: (loading: boolean) => this.comparison.actions.setLoading(loading),
      upsertMainIndicator: (id, params) => this.indicator.actions.upsertMain(id, params),
      removeMainIndicator: (id) => this.indicator.actions.removeMain(id),
      setMainIndicatorParams: (id, params) => this.indicator.actions.setMainParams(id, params),
      replaceMainIndicators: (instances: ReadonlyArray<IndicatorInstanceSpec>) =>
        this.indicator.actions.replaceAllMain(instances),
      clearMainIndicators: () => this.indicator.actions.clearMain(),
      // customMarkers 变更须走 Chart.update/clear/registerCustomMarkers：
      // 同步 clearPositionCache + scheduleDraw。勿在此暴露仅写 state 的 flat actions。
    }
    this.actions.setDataView(ChartDataViewId.KLine)
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
    this.settings.dispose()
    this.systemTheme.dispose()
    this.mode.dispose()
    this.drawing.dispose()
    this.interaction.dispose()
    this.dataManager.dispose()
    this.comparison.dispose()
    this.indicator.dispose()
    this.indicatorResult.dispose()
    this.marker.dispose()
    this.renderer.dispose()
  }
}

export type ChartStateKernelModule = ChartStateKernel
