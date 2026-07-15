import { createAlertController } from '../features/alerts/index'
import {
  createVolumeLookbacks,
  pushToVolumeLookbacks,
  type VolumeLookbacks,
} from '../features/alerts/rollingVolume'
import {
  createPluginHost,
  GLOBAL_PANE_ID,
  RendererPluginManager,
  wrapPaneInfo,
  type PluginHostImpl,
  type RendererPlugin,
  type RendererPluginWithHost,
} from '../foundation/plugin/index'
import { createLayerFromPlugin } from '../rendering/scene/createLayerFromPlugin'
import {
  computed,
  type Computed,
  type ReadonlySignal,
  type Signal,
} from '../foundation/reactivity/signal'

import { InteractionController, type InteractionSnapshot } from './controller/interaction'

import type { ChartSettings } from '../foundation/config/chartSettings'
import type { KLineData } from '../foundation/types/price'

import type { IndicatorScheduler } from './indicators/scheduler'
import type { CustomMarkerEntity, MarkerManager } from './marker/registry'
import type { ChartModeHandler } from './modes/types'
import type { SubIndicatorType } from './renderers/Indicator'
import type { SubPaneEntry } from './subPaneManager'
import type { ScaleType } from './utils/tickPosition'

// ===== 普通 imports，按路径字母排序 =====
import { ChartDataManager } from './data/chartDataManager'
import { ChartIndicatorManager } from './indicators/chartIndicatorManager'
import { resolveStateKey } from './indicators/indicatorMetadata'
import { ChartPaneLayout } from './layout/chartPaneLayout'
import { UpdateLevel, type VisibleRange } from './layout/pane'
import { KLineMode } from './modes/kLineMode'
import { TimeShareMode } from './modes/timeShareMode'
import { PaneRenderer } from './paneRenderer'
import { ChartRenderer } from './render/chartRenderer'
import { SharedWebGLSurface } from './renderers/webgl/sharedWebGLSurface'
import { ChartStateKernel } from './state/chartStateKernel'
import { ChartViewportManager } from './viewport/chartViewportManager'
import { getVisibleRange } from './viewport/viewport'
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
import type { SymbolSpec, SymbolInfo, CustomDataSource } from '../controllers/types'
import type { AlertController, MarketSnapshot } from '../features/alerts/types'

export type { InteractionSnapshot }

// ===== 重新导出 =====
export { getPhysicalKLineConfig }
export type {
  ChartDom,
  ChartOptions,
  DrawingObject,
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

  /** Chart 级共享 WebGL canvas/context */
  private sharedWebGLSurface: SharedWebGLSurface

  /** 缩放控制器 */
  private zoomController: ChartZoomController

  /** 指标管理器 */
  private indicatorManager: ChartIndicatorManager

  /** 渲染器 */
  private renderer: ChartRenderer
  private runtimeProjectionDepth = 0
  private runtimeProjectionDrawPending = false

  /** 绘图交互会话（锚点/预览/拖拽）；工具 id 在 kernel */
  private drawingSession: DrawingInteractionController | null = null

  /** 当前活跃的模式处理器 */
  private _activeMode: ChartModeHandler
  private _kLineMode = new KLineMode()
  private _timeShareMode = new TimeShareMode()

  /** 进入分时模式时保存的快照，退出时恢复（包含 zoom/scale/indicators） */
  private _savedTimeShareState: {
    zoomLevel: number
    scaleTypes: Map<string, ScaleType>
    mainIndicators: Array<{ id: string; params: Record<string, number | boolean | string> }>
    subPanes: Array<{ id: string; params: Record<string, unknown> }>
  } | null = null

  /** 上次预警评估的最新 K 线时间戳（用于去重） */
  private _lastAlertTimestamp: number | null = null

  /** 预警控制器 */
  readonly alertController: AlertController

  /** 滚动成交量窗口（惰性初始化） */
  private _volumeLookbacks: VolumeLookbacks | null = null

  /**
   * 启用主图指标
   * @param indicatorId 指标ID
   * @param params 可选的指标参数
   * @returns 是否成功启用
   */
  enableMainIndicator(
    indicatorId: string,
    params?: Record<string, number | boolean | string>,
  ): boolean {
    return this.indicatorManager.enableMainIndicator(indicatorId, params)
  }

  disableMainIndicator(indicatorId: string): boolean {
    return this.indicatorManager.disableMainIndicator(indicatorId)
  }

  toggleMainIndicator(indicatorId: string, enabled: boolean): void {
    this.indicatorManager.toggleMainIndicator(indicatorId, enabled)
  }

  getActiveMainIndicators(): string[] {
    return this.indicatorManager.getActiveMainIndicators()
  }

  isMainIndicatorActive(indicatorId: string): boolean {
    return this.indicatorManager.isMainIndicatorActive(indicatorId)
  }

  updateMainIndicatorParams(
    indicatorId: string,
    params: Record<string, number | boolean | string>,
  ): void {
    this.indicatorManager.updateMainIndicatorParams(indicatorId, params)
  }

  getMainIndicatorParams(indicatorId: string): Record<string, number | boolean | string> | null {
    return this.indicatorManager.getMainIndicatorParams(indicatorId)
  }

  clearMainIndicators(): void {
    this.indicatorManager.clearMainIndicators()
  }

  /**
   * @deprecated 使用 enableMainIndicator/disableMainIndicator 替代
   */
  setActiveMainIndicators(indicators: string[]): void {
    this.indicatorManager.setActiveMainIndicators(indicators)
  }

  /**
   * 创建图表实例
   * @param dom 由 Vue 组件传入的 DOM 句柄
   * @param opt 初始配置
   */
  constructor(dom: ChartDom, opt: ChartOptions) {
    this.dom = dom
    const { kWidth: _kWidth, kGap: _kGap, ...restOpt } = opt
    this._activeMode = this._kLineMode
    this.pluginHost = createPluginHost()
    this.rendererPluginManager = new RendererPluginManager()
    this.sharedWebGLSurface = new SharedWebGLSurface()

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
      scheduleDraw: (level) => this.scheduleDraw(level as UpdateLevel | undefined),
    })

    // Inject DOM deps into kernel's viewportState (needed before init)
    this.kernel.setViewportDomDeps({
      getDom: () => this.dom,
      resizeSharedWebGLSurface: (plotWidth, plotHeight, dpr) =>
        this.sharedWebGLSurface.resize(plotWidth, plotHeight, dpr),
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
      getViewport: () => this.viewportManager.getViewport(),
      getSharedWebGLSurface: () => this.sharedWebGLSurface,
      setKnownPaneIds: (ids) => this.rendererPluginManager.setKnownPaneIds(ids),
      notifyPaneResize: (paneId, pane) =>
        this.rendererPluginManager.notifyResize(paneId, wrapPaneInfo(pane)),
      scheduleDraw: (level) => this.scheduleDraw(level),
      getPaneRatios: () => this.kernel.pane.readonly.paneRatios.peek(),
      getPaneScaleTypes: () => this.kernel.pane.readonly.paneScaleTypes.peek(),
      commitLayout: (ratios, specs) => {
        this.kernel.pane.actions.commitLayout(ratios, specs)
        this.ensurePaneScaleTypesFromSettings()
      },
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
        getEffectiveDpr: () => this.viewportManager.getEffectiveDpr(),
        getLogicalScrollLeft: () => this.viewportManager.getLogicalScrollLeft(),
        getCachedScrollLeft: () => this.viewportManager.getCachedScrollLeft(),
        setScrollLeft: (v) => {
          this.viewportManager.setScrollLeft(v)
        },
        getDom: () => this.dom,
        getObservedSize: () => this.viewportManager.getObservedSize(),
        getViewport: () => this.viewportManager.getViewport(),
        getVisibleRange: () => {
          const vp = this.viewportManager.computeViewport()
          if (!vp) return null
          const dataLen = this.dataManager?.getData().length ?? 0
          if (dataLen === 0) return null
          return getVisibleRange(
            vp.scrollLeft,
            vp.plotWidth,
            this.kernel.zoom.readonly.kWidth(),
            this.kernel.viewport.readonly.kGap(),
            dataLen,
            vp.dpr,
          )
        },
        getLeftLoadBufferWidth: () => this.kernel.viewport.readonly.leftLoadBufferWidth.peek(),
        getContentWidth: () => this.kernel.viewport.readonly.contentWidth.peek(),
        scheduleDraw: (level) => this.scheduleDraw(level),
        resetInteraction: () => this.interaction.reset(),
        getIndicatorScheduler: () => this.indicatorManager.indicatorSchedulerAccessor,
        isPointerDown: () => this.interaction.isPointerDown(),
        onTimeShareDataReady: (dataLength) => {
          const vp = this.viewportManager.computeViewport()
          if (!vp || vp.plotWidth <= 0) return
          const result = this._activeMode.computeKWidth(dataLength, vp.plotWidth, vp.dpr)
          if (result) {
            this.applyRenderState(result.kWidth, result.kGap)
            const leftBuffer = this.getLeftLoadBufferWidth()
            this.viewportManager.setScrollLeft(leftBuffer)
          }
        },
        onDataProcessed: (data, range) => this.evaluateAlerts(data, range),
        setSymbols: (symbols) => this.kernel.actions.setSymbols(symbols),
        setComparisonLoading: (loading) => this.kernel.comparison.actions.setLoading(loading),
        comparisonSpecs$: this.kernel.comparison.readonly.specs,
        comparisonColors$: this.kernel.comparison.readonly.colors,
        comparisonLoading$: this.kernel.comparison.readonly.loading,
      },
      this.kernel.data,
      this.kernel.dataManager,
    )

    this.zoomController = new ChartZoomController(
      {
        getLogicalScrollLeft: () => this.viewportManager.getLogicalScrollLeft(),
        getCurrentDpr: () => this.viewportManager.getEffectiveDpr(),
        getClientWidth: () =>
          this.viewportManager.getViewport()?.viewWidth ?? this.dom.container?.clientWidth ?? 0,
        getDataLength: () => this.dataManager.getData().length,
        getPlotWidth: () => this.getLeftLoadBufferWidth(),
        setScrollLeft: (v) => {
          this.viewportManager.setScrollLeft(v)
        },
        onChange: () => {
          this.scheduleDraw()
        },
        getMinKWidth: () => this.kernel.options.readonly.options.peek().minKWidth,
        getMaxKWidth: () => this.kernel.options.readonly.options.peek().maxKWidth,
        getPeriod: () => this.kernel.dataManager.readonly.currentPeriod.peek(),
        zoomLevelCount,
      },
      this.kernel.zoom,
    )

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
      setRendererEnabled: (name, enabled) => this.setRendererEnabled(name, enabled),
      getPaneRatiosSignal: () =>
        this.kernel.pane.readonly.paneRatios as ReadonlySignal<Readonly<Record<string, number>>>,
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
      getRenderContext: (paneId) => this.renderer?.getPaneCtxMap()?.get(paneId) ?? null,
      addLayer: (layer) => this.renderer?.getScene()?.addLayer(layer),
      removeLayer: (id) => this.renderer?.getScene()?.removeLayer(id) ?? false,
      getLayer: (id) => this.renderer?.getScene()?.getLayer(id) ?? null,
      setLayerVisibility: (id, visible) =>
        this.renderer?.getScene()?.setLayerVisibility(id, visible),
      getRightAxisWidth: () => this.kernel.options.readonly.options.peek().rightAxisWidth,
      getPriceLabelWidth: () => this.kernel.options.readonly.options.peek().priceLabelWidth ?? 60,
      getYPaddingPx: () => this.kernel.options.readonly.options.peek().yPaddingPx,
      mainIndicators$: this.kernel.indicator.readonly.mainIndicators,
      upsertMainIndicator: (id, params) => this.kernel.indicator.actions.upsert(id, params),
      removeMainIndicator: (id) => this.kernel.indicator.actions.remove(id),
      setMainIndicatorParams: (id, params) => this.kernel.indicator.actions.setParams(id, params),
      replaceMainIndicators: (entries) => this.kernel.indicator.actions.replaceAll(entries),
      clearMainIndicators: () => this.kernel.indicator.actions.clear(),
      subPanes$: this.kernel.subPane.readonly.entries,
      createSubPaneState: (paneId, indicatorId, params) =>
        this.kernel.actions.createSubPane(paneId, indicatorId, params),
      removeSubPaneState: (paneId) => this.kernel.actions.removeSubPane(paneId),
      replaceSubPaneState: (paneId, indicatorId, params) =>
        this.kernel.actions.replaceSubPane(paneId, indicatorId, params),
      updateSubPaneStateParams: (paneId, params) =>
        this.kernel.actions.updateSubPaneParams(paneId, params),
      clearSubPaneState: () => this.kernel.actions.clearSubPanes(),
      runRendererTransaction: (run) => this.runRuntimeProjection(run),
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

    // 初始化渲染器
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
      getSharedWebGLSurface: () => this.sharedWebGLSurface,
      getPluginHost: () => this.pluginHost,
      getRendererPluginManager: () => this.rendererPluginManager,
      getTheme: () => this.kernel.effectiveTheme$.peek(),
      getCurrentZoomLevel: () => this.kernel.zoom.readonly.zoomLevel.peek(),
      getZoomLevelCount: () => this.kernel.options.readonly.options.peek().zoomLevelCount,
      getViewportManager: () => this.viewportManager,
      getDataManager: () => this.dataManager,
      getIndicatorManager: () => this.indicatorManager,
      getActiveMode: () => this._activeMode,
      settings$: this.kernel.settings.readonly.settings,
      customMarkers$: this.kernel.marker.readonly.customMarkers,
      drawings$: this.kernel.drawing.readonly.drawings,
      selectedDrawingId$: this.kernel.drawing.readonly.selectedDrawingId,
    })
    this.renderer.registerDrawingPlugins()
    this.renderer.initCoreRenderers()
    this.viewportManager.init()
    this.ensurePaneScaleTypesFromSettings()
  }

  getViewport(): Viewport | null {
    return this.viewportManager.getViewport()
  }

  /** 获取当前活跃的模式处理器 */
  get activeMode(): ChartModeHandler {
    return this._activeMode
  }

  /** 切换模式处理器 */
  setActiveMode(mode: ChartModeHandler): void {
    if (this._activeMode === mode) return
    const prev = this._activeMode

    if (mode === this._timeShareMode) {
      this._savedTimeShareState = {
        zoomLevel: this.kernel.zoom.readonly.zoomLevel.peek(),
        scaleTypes: new Map(this.kernel.pane.readonly.paneScaleTypes.peek()),
        mainIndicators: [],
        subPanes: [],
      }
      for (const [id, entry] of this.kernel.indicator.readonly.mainIndicators.peek()) {
        this._savedTimeShareState.mainIndicators.push({ id, params: { ...entry.params } })
      }
      this._savedTimeShareState.subPanes = this.indicatorManager.getSubPaneEntries().map((e) => ({
        id: e.indicatorId,
        params: { ...e.params },
      }))
      // 分时强制 percent 进 kernel，再投影（不再由 updatePaneRange 每帧旁路写）
      const percentMap = new Map<string, ScaleType>()
      for (const r of this.paneRenderers) {
        percentMap.set(r.getPane().id, 'percent')
      }
      this.kernel.pane.actions.replacePaneScaleTypes(percentMap)
      this.projectPaneScaleTypes()
    } else if (prev === this._timeShareMode) {
      const savedTypes = this._savedTimeShareState?.scaleTypes ?? new Map<string, ScaleType>()
      this.kernel.pane.actions.replacePaneScaleTypes(savedTypes)
      this.projectPaneScaleTypes()
      for (const renderer of this.paneRenderers) {
        renderer.getPane().yAxis.setBasePrice(null)
      }
    }

    if (this._savedTimeShareState && mode !== this._timeShareMode) {
      this.kernel.zoom.actions.setZoomLevel(this._savedTimeShareState.zoomLevel)
    }

    prev.onDeactivate(
      {
        enableMainIndicator: (id, p) => this.enableMainIndicator(id, p),
        disableMainIndicator: (id) => this.disableMainIndicator(id),
        setRendererEnabled: (n, e) => this.setRendererEnabled(n, e),
        dataManager: this.dataManager,
      },
      mode,
    )
    this._activeMode = mode
    this._activeMode.onActivate(
      {
        enableMainIndicator: (id, p) => this.enableMainIndicator(id, p),
        disableMainIndicator: (id) => this.disableMainIndicator(id),
        setRendererEnabled: (n, e) => this.setRendererEnabled(n, e),
        dataManager: this.dataManager,
        currentPeriod: this.dataManager.currentPeriod,
      },
      prev,
    )

    if (mode === this._timeShareMode) {
      for (const { id } of this._savedTimeShareState!.mainIndicators) {
        if (id !== 'TIMESHARE') {
          this.indicatorManager.disableMainIndicator(id)
        }
      }
      this.indicatorManager.clearSubPanes()
    } else if (prev === this._timeShareMode) {
      const saved = this._savedTimeShareState
      if (saved) {
        for (const { id, params } of saved.mainIndicators) {
          if (id !== 'TIMESHARE') {
            this.indicatorManager.enableMainIndicator(id, params)
          }
        }
        for (const { id, params } of saved.subPanes) {
          this.indicatorManager.addIndicator(id, 'sub', params)
        }
      }
      this._savedTimeShareState = null
    }

    // 副作用成功后再写 kernel mode id
    const id = mode === this._timeShareMode ? 'timeshare' : 'kline'
    this.kernel.mode.actions.setChartMode(id)
  }

  getCurrentDpr(): number {
    return this.viewportManager.getEffectiveDpr()
  }

  /** 获取当前周期 */
  get currentPeriod(): string {
    return this.dataManager.currentPeriod
  }

  /** 获取缓存的 scrollLeft（避免读取 DOM 触发强制回流） */
  getCachedScrollLeft(): number {
    return this.viewportManager.getCachedScrollLeft()
  }

  /** 同步程序性 scrollLeft 写入后的缓存，避免等待异步 scroll 事件 */
  syncScrollLeft(scrollLeft: number): void {
    this.viewportManager.setScrollLeft(scrollLeft)
  }

  setScrollLeft(v: number): void {
    this.viewportManager.setScrollLeft(v)
  }

  /** 获取逻辑 scrollLeft（减去左侧加载缓冲宽度，可为负值） */
  getLogicalScrollLeft(): number {
    return this.viewportManager.getLogicalScrollLeft()
  }

  /** 获取插件宿主 */
  get plugin(): PluginHostImpl {
    return this.pluginHost
  }

  // ========== 渲染器插件 API（绘制只走 Scene；Manager 仅作注册表） ==========

  private resolvePluginLayerTarget(plugin: RendererPlugin): string {
    if (typeof plugin.paneId === 'symbol' || plugin.paneId === GLOBAL_PANE_ID) {
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
    const layerId = `plugin:${plugin.name}`
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
    this.renderer?.getScene()?.removeLayer(`plugin:${name}`)
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
    this.renderer?.getScene()?.setLayerVisibility(`plugin:${name}`, enabled)
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

  /**
   * 为缺失 paneScaleTypes 的 pane 按 settings.rightAxisType 补齐，再投影。
   * commitLayout 只保留已有 id，不静默塞 linear，避免盖掉用户偏好。
   */
  private ensurePaneScaleTypesFromSettings(): void {
    const axisType = this.kernel.settings.readonly.settings.peek().rightAxisType as
      | string
      | undefined
    const next = new Map(this.kernel.pane.readonly.paneScaleTypes.peek())
    let changed = false
    for (const renderer of this.paneRenderers) {
      const pane = renderer.getPane()
      if (next.has(pane.id)) continue
      const scaleType =
        !axisType || axisType === 'none'
          ? 'linear'
          : axisType === 'percent' && pane.role !== 'price'
            ? 'linear'
            : (axisType as ScaleType)
      next.set(pane.id, scaleType)
      changed = true
    }
    if (changed) this.kernel.pane.actions.replacePaneScaleTypes(next)
    this.projectPaneScaleTypes()
  }

  /** 按 rightAxisType 写入 paneScaleTypes 并投影 */
  private applyRightAxisTypeToKernel(axisType: string): void {
    if (axisType === 'none') return
    const next = new Map(this.kernel.pane.readonly.paneScaleTypes.peek())
    for (const renderer of this.paneRenderers) {
      const pane = renderer.getPane()
      const scaleType =
        axisType === 'percent' && pane.role !== 'price' ? 'linear' : (axisType as ScaleType)
      next.set(pane.id, scaleType)
    }
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

    if ('rightAxisType' in settings) {
      this.applyRightAxisTypeToKernel(settings.rightAxisType as string)
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
   * 有 zoomLevel 时走离散缩放；无 zoomLevel（分时）时写 direct kWidth。
   * @param kGap 已废弃，保留签名兼容旧调用方
   */
  applyRenderState(kWidth: number, kGap: number, zoomLevel?: number): void {
    void kGap
    const beforeLevel = this.kernel.zoom.readonly.zoomLevel.peek()
    const beforeWidth = this.kernel.zoom.readonly.kWidth.peek()

    if (zoomLevel !== undefined) {
      this.kernel.zoom.actions.setZoomLevel(zoomLevel)
    } else {
      this.kernel.zoom.actions.setDirectKWidth(kWidth)
    }

    if (
      beforeLevel === this.kernel.zoom.readonly.zoomLevel.peek() &&
      beforeWidth === this.kernel.zoom.readonly.kWidth.peek()
    ) {
      return
    }

    this.scheduleDraw()
  }

  /** 获取总缩放级别数 */
  getZoomLevelCount(): number {
    return this.kernel.options.readonly.options.peek().zoomLevelCount
  }

  /** 获取所有 PaneRenderer */
  getPaneRenderers(): PaneRenderer[] {
    return this.paneRenderers
  }

  /** 获取 MarkerManager（供 InteractionController 使用） */
  getMarkerManager(): MarkerManager {
    return this.renderer.getMarkerManager()
  }

  /** 更新自定义标记（写 kernel + 清帧缓存 + 重绘） */
  updateCustomMarkers(markers: CustomMarkerEntity[]): void {
    this.kernel.marker.actions.setCustomMarkers(markers)
    this.renderer.getMarkerManager().clearPositionCache()
    this.scheduleDraw()
  }

  /** 注册或覆盖单个自定义标记 */
  registerCustomMarker(marker: CustomMarkerEntity): void {
    this.kernel.marker.actions.registerCustomMarker(marker)
    this.renderer.getMarkerManager().clearPositionCache()
    this.scheduleDraw()
  }

  /** 清除自定义标记 */
  clearCustomMarkers(): void {
    this.kernel.marker.actions.clearCustomMarkers()
    this.renderer.getMarkerManager().clearPositionCache()
    this.scheduleDraw()
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
      this.kernel.options.actions.patch({ ...partial, panes: nextPanes })
      this.layoutManager.applyPaneLayoutSpecs(nextPanes)
      return
    }

    this.kernel.options.actions.patch(partial)
    this.resize()
  }

  updatePaneLayout(panes: PaneSpec[]): void {
    this.layoutManager.updatePaneLayout(panes)
    this.ensurePaneScaleTypesFromSettings()
  }

  setPaneDefinitions(defs: PaneSpec[]): void {
    this.layoutManager.setPaneDefinitions(defs)
  }

  upsertPane(def: PaneSpec): void {
    this.layoutManager.upsertPane(def)
  }

  removePaneDefinition(paneId: string): void {
    this.layoutManager.removePaneDefinition(paneId)
  }

  bindIndicatorToPane(
    paneId: string,
    indicatorId: SubIndicatorType,
    params?: Record<string, number | boolean | string>,
  ): void {
    this.indicatorManager.bindIndicatorToPane(paneId, indicatorId, params)
  }

  /** 更新绘图对象（写 kernel + 重绘） */
  setDrawings(drawings: import('../foundation/plugin').DrawingObject[]): void {
    this.kernel.drawing.actions.setDrawings(drawings)
    this.scheduleDraw()
  }

  /** 更新选中的绘图 ID */
  setSelectedDrawingId(id: string | null): void {
    if (this.kernel.drawing.readonly.selectedDrawingId.peek() === id) return
    this.kernel.drawing.actions.setSelectedDrawingId(id)
    this.scheduleDraw()
  }

  /**
   * 获取 DrawingStore（只读投影 kernel.drawing）。
   * @remarks 禁止经 store 写入；变更请用 setDrawings / setSelectedDrawingId。
   */
  getDrawingStore() {
    return this.renderer.getDrawingStore()
  }

  getPaneLayoutSpecs(): PaneSpec[] {
    return this.layoutManager.getPaneLayoutSpecs()
  }

  resizePaneBoundary(upperPaneId: string, deltaY: number): boolean {
    return this.layoutManager.resizePaneBoundary(upperPaneId, deltaY)
  }

  addPane(paneId: string): void {
    this.layoutManager.addPane(paneId)
  }

  removePane(paneId: string): void {
    this.layoutManager.removePane(paneId)
  }

  hasPane(paneId: string): boolean {
    return this.layoutManager.hasPane(paneId)
  }

  // ========== 副图管理 API ==========

  createSubPane(
    paneId: string,
    indicatorId: SubIndicatorType,
    params?: Record<string, number | boolean | string>,
  ): boolean {
    return this.indicatorManager.createSubPane(paneId, indicatorId, params)
  }

  removeSubPane(paneId: string): void {
    this.indicatorManager.removeSubPane(paneId)
  }

  replaceSubPaneIndicator(
    paneId: string,
    newIndicatorId: SubIndicatorType,
    params?: Record<string, number | boolean | string>,
  ): void {
    this.indicatorManager.replaceSubPaneIndicator(paneId, newIndicatorId, params)
  }

  updateSubPaneParams(paneId: string, params: Record<string, unknown>): void {
    this.indicatorManager.updateSubPaneParams(paneId, params)
  }

  clearSubPanes(): void {
    this.indicatorManager.clearSubPanes()
  }

  getSubPaneIndicators(): SubIndicatorType[] {
    return this.indicatorManager.getSubPaneIndicators()
  }

  getSubPaneEntries(): SubPaneEntry[] {
    return this.indicatorManager.getSubPaneEntries()
  }

  getSubPaneEntry(paneId: string): SubPaneEntry | undefined {
    return this.indicatorManager.getSubPaneEntry(paneId)
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

  /** 获取渲染数据源（分时图下为 TimeShareData，K线图为 KLineData） */
  getRenderData(): unknown[] {
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
    for (const meta of scheduler.getAllIndicators()) {
      const paneId = meta.defaultPaneId === 'main' ? 'main' : meta.defaultPaneId
      const stateKey = resolveStateKey(meta.stateKey, paneId)
      const state = this.pluginHost.getSharedState<any>(stateKey)
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

  /** 根据视口内 X 坐标反查逻辑索引（允许超出最后一根 K 线） */
  getLogicalIndexAtX(mouseX: number): number | null {
    return this.dataManager.getLogicalIndexAtX(mouseX)
  }

  /** 根据视口内 X 坐标反查数据索引（用于绘图落点） */
  getDataIndexAtX(mouseX: number): number | null {
    return this.dataManager.getDataIndexAtX(mouseX)
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
    if (this._activeMode === this._timeShareMode) {
      const tsData = this.dataManager.getTimeShareData()
      const vp = this.viewportManager.computeViewport()
      if (!vp || vp.plotWidth <= 0) return
      if (tsData.length > 0) {
        const result = this._activeMode.computeKWidth(tsData.length, vp.plotWidth, vp.dpr)
        if (result) {
          this.applyRenderState(result.kWidth, result.kGap)
          const leftBuffer = this.getLeftLoadBufferWidth()
          this.viewportManager.setScrollLeft(leftBuffer)
        }
      }
      this.renderer.clearCachedFrame()
      this.layoutManager.layoutPanes()
      this.scheduleDraw()
      return
    }
    const vp = this.viewportManager.computeViewport()
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
    if (this.runtimeProjectionDepth > 0) {
      this.runtimeProjectionDrawPending = true
      return
    }
    this.renderer.scheduleDraw(level)
  }

  private runRuntimeProjection(run: () => void): void {
    this.runtimeProjectionDepth++
    try {
      this.rendererPluginManager.transaction(run)
    } finally {
      this.runtimeProjectionDepth--
      if (this.runtimeProjectionDepth === 0 && this.runtimeProjectionDrawPending) {
        this.runtimeProjectionDrawPending = false
        this.renderer?.scheduleDraw(UpdateLevel.All)
      }
    }
  }

  /** 销毁图表实例 */
  async destroy() {
    this.indicatorManager.destroy()
    // onUninstall 由 Manager 单点负责；须在 scene.dispose 之前 clear
    this.rendererPluginManager.clear()
    this.renderer.destroy()
    this.dataManager.destroy()
    this.viewportManager.destroy()
    this.layoutManager.destroy()
    this.sharedWebGLSurface.destroy()
    this.kernel.dispose()
    this.alertController.dispose()
    await this.pluginHost.destroy()
  }

  private computeViewport(): Viewport | null {
    return this.viewportManager.computeViewport()
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
    return this.viewportManager.viewportSignal
  }

  /** 数据信号 */
  get data(): ReadonlySignal<ReadonlyArray<KLineData>> {
    return this.dataManager.data
  }

  /** 加载信号 */
  get loading(): ReadonlySignal<boolean> {
    return this.dataManager.loading
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
    return this.dataManager.comparisonColors
  }

  /** 比较商品加载信号 */
  get comparisonLoading(): ReadonlySignal<boolean> {
    return this.dataManager.comparisonLoading
  }

  /** 生效主题信号（settings.theme + systemTheme 推导） */
  get theme(): ReadonlySignal<'light' | 'dark'> {
    return this.kernel.effectiveTheme$
  }

  /** 指标实例列表信号（派生信号，自动随主/副图状态更新） */
  get indicators(): Computed<ReadonlyArray<IndicatorInstance>> {
    return this.indicatorManager.indicatorsComputed
  }

  /** 子图信息信号（派生信号，自动随副图条目/比例更新） */
  get subPanes(): Computed<ReadonlyArray<SubPaneInfo>> {
    return this.indicatorManager.subPanesComputed
  }

  /** 当前绘图工具信号（DrawingToolId，默认 cursor） */
  get drawingTool(): ReadonlySignal<DrawingToolId> {
    return this.kernel.drawing.readonly.drawingTool
  }

  /** 注册/注销绘图交互会话，使 setDrawingTool 能清会话副作用 */
  registerDrawingSession(session: DrawingInteractionController | null): void {
    this.drawingSession = session
    if (session) {
      session.applyToolSession(this.kernel.drawing.readonly.drawingTool.peek())
    }
  }

  /** 绘图对象列表信号 */
  get drawings(): ReadonlySignal<ReadonlyArray<import('../foundation/plugin').DrawingObject>> {
    return this.kernel.drawing.readonly.drawings
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

  // ---------- Data ----------

  setData(data: KLineData[]): void {
    this.dataManager.setData(data)
  }

  appendData(newData: KLineData[]): void {
    this.dataManager.appendData(newData)
  }

  setDataFetcher(fetcher: import('../controllers/types').DataFetcher | null): void {
    this.dataManager.setDataFetcher(fetcher)
  }

  get dataBuffer(): import('../data/dataBuffer').DataBuffer {
    return this.dataManager.dataBuffer as import('../data/dataBuffer').DataBuffer
  }

  checkVisibleRangeGap(): void {
    this.dataManager.checkVisibleRangeGap()
  }

  setSymbols(specs: ReadonlyArray<SymbolSpec>): void {
    // 品种/周期切换时重置最新 K 线时间戳，确保新数据触发预警
    this._lastAlertTimestamp = null
    const primaryPeriod = specs[0]?.period
    if (primaryPeriod) {
      // ⚠️ setActiveMode 必须在 dataManager.setSymbols 之前调用，
      //    以确保 kWidth/kGap（从 zoom level 恢复）先写入 _optionsSignal，
      //    后续 scrollLeft 恢复才能正确反推物理像素偏移。
      this.setActiveMode(primaryPeriod === 'timeshare' ? this._timeShareMode : this._kLineMode)
    }
    this.dataManager.setSymbols(specs)
    // Scroll position 恢复必须放在 setActiveMode + setSymbols 之后，
    // 此时 kWidth/kGap 已由 zoom level 恢复写回，计算不出错。
    if (primaryPeriod && primaryPeriod !== 'timeshare') {
      this.dataManager.tryRestoreScrollFromSnapshot()
    }
  }

  addComparisonSymbol(spec: SymbolSpec): void {
    this.dataManager.addComparisonSymbol(spec)
  }

  removeComparisonSymbol(symbol: string): void {
    this.dataManager.removeComparisonSymbol(symbol)
  }

  setComparisonData(symbol: string, data: KLineData[]): void {
    this.dataManager.setComparisonData(symbol, data)
  }

  setCurrentSymbol(symbol: string): void {
    this.dataManager.setCurrentSymbol(symbol)
  }

  setCurrentPeriod(period: string): void {
    this.setActiveMode(period === 'timeshare' ? this._timeShareMode : this._kLineMode)
    this.dataManager.setCurrentPeriod(period)
  }

  switchToTimeShareForDate(dateYYYYMMDD: number): void {
    this.dataManager.setTimeShareQueryDate(dateYYYYMMDD)
    this.setActiveMode(this._timeShareMode)
    this.dataManager.setCurrentPeriod('timeshare')
  }

  applyCustomData(source: CustomDataSource): void {
    this.dataManager.applyCustomData(source)
  }

  resetToFetcher(spec: SymbolSpec): void {
    this.dataManager.resetToFetcher(spec)
  }

  getPreCustomSpec(): SymbolSpec | null {
    return this.dataManager.getPreCustomSpec()
  }

  // ---------- Theme ----------

  /**
   * 设置主题偏好 light|dark（写 settings.theme）
   */
  setTheme(theme: 'light' | 'dark'): void {
    this.kernel.settings.actions.patch({ theme })
    this.scheduleDraw()
  }

  /**
   * 注入系统主题（仅 settings.theme === auto 时影响 effectiveTheme）
   */
  setSystemTheme(theme: 'light' | 'dark'): void {
    this.kernel.systemTheme.actions.setSystemTheme(theme)
    if (this.kernel.settings.readonly.settings.peek().theme === 'auto') {
      this.scheduleDraw()
    }
  }

  // ---------- Zoom ----------

  /**
   * 缩放到指定级别（高层 API）
   * 计算并应用新的 render state，更新 viewport signal
   */
  zoomToLevel(level: number, anchorX?: number): void {
    if (!this._activeMode.allowZoom) return
    this.zoomController.zoomToLevel(level, anchorX)
  }

  /**
   * 放大（高层 API）
   */
  zoomIn(anchorX?: number): void {
    if (!this._activeMode.allowZoom) return
    this.zoomController.zoomIn(anchorX)
  }

  /**
   * 缩小（高层 API）
   */
  zoomOut(anchorX?: number): void {
    if (!this._activeMode.allowZoom) return
    this.zoomController.zoomOut(anchorX)
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
    if (!this._activeMode.allowZoom) return
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
    if (!this._activeMode.allowZoom) return
    this.zoomController.handlePinch(delta, centerClientX)
  }

  // ---------- Indicators (Explicit role) ----------

  /**
   * 添加指标（高层 API，显式指定 role）
   * @param definitionId 指标定义 ID（如 'MA', 'MACD'）
   * @param role 'main' 主图指标 或 'sub' 副图指标
   * @param params 指标参数
   * @returns 实例 ID（成功）或 null（失败）
   */
  addIndicator(
    definitionId: string,
    role: 'main' | 'sub',
    params?: Record<string, unknown>,
  ): string | null {
    return this.indicatorManager.addIndicator(definitionId, role, params)
  }

  removeIndicator(instanceId: string): boolean {
    return this.indicatorManager.removeIndicator(instanceId)
  }

  updateIndicatorParams(instanceId: string, params: Record<string, unknown>): boolean {
    return this.indicatorManager.updateIndicatorParams(instanceId, params)
  }

  reorderIndicators(orderedInstanceIds: string[]): boolean {
    return this.indicatorManager.reorderIndicators(orderedInstanceIds)
  }

  // ---------- Sub Panes ----------

  /**
   * 调整子图大小（高层 API）
   * @param paneId 面板 ID
   * @param deltaY 垂直偏移量
   * @returns 是否成功
   */
  resizeSubPane(paneId: string, deltaY: number): boolean {
    return this.resizePaneBoundary(paneId, deltaY)
  }

  // ---------- Drawings ----------

  /**
   * 设置当前绘图工具（高层 API）—— 业务态只写 kernel，再清会话副作用
   * @param tool DrawingToolId；传 null 时视为 cursor（兼容旧 API）
   */
  setDrawingTool(tool: DrawingToolId | null): void {
    const toolId: DrawingToolId = tool ?? 'cursor'
    this.kernel.drawing.actions.setDrawingTool(toolId)
    this.drawingSession?.applyToolSession(toolId)
    this.scheduleDraw()
  }

  /**
   * 移除绘图（高层 API）—— 优先会话工作副本，否则只写 kernel
   * @param drawingId 绘图 ID
   */
  removeDrawing(drawingId: string): void {
    if (this.drawingSession) {
      this.drawingSession.removeDrawing(drawingId)
      return
    }
    const next = this.kernel.drawing.readonly.drawings
      .peek()
      .filter((d) => d.id !== drawingId)
    this.setDrawings([...next])
  }

  /**
   * 清除所有绘图（高层 API）
   */
  clearDrawings(): void {
    this.setDrawings([])
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
