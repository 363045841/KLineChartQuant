import type { Bar, IndicatorMarketContext } from '@363045841yyt/klinechart-plot-contracts'
import { createFootprintRuntime } from '@/components/footprint/runtime/impl/createFootprintRuntime.js'
import type { SymbolSpec } from '@/data/symbolSpec.js'
import { symbolSpecIdentityKey } from '@/engine/data/symbolIdentity.js'
import type { ObjectAxesApi } from '@/engine/pane/axisTypes.js'
import { PRICE_SERIES_AXIS_ID } from '@/engine/renderers/rendererIds.js'
import { RuntimeProjectionCoordinator } from '@/engine/runtimeProjection/impl/runtimeProjectionCoordinator.js'
import type { RuntimeProjectionSnapshot } from '@/engine/runtimeProjection/types.js'
import type { ChartFrameCaptureContext } from '../../../controllers/screenshot/types.js'
import { isTimeSharePeriod, type SymbolInfo } from '../../../controllers/types.js'
import type { CoverageResult } from '../../../data/buffer/types.js'
import type { MarketDataService } from '../../../data/service/index.js'
import { GENERIC_ERROR_CODES, KLineChartError } from '../../../errors.js'
import { type ChartSettings, resolvePriceScaleTypeSetting } from '../../../foundation/config/chartSettings.js'
import { MarketSessionRegistry } from '../../../foundation/config/marketSession/marketSessionRegistry.js'
import type { PriceAxisRangeMode } from '../../../foundation/config/priceAxisRangeMode.js'
import type { RenderContext } from '../../../foundation/plugin/index.js'
import { type PluginHostImpl } from '../../../foundation/plugin/index.js'
import { batch, computed, createSignal, type ReadonlySignal } from '../../../foundation/reactivity/signal.js'
import { resolveDisplayTimeZone } from '../../../foundation/time/index.js'
import type { KLineData } from '../../../foundation/types/price.js'
import { AXIS_TYPE_NONE, ScaleType } from '../../../foundation/types/scaleType.js'
import { type RendererHost } from '../../../rendering/render/index.js'
import type { Layer, RenderObjectCommands, RenderObjectMoveTarget } from '../../../rendering/scene/types.js'
import { ChartAxisColumns } from '../../axisWidth/chartAxisColumns.js'
import { ChartDataViewId, type ChartModeHandler, isTimeShareDataView, KLineMode, TimeShareMode } from '../../chartModel/index.js'
import { InteractionController, type InteractionSnapshot } from '../../controller/interaction.js'
import { ChartDataManager } from '../../data/chartDataManager.js'
import { ComparisonCommands } from '../../data/comparisonCommands.js'
import { createDrawingObjectLayers, DrawingCommands, DrawingDocument, type DrawingInteractionController } from '../../drawing/index.js'
import { ChartRenderer } from '../../frame/index.js'
import { ChartIndicatorManager } from '../../indicators/chartIndicatorManager.js'
import { toPlotBar } from '../../indicators/plotBars.js'
import type { DefinitionRegistry } from '../../indicators/registry/index.js'
import type { LayoutDocument } from '../../layout/index.js'
import type { TemplateWorkspaces } from '../../indicatorTemplate/index.js'
import { LegendManager } from '../../legend/impl/LegendManager.js'
import { createSystemObjects } from '../../objects/impl/systemObjects.js'
import type { ObjectTree } from '../../objects/types.js'
import { ChartPaneLayout, type PaneRenderer, runInNewPane, UpdateLevel } from '../../pane/index.js'
import { INSTANCE_MOVE_KIND, type PaneSpec } from '../../pane/types.js'
import { ChartStateKernel } from '../../state/chartStateKernel.js'
import type { RangeSelectionState } from '../../state/interactionState.js'
import { observeViewport } from '../../viewport/observeViewport.js'
import { IncrementalLoadHint } from '../../viewport/incrementalLoadHint.js'
import { ChartZoomController } from '../../viewport/chartZoomController.js'
import { matchActiveRangePreset, type RangePreset, type RangeWindow, resolveRangeWindow } from '../../viewport/rangePreset.js'
import { ViewportScrollBridge } from '../../viewport/viewportScrollBridge.js'
import { ChartTimeNavigation } from '../../viewport/chartTimeNavigation.js'
import type { PlotNavigation } from '../../viewport/navigation.js'
import { ChartDrawingFacade } from '../facade/chartDrawingFacade.js'
import { ChartIndicatorFacade } from '../facade/chartIndicatorFacade.js'
import { ChartPaneFacade } from '../facade/chartPaneFacade.js'
import { ChartThemeFacade } from '../facade/chartThemeFacade.js'
import { ChartZoomFacade } from '../facade/chartZoomFacade.js'
import type { ChartDom, ChartOptions, Viewport, ViewportState } from '../types.js'
export type { InteractionSnapshot }

import { ChartInputSurface, type DrawingPointerController } from './input.js'
import { ChartMarketCommands } from './market.js'
import { createChartServices } from './graph.js'
import type { ChartRuntime } from './runtime.js'
import { captureChartProjection } from './projection.js'
import { projectChartSettings } from './settingsProjection.js'
import { installLayerVisibilityProjection } from './layerVisibility.js'
import { buildIndicatorObjectCommands } from './indicatorObjects.js'
import { ChartViewportCommands } from './viewportCommands.js'
import { ChartDrawingSessionCommands } from './drawingSessionCommands.js'
import type { AxisWidths } from '../../axisWidth/types.js'

function resolveInitialZoomLevel(opt: ChartOptions): number {
  return opt.initialZoomLevel ?? 1
}

/** 模式处理器无状态，所有图表实例共享同一份。 */
const KLINE_MODE = new KLineMode()
const TIME_SHARE_MODE = new TimeShareMode()

export class Chart {
  /** 指针事件到分发器的唯一映射；避免在事件热路径上写长 switch。 */
  private dom: ChartDom
  /** 指针、滚轮、原生滚动与捏合的唯一入口。 */
  private readonly input: ChartInputSurface
  private dataManager: ChartDataManager
  /** 创建时配置的初始缩放级别；`resetChart` 恢复到该档位。 */
  /** 可见窗口命中的预置；派生自真实视口，不另存点击状态。 */
  private readonly _activeRangePreset: ReadonlySignal<RangePreset | null>

  /** StateKernel — single source of truth for all chart state */
  readonly kernel: ChartStateKernel

  private stopObservingViewport?: () => void
  private readonly historyHint: IncrementalLoadHint
  /** 唯一的 renderer 程序滚动与原生 scroll 回流协调器。 */
  private viewportScrollBridge: ViewportScrollBridge
  private layoutManager: ChartPaneLayout
  /** 视口命令：滚动定位、尺寸与轴宽。 */
  private readonly viewportCommands: ChartViewportCommands
  private get paneRenderers(): PaneRenderer[] {
    return this.layoutManager.getPaneRenderers()
  }
  readonly interaction!: InteractionController

  /** 插件宿主 */
  private pluginHost: PluginHostImpl
  private destruction: Promise<void> | undefined

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
  readonly drawingDocument: DrawingDocument
  readonly drawingCommands: DrawingCommands
  /** 用户绘图的对象层同步器；图元文档是唯一状态源。 */
  private drawingObjects: ReturnType<typeof createDrawingObjectLayers>
  private disposeDrawingObjects: ReadonlyArray<() => void> = []
  /** 系统对象（K 线等）的显隐与顺序管理。 */
  private systemObjects: ReturnType<typeof createSystemObjects>
  /** 图层可见性投影完成后的版本；对象树据此在字段写入后重读。 */
  private readonly layerRevision = createSignal(0)

  cancelDrawingSession(): void {
    this.drawingSessionCommands.cancel()
  }

  undoDrawing(): boolean {
    return this.drawingSessionCommands.undo()
  }

  redoDrawing(): boolean {
    return this.drawingSessionCommands.redo()
  }

  /** Pane 领域公开 API。 */
  readonly panes: ChartPaneFacade

  /** 对比品种领域唯一写原语。 */
  readonly comparisonCommands: ComparisonCommands

  /** 指标领域公开 API。 */
  readonly indicators: ChartIndicatorFacade

  /** 指标管理器 */
  private indicatorManager: ChartIndicatorManager

  /** 渲染器 */
  private renderer: ChartRenderer
  /** Pane、轴、配置和指标图层的唯一提交入口。 */
  private runtimeProjection: RuntimeProjectionCoordinator
  /** activeRenderers 到 Scene 可见性的唯一投影。 */
  private disposeActiveRendererProjection: (() => void) | null = null
  private disposeTradeDemand: (() => void) | null = null
  private readonly selectionError = createSignal<string | null>(null)
  private readonly activeDataError: ReadonlySignal<string | null>
  private readonly timeNavigation: ChartTimeNavigation
  /** 序列切换命令；持有进行中的请求与取消权。 */
  private readonly market: ChartMarketCommands

  /** 当前视口导航；布局自动保存订阅这一份已提交状态。 */
  get navigation(): ReadonlySignal<PlotNavigation> {
    return this.kernel.viewport.readonly.navigation
  }
  private footprintRuntime: ReturnType<typeof createFootprintRuntime>
  private disposeFootprintDraw: (() => void) | null = null
  private disposeSettingsProjection: (() => void) | null = null
  /** 图例领域操作与展示投影的唯一入口。 */
  readonly legend: LegendManager
  /** 对象树：按 pane 分组的渲染对象视图与按身份寻址的命令面。 */
  readonly objects: ObjectTree
  readonly axes: ObjectAxesApi
  /** 图表拥有的 DOM Legend renderer，数据不进入框架响应式状态。 */
  private readonly legendDom: import('../../renderers/legend/types.js').LegendDomRenderer

  /** 绘图交互会话（锚点/预览/拖拽）；工具 id 在 kernel */
  /** 绘图会话命令；会话实例由它持有。 */
  private readonly drawingSessionCommands: ChartDrawingSessionCommands

  /** 当前绘图会话；未进入绘图时为空。 */
  private get drawingSession(): DrawingInteractionController | null {
    return this.drawingSessionCommands.currentSession
  }

  /** K 线与分时的模式处理器；无状态，全图共享。 */
  private readonly marketSessions: MarketSessionRegistry
  private readonly definitions: DefinitionRegistry

  /** 右轴 host 当前生效的 CSS 宽度；提交后锁定，布局变化时才重新评估。 */
  /** 轴宽是否已锁定：锁定期间只允许变宽，避免运动途中改变绘图区宽度。 */
  private readonly axisColumns: ChartAxisColumns

  /**
   * 创建图表实例
   * @param dom 由 Vue 组件传入的 DOM 句柄
   * @param opt 初始配置
   */
  constructor(dom: ChartDom, opt: ChartOptions, runtime: ChartRuntime) {
    this.dom = dom
    const services = createChartServices({
      dom,
      opt,
      runtime,
      host: {
        initialZoomLevel: () => resolveInitialZoomLevel(opt),
        scheduleDraw: (level) => this.scheduleDraw(level),
        getRenderOptions: () => this.getRenderOptions(),
        getOption: () => this.getOption(),
        getRenderer: (id) => this.getRenderer(id),
        useRenderer: (layer) => this.useRenderer(layer),
        removeRenderer: (id) => this.removeRenderer(id),
        requestRender: () => this.requestRender(),
        commitAxisWidths: (widths) => this.commitAxisWidths(widths),
        commitPendingLayout: () => this.commitPendingLayout(),
        cancelDrawingSession: () => this.cancelDrawingSession(),
        unlockAxisWidth: () => this.unlockAxisWidth(),
        createIndicatorObjectCommands: (instanceId) =>
          this.createIndicatorObjectCommands(instanceId),
        captureRuntimeProjection: () => this.captureRuntimeProjection(),
        paneRenderers: () => this.paneRenderers,
        paneRenderer: (paneId) => this.paneRenderer(paneId),
        computeActiveRangePreset: () => this.computeActiveRangePreset(),
        projectSettings: (previous, next) => this.projectSettings(previous, next),
        startRuntime: () => this.startRuntime(),
        activeMode: () => this.activeMode,
        panTo: (scroll) => this.panTo(scroll),
        finishNavigation: () => this.finishNavigation(),
        clearDrawingHover: () => this.clearDrawingHover(),
        getLeftLoadBufferWidth: () => this.getLeftLoadBufferWidth(),
        setComparisonSpecs: (specs) => this.setComparisonSpecs(specs),
        selectionError: this.selectionError,
        layerRevision: this.layerRevision,
        drawingSession: () => this.drawingSession,
        getInteraction: () => this.interaction,
        createInteraction: (kernel) => new InteractionController(this, kernel.interaction),
      },
    })
    this.definitions = services.definitions
    this.legendDom = services.legendDom
    this.viewportScrollBridge = services.viewportScrollBridge
    this.marketSessions = services.marketSessions
    this.pluginHost = services.pluginHost
    this.rendererHost = services.rendererHost
    this.kernel = services.kernel
    this.interaction = services.interaction
    this.layoutManager = services.layoutManager
    this.panes = services.panes
    this.axisColumns = services.axisColumns
    this.historyHint = services.historyHint
    this.dataManager = services.dataManager
    this.activeDataError = services.activeDataError
    this.footprintRuntime = services.footprintRuntime
    this.disposeTradeDemand = services.disposeTradeDemand
    this.disposeFootprintDraw = services.disposeFootprintDraw
    this.comparisonCommands = services.comparisonCommands
    this.zoomController = services.zoomController
    this.theme = services.theme
    this.zoom = services.zoom
    this.timeNavigation = services.timeNavigation
    this.systemObjects = services.systemObjects
    this.renderer = services.renderer
    this.axes = services.axes
    this.runtimeProjection = services.runtimeProjection
    this.indicators = services.indicators
    this.legend = services.legend
    this.objects = services.objects
    this.drawing = services.drawing
    this.drawingDocument = services.drawingDocument
    this.drawingCommands = services.drawingCommands
    this.drawingObjects = services.drawingObjects
    this.disposeDrawingObjects = services.disposeDrawingObjects
    this.indicatorManager = services.indicatorManager
    this.disposeSettingsProjection = services.disposeSettingsProjection

    // 系统层随装配完成：应用布局中保存的 z（可见性由 activeRenderers 投影统一写入）。
    this.systemObjects.apply()
    this._activeRangePreset = computed(() => this.computeActiveRangePreset())

    this.drawingSessionCommands = new ChartDrawingSessionCommands({
      interaction: this.kernel.interaction,
      dom: this.dom,
      commands: () => this.drawingCommands,
    })

    this.viewportCommands = new ChartViewportCommands({
      kernel: this.kernel,
      timeNavigation: this.timeNavigation,
      axisColumns: this.axisColumns,
      layoutManager: this.layoutManager,
      renderer: this.renderer,
      interaction: this.interaction,
      axes: this.axes,
      dom: this.dom,
      scheduleDraw: () => this.scheduleDraw(),
      publishView: () => this.runtimeProjection.publishView(),
      finishNavigation: () => this.finishNavigation(),
      checkGapWhenIdle: () => this.checkVisibleRangeGapWhenIdle(),
    })

    this.input = new ChartInputSurface({
      dom: this.dom,
      interaction: this.interaction,
      scrollBridge: this.viewportScrollBridge,
      drawingTool: () => this.drawing.tool.peek(),
      allowZoom: () => this.kernel.mode.readonly.interactionCapabilities.peek().allowZoom,
      clearDrawingHover: () => this.clearDrawingHover(),
      finishNavigation: () => this.finishNavigation(),
      panTo: (scroll) => this.panTo(scroll),
      leftLoadBufferWidth: () => this.getLeftLoadBufferWidth(),
      stopMotion: () => {
        this.interaction.stopInertia()
        this.zoomController.stopAnimation()
      },
      wheelZoom: (deltaY, viewportX, deltaMode, ctrlKey) =>
        this.zoomController.handleWheel(deltaY, viewportX, deltaMode, ctrlKey),
      pinchZoom: (delta, centerClientX) =>
        this.zoomController.handlePinch(delta, centerClientX),
    })
    this.market = new ChartMarketCommands({
      kernel: this.kernel,
      dataManager: this.dataManager,
      marketSessions: this.marketSessions,
      timeNavigation: this.timeNavigation,
      captureView: (spec) => this.captureViewFor(spec),
      clearModeFrame: () => this.clearModeFrame(),
      cancelDrawingSession: () => this.cancelDrawingSession(),
      clearRangeSelection: () => this.clearRangeSelection(),
      stopMotion: () => {
        this.interaction.stopInertia()
        this.zoomController.stopAnimation()
      },
      syncDrawingSelection: (primary, previousPeriod) => {
        const nextSymbol = primary ? symbolSpecIdentityKey(primary) : undefined
        if (this.drawing.getSymbolKey() !== nextSymbol || previousPeriod !== primary?.period)
          this.kernel.drawing.actions.setSelectedDrawingIds([])
      },
      unlockAxisWidth: () => this.unlockAxisWidth(),
      scheduleDraw: () => this.scheduleDraw(),
      setSelectionError: (message) => this.selectionError.set(message),
    })
    this.startRuntime()
  }

  /** 在所有运行时依赖就绪后，统一将 kernel 状态投影为可绘制图表。 */
  private startRuntime(): void {
    this.runtimeProjection.start()
    if (this.dom.container) {
      this.stopObservingViewport = observeViewport(
        this.dom.container,
        (width, height, dpr) => this.resize({ width, height, dpr }),
        () => this.handleScrollEvent(),
      )
    }
    // init 已同步写入首帧尺寸；ResizeObserver 首次回调尺寸不变时不会触发 resize（WebKit 不支持
    // device-pixel-content-box，DPR 也不会变化），pane 若不在此布局，画布高度会停留在 0。
    if (this.getViewport()) this.layoutManager.layoutPanes()
    this.installActiveRendererProjection()
    this.scheduleDraw()
  }

  /** 捕获一次业务快照，投影阶段不再各自派生对象轴。 */
  private captureRuntimeProjection(): RuntimeProjectionSnapshot {
    return captureChartProjection({
      kernel: this.kernel,
      definitions: this.definitions,
      indicatorManager: this.indicatorManager,
      getDrawingSession: () => this.drawingSession,
    })
  }

  getViewport(): Viewport | null {
    if (this.kernel.viewport.readonly.viewWidth.peek() === 0) return null
    return this.kernel.viewport.readonly.viewport.peek()
  }

  /** 获取当前活跃的模式处理器 */
  get activeMode(): ChartModeHandler {
    return isTimeShareDataView(this.kernel.mode.readonly.dataView.peek())
      ? TIME_SHARE_MODE
      : KLINE_MODE
  }

  /** 切换模式处理器 */
  private clearModeFrame(): void {
    // 数据视图切换前的各 Layer 已使用旧数据绘制；先清屏并废弃几何缓存，避免等待新视图数据时残留。
    this.renderer.clearCachedFrame()
    this.renderer.clearAllCanvases()
    // #legend 插槽消费独立的 Vue DOM 上下文，不随 canvas 清屏；切换时必须同步清除旧图例。
    this.legend.clearFrame()
    this.legendDom.clear()

    for (const renderer of this.paneRenderers)
      for (const axis of renderer.getPane().axes) axis.yAxis.setBasePrice(null)
  }

  getCurrentDpr(): number {
    return this.kernel.viewport.readonly.dpr.peek()
  }

  /** 获取插件宿主 */
  get plugin(): PluginHostImpl {
    return this.pluginHost
  }

  // ========== 渲染器 API（唯一绘制契约：Layer；Scene 负责过滤与分发） ==========

  /**
   * 注册渲染器 Layer；Scene 校验身份唯一性，重复注册抛异常。
   * 绘制目标由 Layer.pane 声明；查询和移除直接使用 Layer.id。
   */
  useRenderer(layer: Layer<RenderContext>): void {
    this.renderer.getScene().addLayer(layer)
    this.scheduleDraw()
  }

  /** 移除渲染器 Layer。 */
  removeRenderer(id: string): void {
    if (this.renderer.getScene().removeLayer(id)) this.scheduleDraw()
  }

  /**
   * 指标对象的领域命令。
   *
   * 所有写操作都走 Pane 命令面；锁定只阻止删除与迁移，显隐与排序照常。
   */
  private createIndicatorObjectCommands(instanceId: string): RenderObjectCommands {
    return buildIndicatorObjectCommands(
      { kernel: this.kernel, panes: this.panes, indicators: this.indicators },
      instanceId,
    )
  }

  /** 同 pane 换位、跨 pane 迁移或先建 Pane 再迁移；统一落到 Pane 领域命令。 */
  private moveIndicatorObject(instanceId: string, target: RenderObjectMoveTarget): boolean {
    const current = this.kernel.indicator.readonly.instances
      .peek()
      .find((instance) => instance.instanceId === instanceId)
    if (current === undefined) return false
    if (target.kind === 'newPane') {
      return runInNewPane(this.panes, target.anchorPaneId, target.placement, (paneId) =>
        this.indicators.move(instanceId, {
          kind: INSTANCE_MOVE_KIND.PANE,
          paneId,
        }),
      )
    }
    return this.indicators.move(instanceId, {
      kind: INSTANCE_MOVE_KIND.PANE,
      paneId: target.paneId,
      index: target.index,
    })
  }

  /** 获取已注册渲染器 Layer。 */
  /** 当前 Pane 已提交层的图元线段，供绘图磁吸候选。 */
  getSnapLines(paneId: string): ReadonlyArray<import('../../drawing/index.js').SnapLine> {
    return this.renderer.getCommittedSnapLines(paneId)
  }

  /** 返回当前 Pane 与绘图投影共用的公开坐标服务。 */
  getCoordinates(
    paneId: string,
    axisId?: string,
  ): import('../../../foundation/geometry/frameCoordinates.js').FrameCoordinates | null {
    return this.renderer.getCoordinates(paneId, axisId)
  }

  /** 指定逻辑下标处该 Pane 的指标值，供绘图磁吸候选。 */
  getIndicatorSnapValues(
    paneId: string,
    barIndex: number,
  ): ReadonlyArray<import('../../drawing/index.js').SnapIndicatorValue> {
    return this.renderer.getIndicatorSnapValues(paneId, barIndex)
  }

  getRenderer(id: string): Layer<RenderContext> | undefined {
    return this.renderer.getScene().getLayer(id) ?? undefined
  }

  /** 外部 Layer 更新私有数据后请求完整重绘，不受帧内容缓存跳过。 */
  requestRender(): void {
    this.renderer.invalidateFrame()
    this.scheduleDraw()
  }

  /** 完整 Scene 合成后捕获同一帧；可见目标均为已经合成完毕的 Canvas。 */
  captureFrame<T>(capture: (frame: ChartFrameCaptureContext) => T | Promise<T>): Promise<T> {
    return this.renderer.captureFrame(() => {
      return capture({
        dpr: this.kernel.viewport.readonly.dpr.peek(),
      })
    })
  }

  

  

  /**
   * 将用户坐标偏好写入 paneScaleTypes。
   * 分时覆盖期间保留用户 Setting，由 dataView 返回 K 线时重新派生生效刻度。
   */
  private applyPriceScaleSettingToKernel(setting: ScaleType): void {
    const next = new Map(this.kernel.pane.getScalePreferences())
    next.set(PRICE_SERIES_AXIS_ID, setting)
    this.kernel.pane.actions.replacePaneScaleTypes(next)
  }

  /**
   * 更新用户设置（触发重绘）—— 业务态只写 kernel.settings。
   * 使用 patch 合并到当前 resolved，避免 partial 覆盖把未传 key 打回默认。
   */
  updateSettings(settings: ChartSettings): void {
    const prev = this.kernel.settings.readonly.settings.peek()
    this.kernel.settings.actions.patch(settings)
    const next = this.kernel.settings.readonly.settings.peek()
    if (
      prev.mainRightAxisTypeSetting !== next.mainRightAxisTypeSetting &&
      next.mainRightAxisTypeSetting !== AXIS_TYPE_NONE
    ) {
      this.applyPriceScaleSettingToKernel(
        resolvePriceScaleTypeSetting(next.mainRightAxisTypeSetting),
      )
    }
  }

  /** 将内核设置变更应用到交互、缓存和渲染后端，不回写业务设置。 */
  private projectSettings(prev: Readonly<ChartSettings>, next: Readonly<ChartSettings>): void {
    projectChartSettings(prev, next, {
      resetTooltipPlacement: () => this.interaction.resetTooltipPlacement(),
      setCacheMaxBytes: (bytes) => this.dataManager.setCacheMaxBytes(bytes),
      switchRendererBackend: (backend) => this.rendererHost.switchTo(backend),
      unlockAxisWidth: () => this.unlockAxisWidth(),
      scheduleDraw: (level) => this.scheduleDraw(level),
    })
  }

  /**
   * 绘制一帧
   * @param level 更新级别，决定渲染哪些层
   */
  draw(level: UpdateLevel = UpdateLevel.All) {
    this.renderer.draw(level)
  }

  // ========== Render State API (Vue SSOT) ==========

  /** 为数据、渲染和指标提供同一份当前几何投影。 */
  private getRenderOptions() {
    return {
      ...this.kernel.options.readonly.options.peek(),
      kWidth: this.kernel.viewport.readonly.viewSnapshot().kWidth,
      kGap: this.kernel.viewport.readonly.kGap(),
    }
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
    // panes 走独立布局入口，其余字段合并进 options 快照。
    const { panes, ...optionPatch } = partial
    this.kernel.options.actions.patch(optionPatch)
    if (panes) {
      this.panes.importLayout(panes.map((pane) => ({ ...pane })))
      return
    }

    this.resize()
  }

  /** 按 pane ID 查找运行时渲染器。 */
  private paneRenderer(paneId: string): PaneRenderer | undefined {
    return this.paneRenderers.find((renderer) => renderer.getPane().id === paneId)
  }

  /** 仅适用于单轴容器的便捷 API；多轴必须由调用方使用 axes 显式寻址。 */
  private requirePaneAxisId(paneId: string): string {
    const pane = this.paneRenderer(paneId)?.getPane()
    if (!pane)
      throw new KLineChartError(GENERIC_ERROR_CODES.NOT_REGISTERED, `Pane 未注册：${paneId}`)
    if (pane.axes.length !== 1)
      throw new KLineChartError(
        GENERIC_ERROR_CODES.INVALID_PARAM,
        `Pane ${paneId} 有 ${pane.axes.length} 条轴，必须明确指定 axisId`,
      )
    return pane.axes[0]!.axisId
  }

  /** 清除纵轴变换，主图下一帧按当前可见 range 的 Max/Min 重新适配。 */
  resetPriceTransform(paneId: string): void {
    this.axes.resetRange(this.requirePaneAxisId(paneId))
    this.scheduleDraw()
  }

  /** 设置目标 Pane 的范围模式；切到手动时保存该轴当前显示范围。 */
  setPanePriceAxisRangeMode(paneId: string, mode: PriceAxisRangeMode): void {
    this.axes.setRangeMode(this.requirePaneAxisId(paneId), mode)
  }

  /** 只修改目标 Pane 刻度；百分比仅允许主图使用。 */
  setPanePriceAxisScaleType(paneId: string, type: ScaleType): void {
    this.axes.setScaleType(this.requirePaneAxisId(paneId), type)
  }

  /** 获取当前数据源（供 renderers 和 interaction 使用） */
  getData(): readonly KLineData[] {
    return this.dataManager.getData()
  }

  /** 返回图表与 Agent 共用的实例级行情缓存。 */
  getMarketData(): MarketDataService {
    return this.dataManager.marketData
  }

  /** 对当前行情快照执行一次计算，不注册指标或创建 Pane。 */
  withIndicatorData<T>(
    compute: (bars: readonly Bar[], market: IndicatorMarketContext) => Promise<T>,
  ): Promise<T> {
    const bars = this.data.peek()
    return this.dataManager.withIndicatorMarketContext(bars, (market) =>
      compute(bars.map(toPlotBar), market),
    )
  }

  /** 把当前可见区间写入序列记忆；布局导出前调用。 */
  captureCurrentView(): void {
    const spec = this.kernel.dataManager.readonly.currentSpec.peek()
    if (spec) this.captureViewFor(spec)
  }

  /** 严格可见范围 → 时间区间；不含渲染缓冲区，恢复后不会整体偏移。 */
  private captureViewFor(spec: SymbolSpec): void {
    if (!isTimeSharePeriod(spec.period)) this.timeNavigation.save(spec)
  }

  /** 应用布局文档：先导入序列视图，再恢复布局状态，最后切序列并定位。 */
  applyLayout(document: LayoutDocument): Promise<void> {
    return this.market.applyLayout(document)
  }

  exportLayout(): LayoutDocument {
    return this.kernel.exportLayout()
  }

  createLayout(): LayoutDocument {
    return this.kernel.createLayout()
  }

  applyIndicatorTemplate(workspaces: TemplateWorkspaces): void {
    this.kernel.applyIndicatorTemplate(workspaces)
    this.scheduleDraw()
  }

  setFavoriteIndicator(indicatorId: string, favorite: boolean): void {
    this.kernel.indicator.actions.setFavorite(indicatorId, favorite)
  }

  /** 整体替换主品种（含周期、复权与来源）；视图定位由本类负责。 */
  setPrimaryMarket(spec: SymbolSpec | null, options?: { date?: number }): Promise<void> {
    return this.market.setPrimaryMarket(spec, options)
  }

  /** 让数据池覆盖到 `fromTs`；唯一的补历史入口，返回时窗口已齐或确认取不到。 */
  async ensureCoverageFrom(fromTs: number): Promise<CoverageResult> {
    return this.dataManager.ensureCoverageFrom(fromTs)
  }

  /** 预置对应的时间窗：终点是最新一根，起点按跨度或年初回推。 */
  getPresetWindow(preset: RangePreset): RangeWindow | null {
    return resolveRangeWindow(preset, this.dataManager.getData(), this.displayTimeZone())
  }

  /** 当前可见窗口命中的预置；不匹配任何预置时为 null。 */
  get activeRangePreset(): ReadonlySignal<RangePreset | null> {
    return this._activeRangePreset
  }

  /**
   * 把时间窗装进屏幕。
   *
   * 时间到索引的换算在这里完成，几何换算交给缩放控制器，两笔状态在同一次提交内落地。
   *
   * @param from 窗口最早时间
   * @param to 窗口最晚时间
   * @returns 是否真正完成定位
   */
  frameTimeRange(from: number, to: number): boolean {
    if (!this.timeNavigation.frame(from, to)) return false
    this.scheduleDraw()
    this.finishNavigation()
    return true
  }

  /** 显示时区：年初、刻度与预置共用同一个来源。 */
  private displayTimeZone(): string {
    return resolveDisplayTimeZone(
      this.kernel.settings.readonly.settings().displayTimeZone === 'local' ? 'local' : 'UTC',
    )
  }

  /** 由真实可见窗口派生命中的预置。 */
  private computeActiveRangePreset(): RangePreset | null {
    if (this.kernel.mode.readonly.dataView() !== ChartDataViewId.KLine) return null
    const range = this.kernel.viewport.readonly.visibleRange()
    return matchActiveRangePreset({
      bars: this.dataManager.data(),
      visibleFrom: range.start,
      visibleTo: range.end,
      timeZone: this.displayTimeZone(),
    })
  }

  /** K线原始数据（分时模式下为空） */
  getInternalData(): readonly KLineData[] {
    return this.dataManager.getInternalData()
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
    this.viewportCommands.scrollToRight()
  }

  /**
   * 按 K 线根数水平平移视口；正数向右（更新），负数向左（更早）。
   *
   * @param bars 平移根数，非有限值或 0 时忽略
   */
  scrollByBars(bars: number): void {
    this.viewportCommands.scrollByBars(bars)
  }

  /** 提交拖动、惯性和原生横向滚动共用的逻辑坐标。 */
  panTo(scroll: number): boolean {
    return this.viewportCommands.panTo(scroll)
  }

  /** 一次提交默认时间视图与价格轴状态，避免消费方看到半重置的视口。 */
  resetChart(): void {
    this.viewportCommands.reset()
  }

  /** 提交本帧轴宽：列几何是唯一来源。 */
  private commitAxisWidths(widths: AxisWidths): boolean {
    return this.viewportCommands.commitAxisWidths(widths)
  }

  /** 布局或设置变化后允许重新评估轴宽；下一帧按新标签提交并重新锁定。 */
  private unlockAxisWidth(): void {
    this.axisColumns.unlock()
  }

  /** 容器尺寸变化：记录测量结果并置位下一帧重排。 */
  resize(size?: { width: number; height: number; dpr: number }): void {
    this.viewportCommands.resize(size)
  }

  /** 在绘制帧内提交容器尺寸变化，统一重算 pane 内容区。 */
  private commitPendingLayout(): void {
    this.viewportCommands.commitPendingLayout()
  }

  /**
   * 请求下一帧重绘（RAF 合并，支持分层更新）
   * @param level 更新级别，默认为 All
   */
  scheduleDraw(level: UpdateLevel = UpdateLevel.All): void {
    // 构造期间尚未建立协调者，Scene 的初始注册只请求后续首帧。
    if (this.runtimeProjection) this.runtimeProjection.requestDraw(level)
    else this.renderer?.scheduleDraw(level)
  }

  /** 当活跃渲染器列表变化时，仅对发生变化的图层执行显示或隐藏操作，而不是每帧重建所有图层状态 */
  private installActiveRendererProjection(): void {
    this.disposeActiveRendererProjection = installLayerVisibilityProjection({
      activeRenderers: this.kernel.activeRenderers$,
      systemObjectState: this.kernel.systemObjects.readonly.state,
      isLayerHidden: (layerId) => this.systemObjects.isLayerHidden(layerId),
      getScene: () => this.renderer?.getScene() ?? null,
      bumpRevision: () => this.layerRevision.set(this.layerRevision.peek() + 1),
      scheduleDraw: () => this.scheduleDraw(),
    })
  }

  /** 销毁图表实例 */
  destroy(): Promise<void> {
    if (!this.destruction) this.destruction = this.destroyChart()
    return this.destruction
  }

  /** 先完成插件卸载，再释放 Scene 与图表状态；重复销毁复用同一任务。 */
  private async destroyChart(): Promise<void> {
    this.market.dispose()
    this.interaction.stopInertia()
    this.zoomController.stopAnimation()
    this.renderer.stopScheduling()
    // 插件卸载时仍可访问 Scene、状态与服务；随后统一释放图表资源。
    await this.pluginHost.destroy()
    this.disposeActiveRendererProjection?.()
    this.disposeActiveRendererProjection = null
    this.runtimeProjection.dispose()
    this.disposeTradeDemand?.()
    this.disposeTradeDemand = null
    this.disposeFootprintDraw?.()
    this.disposeFootprintDraw = null
    this.footprintRuntime.dispose()
    this.disposeSettingsProjection?.()
    this.disposeSettingsProjection = null
    for (const dispose of this.disposeDrawingObjects) dispose()
    this.disposeDrawingObjects = []
    this.drawingObjects.dispose()
    this.systemObjects.dispose()
    this.indicatorManager.destroy()
    this.renderer.destroy()
    this.legend.dispose()
    this.legendDom.dispose()
    this.viewportScrollBridge.dispose()
    this.dataManager.destroy()
    this.historyHint.destroy()
    this.stopObservingViewport?.()
    this.layoutManager.destroy()
    this.rendererHost.dispose()
    this.drawingCommands.dispose()
    this.kernel.dispose()
  }

  // ==================== Facade API (High-level interface for adapters) ====================

  /** 右轴当前有效 CSS 宽度；外部宿主应使用它而非覆盖内联宽度。 */
  get rightAxisEffectiveWidth(): ReadonlySignal<number> {
    return this.axisColumns.right
  }

  /** 左轴所需逻辑像素宽度，供宿主布局消费。 */
  get leftAxisEffectiveWidth(): ReadonlySignal<number> {
    return this.axisColumns.left
  }

  /** 视口状态信号 */
  get viewport(): ReadonlySignal<ViewportState> {
    return this.kernel.viewport.readonly.viewportState
  }

  /** 与 Canvas 和原生滚动一起提交的帧几何，供宿主覆盖物订阅。 */
  get frameGeometry(): ChartRenderer['frameGeometry'] {
    return this.renderer.frameGeometry
  }

  /** 布局自动保存依赖的输入信号；宿主只订阅这一组。 */
  get layoutInputs() {
    return {
      selection: this.kernel.dataManager.readonly.currentSpec,
      indicatorWorkspaces: this.kernel.indicator.readonly.workspaces,
      favoriteIndicatorIds: this.kernel.indicator.readonly.favoriteIndicatorIds,
      paneWorkspaces: this.kernel.pane.readonly.workspaces,
      settings: this.kernel.settings.readonly.settings,
      drawings: this.kernel.drawing.readonly.drawings,
      systemObjects: this.kernel.systemObjects.readonly.state,
    }
  }

  /** 宿主 UI 所需的只读投影。 */
  get uiState() {
    return {
      paneRanges: this.kernel.axesState.readonly.paneRanges,
      indicatorConfigurations: this.kernel.indicator.readonly.configurations,
      paneScaleTypes: this.kernel.pane.readonly.paneScaleTypes,
      rendererRuntime: this.kernel.renderer.readonly.runtime,
      chartMode: this.kernel.mode.readonly.chartMode,
      lastBarPeriod: this.kernel.mode.readonly.lastBarPeriod,
      footprintSupported: this.kernel.footprint.readonly.supported,
      paneGeometry: this.kernel.pane.readonly.paneGeometry,
    }
  }

  /** 当前主序列与周期；身份两处读取共用同一份投影。 */
  get selection() {
    return {
      spec: this.kernel.dataManager.readonly.currentSpec,
      period: this.kernel.dataManager.readonly.currentPeriod,
    }
  }

  /** 当前活动行情快照，供 Agent 与宿主读取。 */
  get activeBuffer(): ReadonlySignal<ReturnType<ChartStateKernel['data']['readonly']['activeBuffer']>> {
    return this.kernel.data.readonly.activeBuffer
  }

  /** 当前图表时区；图元与 Agent 的时间展示共用。 */
  get timeZone(): string {
    return this.kernel.data.readonly.activeBuffer.peek().timezone ?? 'UTC'
  }

  /** 指标模板需要的工作区快照。 */
  exportIndicatorWorkspaces(): ReturnType<ChartStateKernel['snapshotViewWorkspaces']> {
    return this.kernel.snapshotViewWorkspaces()
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
    return this.activeDataError
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

  /** 对比品种集合信号（唯一业务状态） */
  get comparisonSpecs(): ReadonlySignal<ReadonlyArray<SymbolSpec>> {
    return this.kernel.comparison.readonly.specs
  }

  /** 注册/注销绘图交互会话，使 setDrawingTool 能清会话副作用 */
  registerDrawingSession(session: DrawingInteractionController | null): void {
    this.drawingSessionCommands.register(session)
  }

  /**
   * 按指针位置重算绘图悬停命中（目标语义 + 光标），宿主据此切换光标。
   * 由 InteractionController 在 hover flush 中调用，与本帧几何同代。
   */
  updateDrawingHover(clientX: number, clientY: number): void {
    this.drawingSessionCommands.updateHover(clientX, clientY)
  }

  /** 冻结绘图悬停：图元拖拽开始时调用，拖拽期间不再被实时命中改写。 */
  freezeDrawingHover(): void {
    this.drawingSessionCommands.freezeHover()
  }

  /** 解冻绘图悬停：图元拖拽结束后调用，恢复为实时命中。 */
  unfreezeDrawingHover(): void {
    this.drawingSessionCommands.unfreezeHover()
  }

  /** 清除绘图悬停：指针离开画布、悬停被清空或切换绘图工具时调用。 */
  clearDrawingHover(): void {
    this.drawingSessionCommands.clearHover()
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
    return this.kernel.interaction.readonly.interactionSnapshot
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

  // ---------- Data ----------

  checkVisibleRangeGap(): void {
    this.dataManager.checkVisibleRangeGap()
  }

  /** 拖拽、惯性与缩放动画期间不检查行情缺口，视图停稳后再检查。 */
  checkVisibleRangeGapWhenIdle(): void {
    if (!this.interaction.isPointerDown() && !this.zoomController.isAnimating)
      this.checkVisibleRangeGap()
  }

  finishNavigation(): void {
    this.captureCurrentView()
    this.checkVisibleRangeGapWhenIdle()
  }

  /** 原子设置 K 线比较折线及生效刻度，不切换视图、工作区或主品种渲染器。 */
  setComparisonSpecs(specs: ReadonlyArray<SymbolSpec>): void {
    batch(() => {
      this.kernel.actions.setComparisonSpecs(specs)
      this.applyPriceScaleSettingToKernel(
        resolvePriceScaleTypeSetting(
          this.kernel.settings.readonly.settings.peek().mainRightAxisTypeSetting,
        ),
      )
    })
    this.scheduleDraw()
  }

  /**
   * 新增原生比较折线；品种登记、集合写入与重绘由 comparisonCommands 统一处理。
   * primary 为调用方显式传入的图表主品种，仅用于补齐缺省路由字段。
   */
  addComparisonSymbol(spec: SymbolSpec, primary?: SymbolSpec | null): void {
    this.comparisonCommands.add(spec, primary ?? null)
  }

  /** 按 identity 或品种代码移除对比品种。 */
  removeComparisonSymbol(symbol: string): void {
    this.comparisonCommands.remove(symbol)
  }

  /** 切换比较折线可见性，保留图例名称和比较选择；写入口收归 comparisonCommands。 */
  setComparisonHidden(identity: string, hidden: boolean): void {
    this.comparisonCommands.setVisible(identity, !hidden)
  }

  // ---------- Interaction (Zero-config unified entry) ----------

  /**
   * 统一指针事件处理（零配置）
   * 自动判断区域并分发给 interaction controller
   *
   * @param e 指针事件
   * @param drawingController 绘图会话处理器；优先于交互控制器
   * @returns 是否被处理
   */
  handlePointerEvent(e: PointerEvent, drawingController?: DrawingPointerController): boolean {
    return this.input.handlePointerEvent(e, drawingController)
  }

  /** 滚轮：价格轴围绕价位缩放，绘图区缩放时间轴。 */
  handleWheelEvent(e: WheelEvent): void {
    this.input.handleWheel(e)
  }

  /** 原生横向滚动写回导航，再清理交互与补齐数据。 */
  handleScrollEvent(): void {
    this.input.handleScroll()
  }

  /** 双指捏合缩放。 */
  handlePinchZoom(delta: number, centerClientX: number): void {
    this.input.handlePinch(delta, centerClientX)
  }

  // ---------- Settings ----------

  /**
   * 更新设置（高层 API）
   * 代理到现有的 updateSettings
   */
  updateSettingsFacade(settings: ChartSettings): void {
    this.updateSettings(settings)
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

