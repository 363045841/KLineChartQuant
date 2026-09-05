/**
 * Chart — 图表顶层编排器。
 *
 * 职责范围：
 * - 持有 StateKernel（所有配置与状态的唯一数据源）
 * - 管理 Viewport / 布局 / 渲染器生命周期
 * - 提供 scheduleDraw / draw 入口供外部（交互、数据、插件）触发重绘
 * - 协调插件宿主、指标控制器、标注管理器等子系统的初始化与销毁
 *
 * 不是绘制管线的一部分。绘制由 ChartRenderer 完成，Chart 仅负责代理调用并维护 runtimeProjection（批量投影）屏障。
 */
import { createAlertController } from '../features/alerts/index'
import {
  createVolumeLookbacks,
  pushToVolumeLookbacks,
  type VolumeLookbacks,
} from '../features/alerts/rollingVolume'
import {
  createPluginHost,
  RendererPluginManager,
  wrapPaneInfo,
  type PluginHostImpl,
  type RendererPlugin,
  type RendererPluginWithHost,
} from '../foundation/plugin/index'
import { makePluginLayerId } from '../foundation/plugin/rendererLayerId'
import { createLayerFromPlugin } from '../rendering/scene/createLayerFromPlugin'
import {
  computed,
  createSignal,
  effect,
  type Computed,
  type ReadonlySignal,
  type Signal,
  type WritableSignal,
} from '../foundation/reactivity/signal'
import type { LegendTemplateContext } from './renderers/Indicator/mainIndicatorLegendContext'

import { InteractionController, type InteractionSnapshot } from './controller/interaction'

import {
  buildPaneScaleTypesFromSetting,
  resolvePriceScaleTypeSetting,
  type ChartSettings,
} from '../foundation/config/chartSettings'
import { resolveMarketDataCacheMaxBytes } from '../data/buffer/marketDataPolicy'
import {
  createDefaultRendererHostSync,
  type RendererBackend,
  type RendererHost,
} from '../rendering/render/index'
import type { KLineData } from '../foundation/types/price'

import type { IndicatorScheduler } from './indicators/scheduler'
import type { CustomMarkerEntity, MarkerManager } from './marker/registry'
import type { ChartModeHandler } from './modes/types'
import type { ScaleType } from './utils/tickPosition'

// ===== 普通 imports，按路径字母排序 =====
import { ChartDataManager } from './data/chartDataManager'
import { ChartDrawingFacade } from './facade/chartDrawingFacade'
import { ChartIndicatorFacade } from './facade/chartIndicatorFacade'
import { ChartMarkerFacade } from './facade/chartMarkerFacade'
import { ChartPaneFacade } from './facade/chartPaneFacade'
import { ChartThemeFacade } from './facade/chartThemeFacade'
import { ChartZoomFacade } from './facade/chartZoomFacade'
import { ChartIndicatorManager } from './indicators/chartIndicatorManager'
import { resolveStateKey } from './indicators/indicatorMetadata'
import { ChartPaneLayout } from './layout/chartPaneLayout'
import { UpdateLevel, type VisibleRange } from './layout/pane'
import { KLineMode } from './modes/kLineMode'
import { TimeShareMode } from './modes/timeShareMode'
import { MarketSessionRegistry } from './market/marketSessionRegistry'
import { resolveSymbolMarketSession } from './market/resolveSymbolMarketSession'
import { PaneRenderer } from './paneRenderer'
import { ChartRenderer, mergeUpdateLevel } from './render/chartRenderer'
import { ChartStateKernel } from './state/chartStateKernel'
import type { ViewWorkspacePersistence, ViewWorkspacesSnapshot } from './state/viewWorkspace'
import type { RangeSelectionState } from './state/interactionState'
import {
  ChartDataViewId,
  isTimeShareDataView,
  resolveChartWorkspaceId,
  type ChartDataView,
} from './state/modeState'
import { ChartViewportManager } from './viewport/chartViewportManager'
import { ChartZoomController } from './utils/chartZoomController'
import { getPhysicalKLineConfig } from './utils/klineConfig'
import type {
  ChartDom,
  PaneSpec,
  ChartOptions,
  Viewport,
  ViewportState,
  IndicatorInstance,
  SubPaneInfo,
} from './chartTypes'
import type { DrawingToolId } from './drawing/toolConfig'
import type { DrawingInteractionController } from './drawing/interaction'
import {
  FIVE_DAY_TIME_SHARE_PERIOD,
  isTimeSharePeriod,
  TIME_SHARE_PERIOD,
  type SymbolSpec,
  type SymbolInfo,
  type CustomDataSource,
} from '../controllers/types'
import type { AlertController, MarketSnapshot } from '../features/alerts/types'

export type { InteractionSnapshot }

// ===== 重新导出 =====
export { getPhysicalKLineConfig }
export type {
  ChartDom,
  ChartOptions,
  IndicatorInstance,
  IndicatorRole,
  KLinePositions,
  PaneRendererDom,
  PaneSpec,
  SubPaneInfo,
  Viewport,
  ViewportState,
} from './chartTypes'

type ResolvedChartOptions = Omit<ChartOptions, 'kWidth' | 'kGap'>

export class Chart {
  private dom: ChartDom
  private dataManager: ChartDataManager

  /** StateKernel — single source of truth for all chart state */
  readonly kernel: ChartStateKernel

  private viewportManager: ChartViewportManager
  private layoutManager: ChartPaneLayout
  private get paneRenderers(): PaneRenderer[] {
    return this.layoutManager.getPaneRenderers()
  }
  readonly interaction!: InteractionController

  /** 插件宿主 */
  private pluginHost: PluginHostImpl

  /** 渲染器插件管理器 */
  private rendererPluginManager: RendererPluginManager

  /** 具体渲染后端及其生命周期所有者 */
  private rendererHost: RendererHost

  /** 缩放控制器 */
  private zoomController: ChartZoomController

  /** 主题领域公开 API。 */
  readonly theme: ChartThemeFacade

  /** 缩放领域公开 API。 */
  readonly zoom: ChartZoomFacade

  /** 绘图领域公开 API。 */
  readonly drawing: ChartDrawingFacade

  /** 标记领域公开 API。 */
  readonly markers: ChartMarkerFacade

  /** Pane 领域公开 API。 */
  readonly panes: ChartPaneFacade

  /** 指标领域公开 API。 */
  readonly indicators: ChartIndicatorFacade

  /** 指标管理器 */
  private indicatorManager: ChartIndicatorManager

  /** 渲染器 */
  private renderer: ChartRenderer
  /** runRuntimeProjection 嵌套深度，大于 0 时推迟 scheduleDraw */
  private runtimeProjectionDepth = 0
  /** 被推迟的绘制级别，退出嵌套后统一 flush */
  private pendingProjectionLevel: UpdateLevel | null = null
  /** activeRenderers 到 Scene 可见性的唯一投影。 */
  private disposeActiveRendererProjection: (() => void) | null = null
  /** 主图图例模板上下文（每帧由 mainIndicatorLegend 发布） */
  private readonly _legendTemplateContext: WritableSignal<LegendTemplateContext | null> =
    createSignal<LegendTemplateContext | null>(null)

  /** 绘图交互会话（锚点/预览/拖拽）；工具 id 在 kernel */
  private drawingSession: DrawingInteractionController | null = null

  private _kLineMode = new KLineMode()
  private _timeShareMode = new TimeShareMode()
  private readonly marketSessions: MarketSessionRegistry

  /** 比较视图进入前的刻度快照，退出比较视图时恢复。 */
  private _savedComparisonScaleTypes: Map<string, ScaleType> | null = null

  /** 上次预警评估的最新 K 线时间戳（用于去重） */
  private _lastAlertTimestamp: number | null = null

  /** 预警控制器 */
  readonly alertController: AlertController

  /** 滚动成交量窗口（惰性初始化） */
  private _volumeLookbacks: VolumeLookbacks | null = null
  /** 仅由 controller 注入的工作区持久化适配器。 */
  private workspacePersistence: ViewWorkspacePersistence | null = null

  /**
   * 创建图表实例
   * @param dom 由 Vue 组件传入的 DOM 句柄
   * @param opt 初始配置
   */
  constructor(
    dom: ChartDom,
    opt: ChartOptions,
    runtime?: {
      rendererHost?: RendererHost
      initialSettings?: Partial<ChartSettings>
      initialViewWorkspaces?: ViewWorkspacesSnapshot
      marketSessions?: Readonly<
        Record<string, import('../foundation/utils/sessionTimeLabels').MarketSessionConfig>
      >
    },
  ) {
    this.dom = dom
    const { kWidth: _kWidth, kGap: _kGap, ...restOpt } = opt
    this.marketSessions = new MarketSessionRegistry(runtime?.marketSessions)
    this.pluginHost = createPluginHost()
    this.rendererPluginManager = new RendererPluginManager()
    this.rendererHost = runtime?.rendererHost ?? createDefaultRendererHostSync()

    // 注入依赖
    this.rendererPluginManager.setPluginHost(this.pluginHost)
    this.rendererPluginManager.setInvalidateCallback(() => this.scheduleDraw())

    const initialZoomLevel = opt.initialZoomLevel ?? 1
    const zoomLevelCount = Math.max(2, Math.round(opt.zoomLevels ?? 20))

    // ── StateKernel: single composition root (owns options, zoom, data, viewport, pane, theme, drawing, interaction) ──
    this.kernel = new ChartStateKernel({
      initialOptions: {
        ...restOpt,
        zoomLevelCount,
      },
      initialZoomLevel,
      initialSettings: runtime?.initialSettings,
      initialRendererRuntime: this.rendererHost.runtime,
      initialViewWorkspaces: runtime?.initialViewWorkspaces,
      marketSessions: this.marketSessions,
      scheduleDraw: (level) => this.scheduleDraw(level as UpdateLevel | undefined),
    })
    this.rendererHost.setListeners({
      onRuntimeChange: (rendererRuntime) => {
        this.kernel.renderer.actions.setRuntime(rendererRuntime)
        this.syncGpuSceneCanvas()
      },
      requestRedraw: () => this.scheduleDraw(UpdateLevel.All),
    })
    this.syncGpuSceneCanvas()

    // Inject DOM deps into kernel's viewportState (needed before init)
    this.kernel.setViewportDomDeps({
      getDom: () => this.dom,
      resizeSharedWebGLSurface: (plotWidth, plotHeight, dpr) =>
        this.rendererHost.resize(plotWidth, plotHeight, dpr),
    })

    // ── ViewportManager (DOM lifecycle: ResizeObserver + scroll events) ──
    this.viewportManager = new ChartViewportManager(
      {
        getDom: () => this.dom,
        onResizeCompleted: () => {
          this.resize()
        },
      },
      this.kernel,
    )

    // ── InteractionController ──
    this.interaction = new InteractionController(this, this.kernel.interaction)

    // ── Legacy managers ──
    this.layoutManager = new ChartPaneLayout(restOpt.panes, {
      getDom: () => this.dom,
      getOption: () => {
        const o = this.kernel.options.readonly.options.peek()
        return {
          rightAxisWidth: o.rightAxisWidth,
          leftAxisWidth: o.leftAxisWidth,
          yPaddingPx: o.yPaddingPx,
          priceLabelWidth: o.priceLabelWidth,
          paneGap: o.paneGap,
          defaultPaneMinHeightPx: o.defaultPaneMinHeightPx,
        }
      },
      viewport: this.kernel.viewport,
      setKnownPaneIds: (ids) => this.rendererPluginManager.setKnownPaneIds(ids),
      notifyPaneResize: (paneId, pane) =>
        this.rendererPluginManager.notifyResize(paneId, wrapPaneInfo(pane)),
      scheduleDraw: (level) => this.scheduleDraw(level),
      pane: this.kernel.pane,
      afterCommitLayout: () => {
        this.ensurePaneScaleTypesFromSettings()
        this.scheduleWorkspacePersistence()
      },
    })
    this.panes = new ChartPaneFacade({
      kernel: this.kernel,
      layoutManager: this.layoutManager,
      ensureScaleTypes: () => this.ensurePaneScaleTypesFromSettings(),
      schedulePersistence: () => this.scheduleWorkspacePersistence(),
    })

    this.alertController = createAlertController()

    this.dataManager = new ChartDataManager(
      {
        getOption: () => {
          const o = this.kernel.options.readonly.options.peek()
          return {
            ...o,
            kWidth: this.kernel.zoom.readonly.kWidth(),
            kGap: this.kernel.viewport.readonly.kGap(),
          }
        },
        getZoomLevel: () => this.kernel.zoom.readonly.zoomLevel.peek(),
        setZoomLevel: (level) => this.kernel.zoom.actions.setZoomLevel(level),
        getDom: () => this.dom,
        viewport: this.kernel.viewport,
        comparison: this.kernel.comparison,
        scheduleDraw: (level) => this.scheduleDraw(level),
        resetInteraction: () => this.interaction.reset(),
        getIndicatorScheduler: () => this.indicatorManager.indicatorSchedulerAccessor,
        isPointerDown: () => this.interaction.isPointerDown(),
        onTimeShareDataReady: (dataLength) => {
          const vp = this.getViewport()
          if (!vp || vp.plotWidth <= 0) return
          const result = this.activeMode.computeKWidth(dataLength, vp.plotWidth, vp.dpr)
          if (result) {
            this.applyRenderState(result.kWidth, result.kGap)
            const leftBuffer = this.getLeftLoadBufferWidth()
            this.kernel.viewport.actions.scrollTo(leftBuffer)
          }
        },
        onDataProcessed: (data, range) => this.evaluateAlerts(data, range),
        setSymbols: (symbols) => this.kernel.actions.setSymbols(symbols),
      },
      this.kernel.data,
      this.kernel.dataManager,
    )
    this.dataManager.marketDataCache.setMaxBytes(
      resolveMarketDataCacheMaxBytes(
        this.kernel.settings.readonly.settings.peek().marketDataCacheMaxMiB,
      ),
    )

    this.zoomController = new ChartZoomController(
      {
        viewport: this.kernel.viewport,
        options: this.kernel.options,
        period$: this.kernel.dataManager.readonly.currentPeriod,
        getClientWidth: () => this.getViewport()?.viewWidth ?? this.dom.container?.clientWidth ?? 0,
        getDataLength: () => this.dataManager.getData().length,
        getPlotWidth: () => this.getLeftLoadBufferWidth(),
        onChange: () => {
          this.scheduleDraw()
        },
      },
      this.kernel.zoom,
    )
    this.theme = new ChartThemeFacade({
      kernel: this.kernel,
      scheduleDraw: () => this.scheduleDraw(),
    })
    this.zoom = new ChartZoomFacade({
      kernel: this.kernel,
      controller: this.zoomController,
    })

    // 先创建 Scene，确保恢复的指标首次 projection 能直接挂载 Layer。
    this.renderer = new ChartRenderer({
      getDom: () => this.dom,
      getOption: () => {
        const o = this.kernel.options.readonly.options.peek()
        return {
          ...o,
          kWidth: this.kernel.zoom.readonly.kWidth(),
          kGap: this.kernel.viewport.readonly.kGap(),
        }
      },
      getPaneRenderers: () => this.paneRenderers,
      getInteraction: () => this.interaction,
      getSceneRenderer: () => this.rendererHost.renderer,
      getPluginHost: () => this.pluginHost,
      getRendererPluginManager: () => this.rendererPluginManager,
      theme$: this.kernel.effectiveTheme$,
      zoom: this.kernel.zoom,
      options: this.kernel.options,
      viewport: this.kernel.viewport,
      getDataManager: () => this.dataManager,
      getIndicatorManager: () => this.indicatorManager,
      getActiveMode: () => this.activeMode,
      dataView$: this.kernel.mode.readonly.dataView,
      settings$: this.kernel.settings.readonly.settings,
      customMarkers$: this.kernel.marker.readonly.customMarkers,
      drawings$: this.kernel.drawing.readonly.drawings,
      selectedDrawingIds$: this.kernel.drawing.readonly.selectedDrawingIds,
      getOverlay: () => this.drawingSession?.getPaintOverlay() ?? [],
      onLegendContext: (ctx) => {
        this._legendTemplateContext.set(ctx)
      },
    })
    this.renderer.registerDrawingPlugins()
    this.renderer.initCoreRenderers()
    this.drawing = new ChartDrawingFacade({
      kernel: this.kernel,
      dataManager: this.dataManager,
      renderer: this.renderer,
      getSession: () => this.drawingSession,
      scheduleDraw: () => this.scheduleDraw(),
    })
    this.markers = new ChartMarkerFacade({
      kernel: this.kernel,
      renderer: this.renderer,
      scheduleDraw: () => this.scheduleDraw(),
    })

    this.indicatorManager = new ChartIndicatorManager({
      getOption: () => {
        const o = this.kernel.options.readonly.options.peek()
        return {
          ...o,
          kWidth: this.kernel.zoom.readonly.kWidth(),
          kGap: this.kernel.viewport.readonly.kGap(),
        }
      },
      getPluginHost: () => this.pluginHost,
      getRenderer: (name) => this.getRenderer(name),
      useRenderer: (plugin, config) => this.useRenderer(plugin, config),
      removeRenderer: (name) => this.removeRenderer(name),
      updateRendererConfig: (name, config) => this.updateRendererConfig(name, config),
      getLayer: (id) => this.renderer.getScene().getLayer(id) ?? null,
      paneRatios$: this.kernel.pane.readonly.paneRatios as ReadonlySignal<
        Readonly<Record<string, number>>
      >,
      paneSpecs$: this.kernel.pane.readonly.paneSpecs,
      projectPaneLayout: (specs, ratios) => {
        this.layoutManager.projectState(specs, ratios)
        this.ensurePaneScaleTypesFromSettings()
      },
      getLastVisibleRange: () => this.dataManager.getCurrentVisibleRange() ?? { start: 0, end: 0 },
      getCrosshairPos: () => this.interaction.crosshairPos,
      getCrosshairPrice: () => this.interaction.crosshairPrice,
      getActivePaneId: () => this.interaction.activePaneId,
      scheduleDraw: (level) => this.scheduleDraw(level),
      getRenderContext: (paneId) => this.renderer.getPaneCtxMap().get(paneId) ?? null,
      indicator: this.kernel.indicator,
      indicatorResult: this.kernel.indicatorResult,
      subPaneOps: {
        create: (entry) => this.kernel.paneManager.createFromIndicator(entry),
        remove: (paneId) => this.kernel.paneManager.actions.remove(paneId),
        replace: (paneId, indicatorId, params) =>
          this.kernel.paneManager.actions.replaceContent(paneId, indicatorId, params),
        setParams: (paneId, params) =>
          this.kernel.paneManager.actions.updateContent(paneId, params),
        clear: () => this.kernel.paneManager.actions.clear(),
      },
      runRendererTransaction: (run) => this.runRuntimeProjection(run),
    })
    this.indicators = new ChartIndicatorFacade({
      manager: this.indicatorManager,
      schedulePersistence: () => this.scheduleWorkspacePersistence(),
    })

    // Worker 异步结果就绪后串联 Alert 管线
    this.indicatorManager.indicatorSchedulerAccessor.setOnResultsApplied(() => {
      const data = this.dataManager.getInternalData()
      this.evaluateAlerts(data, this.dataManager.getCurrentVisibleRange() ?? { start: 0, end: 0 })
    })

    // 绑定 visibleRange 信号 — 替代 prepareFrameData 中的手动 updateVisibleRange
    this.indicatorManager.indicatorSchedulerAccessor.setVisibleRangeSignal(
      this.kernel.viewport.readonly.visibleRange as unknown as ReadonlySignal<{
        start: number
        end: number
      } | null>,
    )
    this.startRuntime()
  }

  /** 在所有运行时依赖就绪后，统一将 kernel 状态投影为可绘制图表。 */
  private startRuntime(): void {
    this.indicatorManager.start()
    this.viewportManager.init()
    this.ensurePaneScaleTypesFromSettings()
    this.installActiveRendererProjection()
    this.scheduleDraw()
  }

  getViewport(): Viewport | null {
    if (this.kernel.viewport.readonly.viewWidth.peek() === 0) return null
    return this.kernel.viewport.readonly.viewport.peek()
  }

  /** 由 controller 在构造完成后注入浏览器工作区持久化。 */
  setViewWorkspacePersistence(persistence: ViewWorkspacePersistence): void {
    this.workspacePersistence?.dispose()
    this.workspacePersistence = persistence
  }

  /** 调度用户工作区快照持久化。 */
  private scheduleWorkspacePersistence(): void {
    this.workspacePersistence?.schedule()
  }

  /** 获取当前活跃的模式处理器 */
  get activeMode(): ChartModeHandler {
    return isTimeShareDataView(this.kernel.mode.readonly.dataView.peek())
      ? this._timeShareMode
      : this._kLineMode
  }

  /** 切换模式处理器 */
  setActiveMode(mode: ChartModeHandler, dataView?: ChartDataView): void {
    const prev = this.activeMode
    const nextDataView =
      dataView ?? (mode === this._timeShareMode ? ChartDataViewId.TimeShare : ChartDataViewId.KLine)
    if (prev === mode && this.kernel.mode.readonly.dataView.peek() === nextDataView) return

    if (isTimeShareDataView(nextDataView)) this.kernel.zoom.actions.clearTimeShareKWidth()

    prev.onDeactivate(
      {
        enableMainIndicator: (id, p) => this.indicators.enableMain(id, p),
        disableMainIndicator: (id) => this.indicators.disableMain(id),
        dataManager: this.dataManager,
      },
      mode,
    )
    this.kernel.actions.setDataView(
      nextDataView,
      isTimeShareDataView(nextDataView) ? this.dataManager.currentPeriod : undefined,
    )
    // 数据视图切换前的各 Layer 已使用旧数据绘制；先清屏并废弃几何缓存，避免等待新视图数据时残留。
    this.renderer.clearCachedFrame()
    this.renderer.clearAllCanvases()
    // #legend 插槽消费独立的 Vue DOM 上下文，不随 canvas 清屏；切换时必须同步清除旧图例。
    this._legendTemplateContext.set(null)

    if (isTimeShareDataView(nextDataView)) {
      const percentMap = new Map(this.kernel.pane.readonly.paneScaleTypes.peek())
      for (const renderer of this.paneRenderers) {
        const pane = renderer.getPane()
        if (pane.role === 'price') percentMap.set(pane.id, 'percent')
      }
      this.kernel.pane.actions.replacePaneScaleTypes(percentMap)
      this.projectPaneScaleTypes()
    } else {
      for (const renderer of this.paneRenderers) renderer.getPane().yAxis.setBasePrice(null)
      this.applyPriceScaleSettingToKernel(
        resolvePriceScaleTypeSetting(
          this.kernel.settings.readonly.settings.peek().mainRightAxisTypeSetting,
        ),
      )
    }

    mode.onActivate(
      {
        enableMainIndicator: (id, p) => this.indicators.enableMain(id, p),
        disableMainIndicator: (id) => this.indicators.disableMain(id),
        dataManager: this.dataManager,
        currentPeriod: this.dataManager.currentPeriod,
      },
      prev,
    )
  }

  getCurrentDpr(): number {
    return this.kernel.viewport.readonly.dpr.peek()
  }

  /** 获取当前周期 */
  get currentPeriod(): string {
    return this.dataManager.currentPeriod
  }

  /** 获取插件宿主 */
  get plugin(): PluginHostImpl {
    return this.pluginHost
  }

  // ========== 渲染器插件 API（绘制只走 Scene；Manager 仅作注册表） ==========

  private resolvePluginLayerTarget(plugin: RendererPlugin): string {
    if (typeof plugin.paneId === 'symbol') {
      return 'global'
    }
    return String(plugin.paneId)
  }

  private getContextForPluginLayer(targetPaneId: string) {
    return () => {
      if (!this.renderer) return null
      const map = this.renderer.getPaneCtxMap()
      if (targetPaneId === 'global') {
        return map.get(this.renderer.getCurrentPaneId()) ?? null
      }
      return map.get(targetPaneId) ?? null
    }
  }

  /** 安装渲染器插件：注册元数据 + 挂 Scene Layer（唯一绘制路径；幂等） */
  useRenderer(
    plugin: RendererPlugin | RendererPluginWithHost,
    config?: Record<string, unknown>,
  ): void {
    const layerId = makePluginLayerId(plugin.name)
    const scene = this.renderer?.getScene()
    const existingPlugin = this.rendererPluginManager.getPlugin(plugin.name)
    const alreadyLayer = scene?.getLayer(layerId) != null

    if (existingPlugin && alreadyLayer) {
      if (config && existingPlugin.setConfig) existingPlugin.setConfig(config)
      return
    }

    // 仅有注册表：补挂 Layer（不新建 plugin 实例）
    if (existingPlugin && !alreadyLayer) {
      if (config && existingPlugin.setConfig) existingPlugin.setConfig(config)
      const targetPaneId = this.resolvePluginLayerTarget(existingPlugin)
      scene?.addLayer(
        createLayerFromPlugin(
          existingPlugin,
          this.getContextForPluginLayer(targetPaneId),
          targetPaneId,
        ),
      )
      return
    }

    // 仅有 Layer（core 预挂）：不二次 register，避免 Manager 实例 ≠ 绘制实例
    if (!existingPlugin && alreadyLayer) {
      return
    }

    this.rendererPluginManager.register(plugin)
    if (config && plugin.setConfig) {
      plugin.setConfig(config)
    }
    const targetPaneId = this.resolvePluginLayerTarget(plugin)
    const layer = createLayerFromPlugin(
      plugin,
      this.getContextForPluginLayer(targetPaneId),
      targetPaneId,
    )
    scene?.addLayer(layer)
  }

  /**
   * 移除渲染器插件。
   * onUninstall 仅由 Manager.unregister 调用；Scene removeLayer 不 dispose，避免双调。
   */
  removeRenderer(name: string): void {
    this.rendererPluginManager.unregister(name)
    this.renderer?.getScene()?.removeLayer(makePluginLayerId(name))
  }

  /** 获取渲染器插件 */
  getRenderer<T extends RendererPlugin = RendererPlugin>(name: string): T | undefined {
    return this.rendererPluginManager.getPlugin<T>(name)
  }

  /** 更新渲染器配置（自动重绘） */
  updateRendererConfig(name: string, config: Record<string, unknown>): void {
    this.rendererPluginManager.updateConfig(name, config)
  }

  /** 启用/禁用渲染器（Scene Layer 显隐；Manager enabled 仅同步元数据） */
  setRendererEnabled(name: string, enabled: boolean): void {
    const inManager = this.rendererPluginManager.getPlugin(name) != null
    if (inManager) {
      // setEnabled → invalidate → scheduleDraw（勿再 schedule 双唤醒）
      this.rendererPluginManager.setEnabled(name, enabled)
    }
    this.renderer?.getScene()?.setLayerVisibility(makePluginLayerId(name), enabled)
    // core-only Layer（如 candle）不在 Manager：需显式重绘
    if (!inManager) {
      this.scheduleDraw()
    }
  }

  /** 获取所有渲染器 */
  getAllRenderers(): RendererPlugin[] {
    return this.rendererPluginManager.getAllPlugins()
  }

  /** 将 kernel.paneScaleTypes 投影到各 pane PriceScale（runtime 非 SSOT） */
  private projectPaneScaleTypes(): void {
    const types = this.kernel.pane.readonly.paneScaleTypes.peek()
    for (const renderer of this.paneRenderers) {
      const pane = renderer.getPane()
      const t = types.get(pane.id) ?? 'linear'
      if (pane.yAxis.getScaleType() !== t) pane.yAxis.setScaleType(t)
    }
  }

  /** 按用户坐标偏好生成各 pane 的刻度 Map */
  private buildScaleTypesFromSetting(setting: ScaleType): Map<string, ScaleType> {
    return buildPaneScaleTypesFromSetting(
      this.paneRenderers.map((renderer) => {
        const pane = renderer.getPane()
        return { id: pane.id, role: pane.role }
      }),
      resolvePriceScaleTypeSetting(setting),
    )
  }

  /**
   * 为缺失 paneScaleTypes 的 pane 按用户坐标偏好补齐，再投影。
   * commitLayout 只保留已有 id，不静默塞 linear，避免盖掉用户偏好。
   */
  private ensurePaneScaleTypesFromSettings(): void {
    const setting = resolvePriceScaleTypeSetting(
      this.kernel.settings.readonly.settings.peek().mainRightAxisTypeSetting,
    )
    const seeded = this.buildScaleTypesFromSetting(setting)
    const next = new Map(this.kernel.pane.readonly.paneScaleTypes.peek())
    let changed = false
    for (const renderer of this.paneRenderers) {
      const pane = renderer.getPane()
      if (next.has(pane.id)) continue
      next.set(pane.id, seeded.get(pane.id) ?? 'linear')
      changed = true
    }
    if (changed) this.kernel.pane.actions.replacePaneScaleTypes(next)
    this.projectPaneScaleTypes()
  }

  /**
   * 将用户坐标偏好写入 paneScaleTypes。
   * 分时覆盖期间保留用户 Setting，由 dataView 返回 K 线时重新派生生效刻度。
   */
  private applyPriceScaleSettingToKernel(setting: ScaleType): void {
    const next = this.buildScaleTypesFromSetting(setting)
    if (isTimeShareDataView(this.kernel.mode.readonly.chartMode.peek())) {
      return
    }
    if (this.dataManager.getComparisonSpecs().length > 0) {
      this._savedComparisonScaleTypes = next
      this.applyComparisonScaleType(true)
      return
    }
    this.kernel.pane.actions.replacePaneScaleTypes(next)
    this.projectPaneScaleTypes()
  }

  /** 比较视图的主图刻度通过 kernel 管理，避免渲染期旁路写入 PriceScale。 */
  private applyComparisonScaleType(active: boolean): void {
    if (!active) {
      if (!this._savedComparisonScaleTypes) return
      this.kernel.pane.actions.replacePaneScaleTypes(this._savedComparisonScaleTypes)
      this._savedComparisonScaleTypes = null
      this.projectPaneScaleTypes()
      return
    }

    if (!this._savedComparisonScaleTypes) {
      this._savedComparisonScaleTypes = new Map(this.kernel.pane.readonly.paneScaleTypes.peek())
    }
    const next = new Map(this.kernel.pane.readonly.paneScaleTypes.peek())
    const mainPane = this.paneRenderers
      .find((renderer) => renderer.getPane().role === 'price')
      ?.getPane()
    if (!mainPane || next.get(mainPane.id) === 'percent') return
    next.set(mainPane.id, 'percent')
    this.kernel.pane.actions.replacePaneScaleTypes(next)
    this.projectPaneScaleTypes()
  }

  /**
   * 更新用户设置（触发重绘）—— 业务态只写 kernel.settings。
   * 使用 patch 合并到当前 resolved，避免 partial 覆盖把未传 key 打回默认。
   */
  updateSettings(settings: ChartSettings): void {
    const prev = this.kernel.settings.readonly.settings.peek()
    this.kernel.settings.actions.patch(settings)
    const next = this.kernel.settings.readonly.settings.peek()
    this.interaction.onSettingsChanged(prev, next)
    if (prev.marketDataCacheMaxMiB !== next.marketDataCacheMaxMiB) {
      this.dataManager.marketDataCache.setMaxBytes(
        resolveMarketDataCacheMaxBytes(next.marketDataCacheMaxMiB),
      )
    }

    if (
      prev.mainRightAxisTypeSetting !== next.mainRightAxisTypeSetting &&
      next.mainRightAxisTypeSetting !== 'none'
    ) {
      this.applyPriceScaleSettingToKernel(
        resolvePriceScaleTypeSetting(next.mainRightAxisTypeSetting),
      )
    }

    if (prev.rendererBackend !== next.rendererBackend) {
      void this.rendererHost.switchTo(next.rendererBackend as RendererBackend).then(() => {
        this.syncGpuSceneCanvas()
        this.scheduleDraw(UpdateLevel.All)
      })
      return
    }

    this.scheduleDraw()
  }

  /**
   * 绘制一帧
   * @param level 更新级别，决定渲染哪些层
   */
  draw(level: UpdateLevel = UpdateLevel.All) {
    this.renderer.draw(level)
  }

  // ========== Render State API (Vue SSOT) ==========

  /**
   * 应用渲染状态
   * kWidth/zoomLevel 写入 kernel；kGap 由 viewport 根据 kWidth+dpr+period 派生，禁止外部写入。
   * 当前 dataView 决定状态语义：分时写布局宽度，K 线/对比视图写缩放等级。
   * @param kGap 已废弃，保留签名兼容旧调用方
   */
  applyRenderState(kWidth: number, kGap: number, zoomLevel?: number): void {
    void kGap
    const dataView = this.kernel.mode.readonly.dataView.peek()
    if (!isTimeShareDataView(dataView) && zoomLevel === undefined) return

    const beforeLevel = this.kernel.zoom.readonly.zoomLevel.peek()
    const beforeWidth = this.kernel.zoom.readonly.kWidth.peek()

    if (isTimeShareDataView(dataView)) {
      this.kernel.zoom.actions.setTimeShareKWidth(kWidth)
      this.kernel.zoom.actions.setTimeShareSlotWidth(kWidth + kGap)
    } else if (zoomLevel !== undefined) {
      this.kernel.zoom.actions.setZoomLevel(zoomLevel)
    }

    if (
      beforeLevel === this.kernel.zoom.readonly.zoomLevel.peek() &&
      beforeWidth === this.kernel.zoom.readonly.kWidth.peek()
    ) {
      return
    }

    this.scheduleDraw()
  }

  /** 获取所有 PaneRenderer */
  getPaneRenderers(): PaneRenderer[] {
    return this.paneRenderers
  }

  /** 获取 ChartDom（供 InteractionController 使用） */
  getDom() {
    return this.dom
  }

  /** 获取当前 ChartOptions（返回内部当前快照） */
  getOption() {
    return {
      ...this.kernel.options.readonly.options.peek(),
      panes: this.kernel.pane.readonly.paneSpecs.peek(),
    }
  }

  /**
   * 更新配置并触发布局/重绘
   * @param partial 部分配置项
   */
  updateOptions(partial: Partial<ChartOptions>) {
    // 缩放参数由 zoomLevel 派生，不允许直接修改
    if (partial.kWidth !== undefined) {
      console.warn('[Chart] kWidth cannot be set directly. Use applyRenderState() instead.')
      delete partial.kWidth
    }
    if (partial.kGap !== undefined) {
      delete partial.kGap
    }

    if (partial.panes) {
      const nextPanes = partial.panes.map((pane) => ({ ...pane }))
      const { panes: _panes, ...optionPatch } = partial
      this.kernel.options.actions.patch(optionPatch)
      this.panes.importLayout(nextPanes)
      return
    }

    this.kernel.options.actions.patch(partial)
    this.resize()
  }

  /**
   * 平移价格轴（用于主图区域上下拖动）
   * @param paneId 目标 pane ID
   * @param deltaY Y轴像素偏移（正数向下拖动）
   */
  translatePrice(paneId: string, deltaY: number): void {
    const renderer = this.paneRenderers.find((r) => r.getPane().id === paneId)
    if (!renderer) return

    const pane = renderer.getPane()
    if (!pane.capabilities.supportsPriceTranslate) return

    const priceOffset = pane.yAxis.deltaYToPriceOffset(deltaY)
    const currentOffset = pane.yAxis.getPriceOffset()
    pane.yAxis.setPriceOffset(currentOffset + priceOffset)
    this.scheduleDraw()
  }

  /**
   * 重置价格轴垂直偏移
   * @param paneId 目标 pane ID
   */
  resetPriceOffset(paneId: string): void {
    const renderer = this.paneRenderers.find((r) => r.getPane().id === paneId)
    if (!renderer) return
    renderer.getPane().yAxis.resetPriceOffset()
    this.scheduleDraw()
  }

  resetPriceTransform(paneId: string): void {
    const renderer = this.paneRenderers.find((r) => r.getPane().id === paneId)
    if (!renderer) return
    renderer.getPane().yAxis.resetTransform()
    this.scheduleDraw()
  }

  /**
   * 缩放价格轴（用于右侧刻度栏上下拖动）
   * @param paneId 目标 pane ID
   * @param deltaY Y轴像素偏移（向上拖动放大，向下拖动缩小）
   */
  scalePrice(paneId: string, deltaY: number): void {
    const renderer = this.paneRenderers.find((r) => r.getPane().id === paneId)
    if (!renderer) return

    const pane = renderer.getPane()
    if (!pane.capabilities.supportsPriceTranslate) return

    pane.yAxis.scaleByDelta(deltaY)
    this.scheduleDraw()
  }
  /**
   * 更新数据并请求重绘
   * @param data K 线数据数组
   */
  updateData(data: KLineData[]) {
    this.dataManager.updateData(data)
  }

  /** 获取当前数据源（供 renderers 和 interaction 使用） */
  getData(): KLineData[] {
    return this.dataManager.getData()
  }

  /** 返回图表与 Agent 共用的实例级行情缓存。 */
  getMarketDataCache(): import('../data/buffer/marketDataCache').MarketDataCache {
    return this.dataManager.marketDataCache
  }

  /** 请求当前图表缓存覆盖指定左边界。 */
  ensureDataRange(startTs: number): void {
    this.dataManager.ensureDataRange(startTs)
  }

  /** 获取渲染数据源（分时图下为 TimeShareData，K线图为 KLineData） */
  getRenderData(): ReadonlyArray<KLineData | import('../foundation/types/price').TimeShareData> {
    return this.dataManager.getRenderData()
  }

  /** K线原始数据（分时模式下为空） */
  getInternalData(): KLineData[] {
    return this.dataManager.getInternalData()
  }

  /** 获取指标调度器（供外部控制器更新指标配置） */
  getIndicatorScheduler(): IndicatorScheduler {
    return this.indicatorManager.indicatorSchedulerAccessor
  }

  /** 获取预警控制器 */
  getAlertController(): AlertController {
    return this.alertController
  }

  /** 数据就绪时触发预警评估 */
  private evaluateAlerts(data: KLineData[], _range: VisibleRange): void {
    const latest = data[data.length - 1]
    if (!latest) return
    // 去重：同一根 K 线只评估一次（增量加载/Worker 重复回调时跳过）
    if (latest.timestamp === this._lastAlertTimestamp) return
    this._lastAlertTimestamp = latest.timestamp

    // 推进滚动量滑窗（仅在新 K 线到达时）
    let lookbacks = this._volumeLookbacks
    if (!lookbacks) {
      lookbacks = createVolumeLookbacks([5, 10, 20, 60])
      this._volumeLookbacks = lookbacks
    }
    pushToVolumeLookbacks(lookbacks, latest.volume ?? 0)

    const snapshot = this.buildMarketSnapshot(data)
    if (!snapshot) return
    const events = this.alertController.evaluate(snapshot, Date.now())
    if (events.length > 0) {
      console.log('[Alerts] fired:', events)
    }
  }

  /** 构建预警引擎所需的当前市场快照 */
  private buildMarketSnapshot(data: KLineData[]): MarketSnapshot | null {
    const latest = data[data.length - 1]
    if (!latest) return null

    if (latest.volume === undefined) return null

    const bar = {
      timestamp: latest.timestamp,
      open: latest.open,
      high: latest.high,
      low: latest.low,
      close: latest.close,
      volume: latest.volume,
    }

    const indicators: Record<string, number> = {}
    const scheduler = this.getIndicatorScheduler()
    const indicatorStateReader = scheduler.createRenderStateReader()
    for (const meta of scheduler.getAllIndicators()) {
      const paneId = meta.defaultPaneId === 'main' ? 'main' : meta.defaultPaneId
      const stateKey = resolveStateKey(meta.stateKey, paneId)
      const state = indicatorStateReader.get<any>(stateKey)
      if (!state?.series) continue
      const series = state.series
      if (Array.isArray(series)) {
        const val = series[series.length - 1]
        if (typeof val === 'number' && Number.isFinite(val)) {
          indicators[meta.name] = val
        }
      } else if (typeof series === 'object') {
        const keys = Object.keys(series)
        if (keys.length > 0) {
          const lastKey = keys[keys.length - 1]!
          const arr = series[lastKey]
          if (Array.isArray(arr)) {
            const val = arr[arr.length - 1]
            if (typeof val === 'number' && Number.isFinite(val)) {
              indicators[meta.name] = val
            }
          }
        }
      }
    }

    // 只读滚动量（由 evaluateAlerts 推进滑窗）
    const rollingVolume: Record<number, number> = {}
    if (this._volumeLookbacks) {
      for (const [size, calc] of this._volumeLookbacks) {
        rollingVolume[size] = calc.mean
      }
    }

    return {
      bar,
      indicators,
      rollingVolume,
      volumeProfile: undefined,
      orderBook: undefined,
      footprint: undefined,
    }
  }

  getLogicalSlotCount(): number {
    return this.dataManager.getLogicalSlotCount()
  }

  getTimestampAtLogicalIndex(index: number): number | null {
    return this.dataManager.getTimestampAtLogicalIndex(index)
  }

  /** 通过活动数据序列解析时间戳的当前逻辑索引。 */
  getLogicalIndexAtTimestamp(timestamp: number): number | null {
    return this.dataManager.getLogicalIndexAtTimestamp(timestamp)
  }

  /** 根据视口内 X 坐标反查逻辑索引（允许超出最后一根 K 线） */
  getLogicalIndexAtX(mouseX: number): number | null {
    return this.interaction.getLogicalIndexAtScreenX(mouseX)
  }

  /** 根据本帧已封存的中心点读取逻辑索引对应的视口内 X 坐标。 */
  getScreenXAtLogicalIndex(index: number): number | null {
    return this.interaction.getScreenXAtLogicalIndex(index)
  }

  /** 获取内容总宽度（用于外部 scroll-content 撑开 scrollWidth） */
  getContentWidth(): number {
    return this.kernel.viewport.readonly.contentWidth.peek()
  }

  /** 获取左侧加载缓冲宽度（视口宽度，用于计算 overlay 像素偏移） */
  getLeftLoadBufferWidth(): number {
    return this.kernel.viewport.readonly.leftLoadBufferWidth.peek()
  }

  /** 滚动到最右侧（最新数据位置） */
  scrollToRight(): void {
    this.dataManager.scrollToRight()
  }

  /** 容器尺寸变化时调用 */
  resize() {
    if (this.activeMode === this._timeShareMode) {
      const tsData = this.dataManager.getTimeShareData()
      const vp = this.getViewport()
      if (!vp || vp.plotWidth <= 0) return
      if (tsData.length > 0 && this.kernel.zoom.readonly.timeShareSlotWidth.peek() === null) {
        const result = this.activeMode.computeKWidth(tsData.length, vp.plotWidth, vp.dpr)
        if (result) {
          this.applyRenderState(result.kWidth, result.kGap)
          const leftBuffer = this.getLeftLoadBufferWidth()
          this.kernel.viewport.actions.scrollTo(leftBuffer)
        }
      }
      this.renderer.clearCachedFrame()
      this.layoutManager.layoutPanes()
      this.scheduleDraw()
      return
    }
    const vp = this.getViewport()
    // 防御性检查：容器尺寸无效时跳过布局
    if (!vp || vp.viewWidth < 10 || vp.viewHeight < 10) {
      return
    }
    this.renderer.clearCachedFrame()
    this.layoutManager.layoutPanes()
    this.scheduleDraw()
  }

  /**
   * 请求下一帧重绘（RAF 合并，支持分层更新）
   * @param level 更新级别，默认为 All
   */
  scheduleDraw(level: UpdateLevel = UpdateLevel.All): void {
    // 正在批量安装/卸载 renderer（pane 重排、指标切换、子图增删），等全部完成再 flush
    if (this.runtimeProjectionDepth > 0) {
      this.pendingProjectionLevel = this.pendingProjectionLevel
        ? mergeUpdateLevel(this.pendingProjectionLevel, level)
        : level
      return
    }
    this.renderer.scheduleDraw(level)
  }

  /** 在 RendererPluginManager 事务内执行 run，推迟期间的所有 scheduleDraw 到最外层统一 flush */
  private runRuntimeProjection(run: () => void): void {
    this.runtimeProjectionDepth++
    try {
      this.rendererPluginManager.transaction(run)
    } finally {
      this.runtimeProjectionDepth--
      if (this.runtimeProjectionDepth === 0 && this.pendingProjectionLevel !== null) {
        const level = this.pendingProjectionLevel
        this.pendingProjectionLevel = null
        this.renderer?.scheduleDraw(level)
      }
    }
  }

  /** 当活跃渲染器列表变化时，仅对发生变化的图层执行显示或隐藏操作，而不是每帧重建所有图层状态 */
  private installActiveRendererProjection(): void {
    let previousLayerIds = new Set<string>()
    this.disposeActiveRendererProjection = effect(() => {
      // 应显示的活跃图层
      const desiredLayerIds = new Set(
        this.kernel.activeRenderers$().map((descriptor) => descriptor.layerId),
      )
      // 视图切换时投影一次可见指标，图例逐帧仅消费该快照，不重复判断 dataViews。
      this.updateRendererConfig('mainIndicatorLegend', {
        visibleIndicatorIds: this.kernel.visibleMainIndicatorIds$(),
      })
      const scene = this.renderer?.getScene()
      let changed = false

      for (const layerId of new Set([...previousLayerIds, ...desiredLayerIds])) {
        const visible = desiredLayerIds.has(layerId)
        const layer = scene?.getLayer(layerId)
        if (layer && layer.visible !== visible) {
          scene!.setLayerVisibility(layerId, visible)
          changed = true
        }
      }
      previousLayerIds = desiredLayerIds
      if (changed) this.scheduleDraw()
    })
  }

  /**
   * M2：将 WebGPU canvas 挂到 plot 区（main 与 overlay 之间），非 webgpu 时移除。
   * 多 pane 共用一张 canvas，region.y + scissor 区分。
   */
  private syncGpuSceneCanvas(): void {
    const layer = this.dom.canvasLayer
    if (!layer) return
    const effective = this.rendererHost.runtime.effective
    const existing = layer.querySelector('canvas.gpu-scene-canvas') as HTMLCanvasElement | null

    if (effective !== 'webgpu') {
      existing?.remove()
      return
    }

    const surface = this.rendererHost.renderer.surface as { canvas?: HTMLCanvasElement }
    const canvas = surface.canvas
    if (!canvas) return

    canvas.classList.add('gpu-scene-canvas')
    canvas.style.position = 'absolute'
    canvas.style.left = '0'
    canvas.style.top = '0'
    canvas.style.pointerEvents = 'none'
    canvas.style.zIndex = '1'
    canvas.style.backgroundColor = 'transparent'

    if (existing !== canvas) {
      existing?.remove()
      if (!canvas.isConnected) layer.appendChild(canvas)
    }
  }

  /** 销毁图表实例 */
  async destroy() {
    this.workspacePersistence?.dispose()
    this.workspacePersistence = null
    this.disposeActiveRendererProjection?.()
    this.disposeActiveRendererProjection = null
    this.indicatorManager.destroy()
    // onUninstall 由 Manager 单点负责；须在 scene.dispose 之前 clear
    this.rendererPluginManager.clear()
    this.renderer.destroy()
    this.dataManager.destroy()
    this.viewportManager.destroy()
    this.layoutManager.destroy()
    this.dom.canvasLayer?.querySelector('canvas.gpu-scene-canvas')?.remove()
    this.rendererHost.dispose()
    this.kernel.dispose()
    this.alertController.dispose()
    await this.pluginHost.destroy()
  }

  // ==================== Facade API (High-level interface for adapters) ====================

  /** interactionSnapshot lazy computed for the createChartController facade */
  private get _interactionSnapshot(): Computed<InteractionSnapshot> {
    if (!this.__interactionSnapshot) {
      this.__interactionSnapshot = computed(() =>
        this.kernel.interaction.readonly.interactionSnapshot(),
      )
    }
    return this.__interactionSnapshot
  }
  private __interactionSnapshot: Computed<InteractionSnapshot> | null = null

  /** 视口状态信号 */
  get viewport(): ReadonlySignal<ViewportState> {
    return this.kernel.viewport.readonly.viewportState
  }

  /** 数据信号 */
  get data(): ReadonlySignal<ReadonlyArray<KLineData>> {
    return this.dataManager.data
  }

  /** 加载信号 */
  get loading(): ReadonlySignal<boolean> {
    return this.dataManager.loading
  }

  /** 主品种最近一次显式拉取失败原因 */
  get dataError(): ReadonlySignal<string | null> {
    return this.dataManager.dataError
  }

  /** 符号信号 */
  get symbols(): ReadonlySignal<ReadonlyArray<SymbolSpec>> {
    return this.dataManager.symbols
  }

  /** 可用品种目录信号 — 供 UI 品种选择器消费 */
  get symbolCatalog(): ReadonlySignal<ReadonlyArray<SymbolInfo>> {
    return this.dataManager.symbolCatalog
  }

  /** 注册品种到可用目录 */
  registerSymbols(infos: ReadonlyArray<SymbolInfo>): void {
    this.dataManager.registerSymbols(infos)
  }

  /** 比较商品颜色信号 */
  get comparisonColors(): ReadonlySignal<ReadonlyMap<string, string>> {
    return this.kernel.comparison.readonly.colors
  }

  /** 比较商品加载信号 */
  get comparisonLoading(): ReadonlySignal<boolean> {
    return this.kernel.comparison.readonly.loading
  }

  /** 注册/注销绘图交互会话，使 setDrawingTool 能清会话副作用 */
  registerDrawingSession(session: DrawingInteractionController | null): void {
    this.drawingSession = session
    if (session) {
      session.applyToolSession(this.kernel.drawing.readonly.drawingTool.peek())
    }
  }

  /** 面板比例信号 */
  get paneRatios(): ReadonlySignal<Readonly<Record<string, number>>> {
    return this.kernel.pane.readonly.paneRatios
  }

  get paneLayout(): ReadonlySignal<ReadonlyArray<PaneSpec>> {
    return this.kernel.pane.readonly.paneSpecs
  }

  /** 交互状态信号 */
  get interactionState(): ReadonlySignal<InteractionSnapshot> {
    return this._interactionSnapshot
  }

  /** 区间选择工具确认的时间范围。 */
  get selectedRange(): ReadonlySignal<{ from: number; to: number } | null> {
    return this.kernel.interaction.readonly.selectedRange
  }

  /** 区间选择工具的完整权威状态。 */
  get rangeSelection(): ReadonlySignal<RangeSelectionState> {
    return this.kernel.interaction.readonly.rangeSelection
  }

  /** 开始区间选择。 */
  startRangeSelection(timestamp: number): void {
    this.kernel.interaction.actions.startRangeSelection(timestamp)
  }

  /** 更新区间选择终点。 */
  updateRangeSelection(timestamp: number): void {
    this.kernel.interaction.actions.updateRangeSelection(timestamp)
  }

  /** 结束区间选择。 */
  finishRangeSelection(timestamp?: number): void {
    this.kernel.interaction.actions.finishRangeSelection(timestamp)
  }

  /** 原子设置已确认的区间边界。 */
  setRangeSelection(startTimestamp: number, endTimestamp: number): void {
    this.kernel.interaction.actions.setRangeSelection(startTimestamp, endTimestamp)
  }

  /** 清除区间选择。 */
  clearRangeSelection(): void {
    this.kernel.interaction.actions.clearRangeSelection()
  }

  /** 主图左上角图例模板上下文（null 表示无数据） */
  get legendTemplateContext(): ReadonlySignal<LegendTemplateContext | null> {
    return this._legendTemplateContext
  }

  // ---------- Data ----------

  setData(data: KLineData[]): void {
    this.dataManager.setData(data)
  }

  appendData(newData: KLineData[]): void {
    this.dataManager.appendData(newData)
  }

  get dataBuffer(): import('../data/buffer/dataBuffer').DataBuffer {
    return this.dataManager.dataBuffer as import('../data/buffer/dataBuffer').DataBuffer
  }

  checkVisibleRangeGap(): void {
    this.dataManager.checkVisibleRangeGap()
  }

  setSymbols(specs: ReadonlyArray<SymbolSpec>): void {
    const sessions = specs.map((spec) => resolveSymbolMarketSession(spec, this.marketSessions))
    const primaryPeriod = specs[0]?.period
    if (isTimeSharePeriod(primaryPeriod)) {
      this._timeShareMode.setMarketSession(sessions[0]!)
    }

    // 品种/周期切换时重置最新 K 线时间戳，确保新数据触发预警
    this._lastAlertTimestamp = null
    const isComparison = !isTimeSharePeriod(primaryPeriod) && specs.length > 1
    if (primaryPeriod) {
      // ⚠️ setActiveMode 必须在 dataManager.setSymbols 之前调用，
      //    以确保 kWidth/kGap（从 zoom level 恢复）先写入 _optionsSignal，
      //    后续 scrollLeft 恢复才能正确反推物理像素偏移。
      this.setActiveMode(
        isTimeSharePeriod(primaryPeriod) ? this._timeShareMode : this._kLineMode,
        primaryPeriod === FIVE_DAY_TIME_SHARE_PERIOD ? ChartDataViewId.FiveDayTimeShare : undefined,
      )
    }
    this.dataManager.setSymbols(specs)
    if (isComparison) {
      this.kernel.actions.setDataView(ChartDataViewId.Comparison)
      this.applyComparisonScaleType(true)
    } else {
      this.applyComparisonScaleType(false)
    }
    // Scroll position 恢复必须放在 setActiveMode + setSymbols 之后，
    // 此时 kWidth/kGap 已由 zoom level 恢复写回，计算不出错。
    if (primaryPeriod && !isTimeSharePeriod(primaryPeriod)) {
      this.dataManager.tryRestoreScrollFromSnapshot()
    }
  }

  addComparisonSymbol(spec: SymbolSpec): void {
    resolveSymbolMarketSession(spec, this.marketSessions)
    const hadComparisons = this.dataManager.getComparisonSpecs().length > 0
    this.dataManager.addComparisonSymbol(spec)
    if (!hadComparisons && this.dataManager.getComparisonSpecs().length > 0) {
      this.setActiveMode(this._kLineMode)
      this.kernel.actions.setDataView(ChartDataViewId.Comparison)
      this.applyComparisonScaleType(true)
    }
  }

  removeComparisonSymbol(symbol: string): void {
    this.dataManager.removeComparisonSymbol(symbol)
    if (this.dataManager.getComparisonSpecs().length === 0) {
      this.applyComparisonScaleType(false)
      this.setActiveMode(this._kLineMode)
    }
  }

  setComparisonData(symbol: string, data: KLineData[]): void {
    this.dataManager.setComparisonData(symbol, data)
  }

  setCurrentSymbol(symbol: string): void {
    this.dataManager.setCurrentSymbol(symbol)
  }

  private configureCurrentTimeShareSession(): void {
    const primary = this.dataManager.symbols.peek()[0]
    if (!primary) return
    this._timeShareMode.setMarketSession(resolveSymbolMarketSession(primary, this.marketSessions))
  }

  private configureModeForSpec(spec: SymbolSpec): void {
    const session = resolveSymbolMarketSession(spec, this.marketSessions)
    const isTimeShare = isTimeSharePeriod(spec.period)
    if (isTimeShare) this._timeShareMode.setMarketSession(session)
    this.setActiveMode(
      isTimeShare ? this._timeShareMode : this._kLineMode,
      spec.period === FIVE_DAY_TIME_SHARE_PERIOD ? ChartDataViewId.FiveDayTimeShare : undefined,
    )
  }

  setCurrentPeriod(period: string): void {
    if (isTimeSharePeriod(period)) this.configureCurrentTimeShareSession()
    this.setActiveMode(
      isTimeSharePeriod(period) ? this._timeShareMode : this._kLineMode,
      period === FIVE_DAY_TIME_SHARE_PERIOD ? ChartDataViewId.FiveDayTimeShare : undefined,
    )
    this.dataManager.setCurrentPeriod(period)
    if (!isTimeSharePeriod(period)) this.dataManager.tryRestoreScrollFromSnapshot()
    if (!isTimeSharePeriod(period) && this.dataManager.getComparisonSpecs().length > 0) {
      this.kernel.actions.setDataView(ChartDataViewId.Comparison)
      this.applyComparisonScaleType(true)
    }
    this.kernel?.mode.actions.setLastBarPeriod(period)
  }

  switchToTimeShareForDate(dateYYYYMMDD: number): void {
    this.configureCurrentTimeShareSession()
    this.dataManager.setTimeShareQueryDate(dateYYYYMMDD)
    this.setActiveMode(this._timeShareMode)
    this.dataManager.setCurrentPeriod(TIME_SHARE_PERIOD)
  }

  applyCustomData(source: CustomDataSource): void {
    this.configureModeForSpec({
      symbol: source.symbol ?? '',
      market: source.market,
      period: source.period ?? 'daily',
    })
    this.dataManager.applyCustomData(source)
  }

  resetToFetcher(spec: SymbolSpec): void {
    this.configureModeForSpec(spec)
    this.dataManager.resetToFetcher(spec)
  }

  // ---------- Interaction (Zero-config unified entry) ----------

  /**
   * 统一指针事件处理（零配置）
   * 自动判断区域并分发给 interaction controller
   *
   * @param e 指针事件
   * @param drawingController 可选的绘图控制器，如果提供，会优先让绘图控制器处理事件
   * @returns 是否被处理（如果 drawingController 处理了返回 true，否则返回 false）
   */
  handlePointerEvent(
    e: PointerEvent,
    drawingController?: {
      onPointerDown?: (e: PointerEvent, container: HTMLElement) => boolean
      onPointerMove?: (e: PointerEvent, container: HTMLElement) => boolean
      onPointerUp?: (e: PointerEvent, container: HTMLElement) => boolean
    },
  ): boolean {
    // 判断事件目标是否在右轴区域
    const isRightAxis = this.dom.rightAxisLayer.contains(e.target as Node)

    switch (e.type) {
      case 'pointerdown':
        // 优先让绘图控制器处理
        if (drawingController?.onPointerDown) {
          const handled = drawingController.onPointerDown(e, this.dom.container)
          if (handled) return true
        }
        if (isRightAxis) {
          this.interaction.onRightAxisPointerDown(e)
        } else {
          this.interaction.onPointerDown(e)
        }
        return false
      case 'pointermove':
        // 优先让绘图控制器处理
        if (drawingController?.onPointerMove) {
          const handled = drawingController.onPointerMove(e, this.dom.container)
          if (handled) return true
        }
        if (isRightAxis) {
          this.interaction.onRightAxisPointerMove(e)
        } else {
          this.interaction.onPointerMove(e)
        }
        return false
      case 'pointerup':
        // 优先让绘图控制器处理
        if (drawingController?.onPointerUp) {
          const handled = drawingController.onPointerUp(e, this.dom.container)
          if (handled) return true
        }
        if (isRightAxis) {
          this.interaction.onRightAxisPointerUp(e)
        } else {
          this.interaction.onPointerUp(e)
        }
        return false
      case 'pointerleave':
        // pointerleave 通常不用于绘图，直接交给 interaction
        if (isRightAxis) {
          this.interaction.onRightAxisPointerLeave(e)
        } else {
          this.interaction.onPointerLeave(e)
        }
        return false
      default:
        return false
    }
  }

  /**
   * 滚轮事件处理（高层 API）
   * 使用 computeZoom 计算精确的 scrollLeft，更新 viewport signal
   */
  handleWheelEvent(e: WheelEvent): void {
    if (!this.kernel.mode.readonly.interactionCapabilities.peek().allowZoom) return
    const rect = this.dom.container.getBoundingClientRect()
    this.zoomController.handleWheel(e.deltaY, e.clientX - rect.left)
  }

  /**
   * 滚动事件处理（高层 API）
   * 更新缓存的 scrollLeft 并触发交互 controller
   */
  handleScrollEvent(): void {
    this.interaction.onScroll({
      scheduleDraw: !this.indicatorManager.indicatorSchedulerAccessor.busySignal.peek(),
    })
    // viewportState is now computed() — auto-updates when scrollLeft or
    // visibleRange change. No manual signal push needed anymore.
  }

  /**
   * 双指捏合缩放处理（高层 API）
   * @param delta 缩放增量（+1 放大 / -1 缩小）
   * @param centerClientX 捏合中心在视口中的 X 坐标
   */
  handlePinchZoom(delta: number, centerClientX: number): void {
    if (!this.kernel.mode.readonly.interactionCapabilities.peek().allowZoom) return
    this.zoomController.handlePinch(delta, centerClientX)
  }

  // ---------- Settings ----------

  /**
   * 更新设置（高层 API）
   * 代理到现有的 updateSettings
   */
  updateSettingsFacade(settings: Record<string, unknown>): void {
    this.updateSettings(settings as ChartSettings)
  }

  /**
   * 更新选项（高层 API）
   * 代理到现有的 updateOptions
   */
  updateOptionsFacade(options: Partial<ChartOptions>): void {
    this.updateOptions(options)
  }

  // ---------- Lifecycle hooks ----------

  /**
   * 销毁图表实例
   */
}
