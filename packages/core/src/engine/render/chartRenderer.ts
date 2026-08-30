import type { ChartSettings } from '../../foundation/config/chartSettings'
import type { SymbolSpec } from '../../controllers/types'
import type {
  PluginHostImpl,
  RenderContext,
  YAxisLabel,
  XAxisLabel,
  YAxisRange,
  XAxisRange,
  YAxisTick,
  FiveDayTimeShareGeometry,
} from '../../foundation/plugin/index'
import { RendererPluginManager, wrapPaneInfo } from '../../foundation/plugin/index'
import type { Renderer } from '../../rendering/render/Renderer'
import { createLayerFromPlugin } from '../../rendering/scene/createLayerFromPlugin'
import { createScene } from '../../rendering/scene/createScene'
import type { Scene, PaintContext, PaneRole, Layer } from '../../rendering/scene/types'
import type { KLineData, TimeShareData } from '../../foundation/types/price'
import type {
  ChartDom,
  PaneSpec,
  ChartOptions,
  KLinePositions,
  Viewport,
  ViewportState,
} from '../chartTypes'
import { InteractionController } from '../controller/interaction'
import { ChartDataManager } from '../data/chartDataManager'
import { DrawingStore, type DrawingStoreDeps } from '../drawing'
import { createDrawingRendererPlugin, createDrawingLabelOverlayPlugin } from '../drawing/plugin'
import { ChartIndicatorManager } from '../indicators/chartIndicatorManager'
import { UpdateLevel } from '../layout/pane'
import type { VisibleRange } from '../layout/pane'
import { MarkerManager, type CustomMarkerEntity, type MarkerManagerDeps } from '../marker/registry'
import {
  ASHARE_MARKET_SESSION,
  resolveMarketSessionSlots,
  resolveTimestampSessionSlot,
} from '../../foundation/utils/timeShareAxisLabels'
import { computeTimeShareXLayout } from '../modes/timeShareMath'
import { computeFiveDayTimeShareGeometry } from '../modes/fiveDayTimeShareGeometry'
import type { ChartModeHandler } from '../modes/types'
import { ChartDataViewId, type ChartDataView } from '../state/modeState'
import { PaneRenderer } from '../paneRenderer'
import { createTimeAxisRendererPlugin } from '../renderers/timeAxis'
import { createTimeShareRendererPlugin } from '../renderers/timeShare'
import { createFiveDayTimeShareRendererPlugin } from '../renderers/fiveDayTimeShare'
import { calcKBarWidthPx, getPhysicalKLineConfig } from '../utils/klineConfig'
import { calculateTickCount } from '../utils/tickCount'

import { createCandleLayer } from './layers/candleLayer'
import { createComparisonLineLayer } from './layers/comparisonLineLayer'
import { createCrosshairLayer } from './layers/crosshairLayer'
import { createCustomMarkersLayer } from './layers/customMarkersLayer'
import { createExtremaMarkersLayer } from './layers/extremaMarkersLayer'
import { createGridLinesLayer } from './layers/gridLinesLayer'
import { createLastPriceLabelLayer } from './layers/lastPriceLabelLayer'
import { createLastPriceLineLayer } from './layers/lastPriceLineLayer'
import { createLeftYAxisOverlayLayer, createLeftYAxisStaticLayer } from './layers/leftYAxisLayer'
import { createMainIndicatorLegendLayer } from './layers/mainIndicatorLegendLayer'
import { createYAxisOverlayLayer, createYAxisStaticLayer } from './layers/yAxisLayer'
import type { LayerRole } from '../../rendering/scene/types'
import {
  createFrameTransaction,
  type FrameTransaction,
} from '../../foundation/reactivity/frameTransaction'
import type { ReadonlySignal } from '../../foundation/reactivity/signal'
import type { ViewportStateModule } from '../state/viewportState'
import type { ZoomStateModule } from '../state/zoomState'
import type { OptionsStateModule } from '../state/optionsState'

type ResolvedChartOptions = Omit<ChartOptions, 'kWidth' | 'kGap'> & {
  kWidth: number
  kGap: number
}

type MarketSeriesData = KLineData | TimeShareData

/**
 * 一帧绘制几何与数据（prepare 产出，render 只读）。
 * 大数组字段做结构共享，禁止深拷贝。
 */
type FrameContext = {
  /** 视口（scrollLeft、plotWidth、dpr 等） */
  vp: Viewport
  /** 可见 K 线起止索引 */
  range: VisibleRange
  /** 每根 K 线在大图上的 x 坐标 */
  kLinePositions: KLinePositions
  /** 每根 K 线中心的 x 坐标（由物理像素回算逻辑值） */
  kLineCenters: number[]
  /** 每根 K 线实体的 x 和宽度 */
  kBarRects: Array<{ x: number; width: number }>
  /** K 线柱物理像素宽度 */
  kWidthPx: number
  /** Overlay 帧复用上一帧的几何缓存 */
  useCachedFrame: boolean
  /** 当前模式对应的强类型行情数据。 */
  data: MarketSeriesData[]
  /** 当前缩放级别索引 */
  zoomLevel: number
  /** 缩放级别总数 */
  zoomLevelCount: number
  /** 五日分时供所有 renderer 和交互共享的帧级几何。 */
  fiveDayTimeShareGeometry: FiveDayTimeShareGeometry | null
}

/** 帧事务输入：合并多次 scheduleDraw 的 level */
type FrameDrawInput = {
  level: UpdateLevel
}

/** 单帧快照，frame 为 null 表示无可画数据 */
type FrameDrawSnapshot = {
  generation: number
  level: UpdateLevel
  frame: FrameContext | null
}

/** Main 与 Overlay 合并为 All，其余取更全或后者 */
export function mergeUpdateLevel(current: UpdateLevel, next: UpdateLevel): UpdateLevel {
  if (current === UpdateLevel.All || next === UpdateLevel.All) return UpdateLevel.All
  if (current === next) return current
  if (
    (current === UpdateLevel.Main && next === UpdateLevel.Overlay) ||
    (current === UpdateLevel.Overlay && next === UpdateLevel.Main)
  ) {
    return UpdateLevel.All
  }
  return next
}

export interface RendererDependencies {
  getDom: () => ChartDom
  getOption: () => ResolvedChartOptions
  getPaneRenderers: () => PaneRenderer[]
  getInteraction: () => InteractionController
  getSceneRenderer: () => Renderer
  getPluginHost: () => PluginHostImpl
  getRendererPluginManager: () => RendererPluginManager
  /** 生效主题 SSOT */
  theme$: ReadonlySignal<'light' | 'dark'>
  /** zoomLevel / kWidth SSOT */
  zoom: ZoomStateModule
  /** zoomLevelCount 等 options SSOT */
  options: OptionsStateModule
  /** scroll / dpr / plot 几何 SSOT */
  viewport: ViewportStateModule
  getDataManager: () => ChartDataManager
  getIndicatorManager: () => ChartIndicatorManager
  getActiveMode: () => ChartModeHandler
  dataView$: ReadonlySignal<ChartDataView>
  settings$: ReadonlySignal<ChartSettings>
  customMarkers$: MarkerManagerDeps['customMarkers$']
  drawings$: DrawingStoreDeps['drawings$']
  selectedDrawingId$: DrawingStoreDeps['selectedDrawingId$']
  getOverlay?: DrawingStoreDeps['getOverlay']
  /** 主图图例上下文发布（canvas / external 均触发；draw 内回调） */
  onLegendContext?: (
    ctx: import('../renderers/Indicator/mainIndicatorLegendContext').LegendTemplateContext | null,
  ) => void
}

export class ChartRenderer {
  /** 依赖注入容器，ChartRenderer 不直接持有状态，从 deps 接口读取，也便于测试 mock */
  private deps: RendererDependencies

  /**
   * 帧事务：scheduleDraw 只写输入并合并 rAF；flush 内 prepare → seal → paint。
   * 绘制阶段不再反向写 kernel 几何（seal 在 render 回调最前、与 paint 同代）。
   */
  private readonly frameTx: FrameTransaction<FrameDrawInput, FrameDrawSnapshot>

  /** 合并多次 scheduleDraw 的 level，合并后写入 frameTx */
  private pendingLevel: UpdateLevel = UpdateLevel.All

  /** 已排队的 rAF 句柄；null 表示当前没有挂起的帧调度 */
  private raf: number | null = null

  readonly markerManager: MarkerManager
  readonly drawingStore: DrawingStore
  private overlayHadCrosshair = false
  private xAxisCtx: CanvasRenderingContext2D | null = null

  private cachedDrawFrame: {
    viewport: Viewport
    range: VisibleRange
    kLinePositions: KLinePositions
    kLineCenters: number[]
    kBarRects: Array<{ x: number; width: number }>
    kWidthPx: number
    fiveDayTimeShareGeometry: FiveDayTimeShareGeometry | null
  } | null = null

  private scene: Scene
  private frameCount = 0
  private paneCtxMap = new Map<string, RenderContext>()
  private currentPaneId = 'main'
  private timeAxisCtx: RenderContext | null = null
  private timeAxisLayer: Layer | null = null
  private _prevFrameRange: { visible: VisibleRange; raw: VisibleRange } | null = null

  constructor(deps: RendererDependencies) {
    this.deps = deps
    this.markerManager = new MarkerManager({ customMarkers$: deps.customMarkers$ })
    this.drawingStore = new DrawingStore({
      drawings$: deps.drawings$,
      selectedDrawingId$: deps.selectedDrawingId$,
      getOverlay: deps.getOverlay,
    })
    this.scene = createScene()
    this.frameTx = createFrameTransaction<FrameDrawInput, FrameDrawSnapshot>({
      initialInput: { level: UpdateLevel.All },
      derive: (input, generation) => {
        // generation 0 是 createFrameTransaction 构造占位，禁止 prepare/副作用
        if (generation === 0) {
          return { generation: 0, level: input.level, frame: null }
        }
        return {
          generation,
          level: input.level,
          frame: this.prepareFrameData(input.level),
        }
      },
      render: (snapshot) => {
        // generation 0 占位不绘制
        if (snapshot.generation === 0) return
        // 把本帧 K 线信息(kLinePositions,range,kWidthPx,kLineCenters)写入 InteractionController，保证 hover 命中与本帧一致
        if (snapshot.frame) {
          this.sealFrameGeometry(snapshot.frame)
        }
        // 用本帧几何将鼠标坐标吸附到最近 K 线，算出十字线位置
        this.deps.getInteraction().flushPendingHover()
        // 绘制：清 canvas → 构建 RenderContext → 遍历 pane 调 scene.paintPane → endFrame（GPU 一次性 submit 所有 pane）→ 时间轴
        this.drawWithFrame(snapshot.level, snapshot.frame)
      },
      schedule: (run) => {
        this.raf = requestAnimationFrame(() => {
          this.raf = null
          run()
          // 若 paint 中又 scheduleDraw，已写入新 pendingLevel 且 raf 非 null，不得清掉
          if (this.raf === null) {
            this.pendingLevel = UpdateLevel.All
          }
        })
        return this.raf
      },
    })
  }

  initCoreRenderers(): void {
    const opt = this.deps.getOption()
    const axisWidth = opt.rightAxisWidth + (opt.priceLabelWidth ?? 0)
    const interaction = this.deps.getInteraction()

    {
      const plugin = createTimeAxisRendererPlugin({
        height: opt.bottomAxisHeight,
        getCrosshair: () => {
          const pos = interaction.crosshairPos
          const idx = interaction.crosshairIndex
          if (pos && idx !== null) {
            return { x: pos.x, index: idx }
          }
          return null
        },
      })
      this.timeAxisLayer = createLayerFromPlugin(plugin, () => this.timeAxisCtx, 'global')
    }

    const getCtx = (paneId: string) => () => this.paneCtxMap.get(paneId) ?? null
    const getCtxForCurrentPane = () => this.paneCtxMap.get(this.currentPaneId) ?? null

    {
      const layer = createGridLinesLayer(getCtxForCurrentPane)
      this.scene.addLayer(layer)
    }
    {
      const layer = createCandleLayer(getCtx('main'))
      this.scene.addLayer(layer)
    }
    {
      const layer = createLayerFromPlugin(createTimeShareRendererPlugin(), getCtx('main'), 'main')
      this.scene.addLayer(layer)
    }
    {
      const layer = createLayerFromPlugin(
        createFiveDayTimeShareRendererPlugin(),
        getCtx('main'),
        'main',
      )
      this.scene.addLayer(layer)
    }
    {
      const layer = createLastPriceLabelLayer(getCtx('main'))
      this.scene.addLayer(layer)
    }
    {
      const layer = createComparisonLineLayer(getCtx('main'))
      this.scene.addLayer(layer)
    }
    {
      const layer = createLastPriceLineLayer(getCtx('main'))
      this.scene.addLayer(layer)
    }
    {
      const layer = createCustomMarkersLayer(getCtxForCurrentPane)
      this.scene.addLayer(layer)
    }
    {
      const layer = createExtremaMarkersLayer(getCtxForCurrentPane)
      this.scene.addLayer(layer)
    }
    {
      const { layer, plugin } = createMainIndicatorLegendLayer(
        {
          yPaddingPx: opt.yPaddingPx,
          onContext: this.deps.onLegendContext,
        },
        getCtx('main'),
      )
      // 注册进 Manager，使 updateRendererConfig('mainIndicatorLegend') 可切换 renderMode
      this.deps.getRendererPluginManager().register(plugin)
      this.scene.addLayer(layer)
    }
    {
      const layer = createCrosshairLayer(
        {
          getCrosshairState: () => ({
            pos: interaction.crosshairPos,
            activePaneId: interaction.activePaneId,
            isDragging: interaction.isDraggingState(),
            price: interaction.crosshairPrice,
          }),
        },
        getCtxForCurrentPane,
      )
      this.scene.addLayer(layer)
    }
    {
      const yAxisOpts = {
        axisWidth,
        yPaddingPx: opt.yPaddingPx,
        getCrosshair: () => {
          const pos = interaction.crosshairPos
          const price = interaction.crosshairPrice
          const activePaneId = interaction.activePaneId
          if (pos && price !== null) {
            return { y: pos.y, price, activePaneId }
          }
          return null
        },
      }
      this.scene.addLayer(createYAxisStaticLayer(yAxisOpts, getCtxForCurrentPane))
      this.scene.addLayer(createYAxisOverlayLayer(yAxisOpts, getCtxForCurrentPane))
    }
    {
      const leftYAxisOpts = {
        axisWidth: opt.leftAxisWidth,
        yPaddingPx: opt.yPaddingPx,
        getCrosshair: () => {
          const pos = interaction.crosshairPos
          const price = interaction.crosshairPrice
          const activePaneId = interaction.activePaneId
          if (pos && price !== null) {
            return { y: pos.y, price, activePaneId }
          }
          return null
        },
      }
      this.scene.addLayer(createLeftYAxisStaticLayer(leftYAxisOpts, getCtxForCurrentPane))
      this.scene.addLayer(createLeftYAxisOverlayLayer(leftYAxisOpts, getCtxForCurrentPane))
    }
  }

  registerDrawingPlugins(): void {
    const getCtxForCurrentPane = () => this.paneCtxMap.get(this.currentPaneId) ?? null

    {
      const plugin = createDrawingRendererPlugin({ store: this.drawingStore })
      this.deps.getRendererPluginManager().register(plugin)
      const layer = createLayerFromPlugin(plugin, getCtxForCurrentPane, 'global')
      this.scene.addLayer(layer)
    }
    {
      const plugin = createDrawingLabelOverlayPlugin({ store: this.drawingStore })
      this.deps.getRendererPluginManager().register(plugin)
      const layer = createLayerFromPlugin(plugin, getCtxForCurrentPane, 'global')
      this.scene.addLayer(layer)
    }
  }

  getScene(): Scene {
    return this.scene
  }

  getPaneCtxMap(): Map<string, RenderContext> {
    return this.paneCtxMap
  }

  getCurrentPaneId(): string {
    return this.currentPaneId
  }

  getMarkerManager(): MarkerManager {
    return this.markerManager
  }

  getDrawingStore(): DrawingStore {
    return this.drawingStore
  }

  getSettings(): ChartSettings {
    return this.deps.settings$.peek()
  }

  private get settings(): ChartSettings {
    return this.deps.settings$.peek()
  }

  /**
   * 申请绘制：合并重绘级别并写入帧事务，由 rAF 最多 flush 一次。
   *
   * 已有调度时只更新 pending level（Main+Overlay→All），不重复注册 rAF。
   * flush 内：prepareFrameData → sealFrameGeometry → drawWithFrame。
   *
   * @param level - Main 只画主层，Overlay 只画覆盖层（crosshair 等），All 全画
   */
  scheduleDraw(level: UpdateLevel = UpdateLevel.All): void {
    // 已经有待执行的下一帧，只合并 level，不重复 scheduleFlush
    if (this.raf !== null) {
      this.pendingLevel = mergeUpdateLevel(this.pendingLevel, level)
      this.frameTx.writeInput({ level: this.pendingLevel })
      return
    }
    this.pendingLevel = level
    this.frameTx.writeInput({ level })
    // 提交帧，下次 rAF 上屏
    this.frameTx.scheduleFlush()
  }

  /**
   * 立即同步重绘一帧，不走 rAF。
   *
   * 若已有 rAF 挂起：合并本次 level 后同步 flush，把挂起的也带走。
   * 若正处于帧事务非 idle（paint 重入中）：只写输入，调度下一帧，不嵌套 flush。
   * 与 scheduleDraw 的唯一区别：同步还是异步。
   */
  draw(level: UpdateLevel = UpdateLevel.All): void {
    if (this.frameTx.phase !== 'idle') {
      this.pendingLevel = mergeUpdateLevel(this.pendingLevel, level)
      this.frameTx.writeInput({ level: this.pendingLevel })
      this.frameTx.scheduleFlush()
      return
    }

    if (this.raf !== null) {
      this.pendingLevel = mergeUpdateLevel(this.pendingLevel, level)
    } else {
      this.pendingLevel = level
    }
    this.frameTx.writeInput({ level: this.pendingLevel })
    this.frameTx.flush()
  }

  /**
   * 将本帧几何封存到 interaction，供 hover 二分与十字线重算读取。
   * 在 paint 之前调用；引用未变时 interaction 侧应跳过 signal 通知。
   */
  private sealFrameGeometry(frame: FrameContext): void {
    this.deps
      .getInteraction()
      .setKLinePositions(frame.kLinePositions, frame.range, frame.kWidthPx, frame.kLineCenters)
  }

  /** 将 prepareFrameData 的帧几何按 level 画到 canvas，含所有 pane 的 main/overlay/yAxis 及时间轴 */
  private drawWithFrame(level: UpdateLevel, frame: FrameContext | null): void {
    this.markerManager.clear()

    // frame 为空（无数据或首帧），清理画布后跳过绘制
    if (!frame) {
      const dataManager = this.deps.getDataManager()
      if (dataManager.getInternalData().length === 0 && dataManager.getTimeShareData().length === 0)
        this.clearAllCanvases()
      return
    }

    const {
      vp,
      range,
      kLinePositions,
      kLineCenters,
      kBarRects,
      kWidthPx,
      useCachedFrame,
      fiveDayTimeShareGeometry,
    } = frame

    const dataManager = this.deps.getDataManager()
    const mode = this.deps.getActiveMode()
    if (mode.useIndicatorScheduler) {
      // 获取指标管理器实例（持有 scheduler、状态、reconcile 逻辑）
      const indicatorManager = this.deps.getIndicatorManager()
      // 将主图指标列表（含参数）同步给 scheduler，使其在本帧预计算价格区间
      indicatorManager.indicatorSchedulerAccessor.setActiveMainIndicators(
        indicatorManager.indicatorInstancesSignalPeek
          .filter((instance) => instance.role === 'main' && instance.source !== 'mode')
          .map((instance) => ({
            id: instance.indicatorId,
            params: { ...(instance.params as Record<string, string | number | boolean>) },
          })),
      )
    }
    const mainIndicatorRange = useCachedFrame
      ? null
      : this.deps.getIndicatorManager().indicatorSchedulerAccessor.getMainIndicatorPriceRange()
    const hasCrosshair = this.deps.getInteraction().getCrosshairIndex() !== null

    const renderData = frame.data

    // 遍历所有 pane，清 canvas → 构建 RenderContext → scene.paintPane
    const { sharedXAxisLabels, sharedXAxisRanges } = this.renderPanes(
      vp,
      range,
      kLinePositions,
      kLineCenters,
      kBarRects,
      mainIndicatorRange,
      hasCrosshair,
      useCachedFrame,
      level,
      renderData,
      fiveDayTimeShareGeometry,
    )

    this.overlayHadCrosshair = hasCrosshair
    // 画底部时间轴（独立 layer，不进 scene）
    this.renderXAxis(
      vp,
      range,
      kLinePositions,
      kLineCenters,
      kBarRects,
      kWidthPx,
      sharedXAxisLabels,
      sharedXAxisRanges,
      renderData,
      fiveDayTimeShareGeometry,
    )
  }

  /**
   * 计算一帧的 viewport、可见区间、K 线位置。
   *
   * Overlay 时复用 cachedDrawFrame 跳过重算，Main/All 强制刷新缓存。
   * range 变化时调 checkVisibleRangeGapWhenIdle 触发空闲补数据。
   * TimeShare 模式按 plotWidth 平分 bar，覆盖 K 线位置。
   */
  /** viewWidth 为 0 表示尚未完成首帧尺寸 */
  private peekViewport(): Viewport | null {
    if (this.deps.viewport.readonly.viewWidth.peek() === 0) return null
    return this.deps.viewport.readonly.viewport.peek()
  }

  private prepareFrameData(level: UpdateLevel): FrameContext | null {
    const useCachedFrame = level === UpdateLevel.Overlay && this.cachedDrawFrame !== null

    const vp = useCachedFrame ? this.cachedDrawFrame!.viewport : this.peekViewport()
    if (!vp) return null

    const internalData = [...this.deps.getDataManager().getRenderData()]
    if (internalData.length === 0) return null

    const opt = this.deps.getOption()
    // 可见区间 SSOT 在 viewportState：clamped 可索引；raw 含扩窗（start 可能为 -1）
    const range = useCachedFrame
      ? this.cachedDrawFrame!.range
      : this.deps.viewport.readonly.visibleRange.peek()
    const rawRange = useCachedFrame
      ? (this._prevFrameRange?.raw ?? range)
      : this.deps.viewport.readonly.rawVisibleRange.peek()

    const dataManager = this.deps.getDataManager()
    const mode = this.deps.getActiveMode()
    if (
      !useCachedFrame &&
      (!this._prevFrameRange ||
        range.start !== this._prevFrameRange.visible.start ||
        range.end !== this._prevFrameRange.visible.end ||
        rawRange.start !== this._prevFrameRange.raw.start ||
        rawRange.end !== this._prevFrameRange.raw.end)
    ) {
      this._prevFrameRange = { visible: range, raw: rawRange }
      this.checkVisibleRangeGapWhenIdle()
    }

    let kLinePositions: KLinePositions
    let kLineCenters: number[]
    let kBarRects: Array<{ x: number; width: number }>
    let kWidthPx: number
    let fiveDayTimeShareGeometry: FiveDayTimeShareGeometry | null

    if (useCachedFrame) {
      kLinePositions = this.cachedDrawFrame!.kLinePositions
      kLineCenters = this.cachedDrawFrame!.kLineCenters
      kBarRects = this.cachedDrawFrame!.kBarRects
      kWidthPx = this.cachedDrawFrame!.kWidthPx
      fiveDayTimeShareGeometry = this.cachedDrawFrame!.fiveDayTimeShareGeometry
    } else {
      const physConfig = getPhysicalKLineConfig(opt.kWidth, opt.kGap, vp.dpr)
      // bar 宽度取奇数，保证 center 对齐整数像素
      const barWidthPx = calcKBarWidthPx(physConfig.unitPx)

      kLineCenters = this.calcKLineCenters(range)
      kLinePositions = new Array(kLineCenters.length)
      kBarRects = new Array(kLineCenters.length)

      for (let i = 0; i < kLineCenters.length; i++) {
        const centerPx = Math.round(kLineCenters[i]! * vp.dpr)
        const leftPx = centerPx - (physConfig.kWidthPx - 1) / 2
        kLinePositions[i] = leftPx / vp.dpr

        const barLeftPx = centerPx - (barWidthPx - 1) / 2
        kBarRects[i] = { x: barLeftPx / vp.dpr, width: barWidthPx / vp.dpr }
      }

      fiveDayTimeShareGeometry = null
      const dataView = this.deps.dataView$.peek()
      // 五日分时：按交易日和 session 槽位生成唯一世界坐标，窄屏时内容宽度允许滚动。
      if (dataView === ChartDataViewId.FiveDayTimeShare) {
        const timeShareRange = dataManager.getTimeShareRange()
        const marketSession =
          'marketSession' in mode && mode.marketSession
            ? (mode as { marketSession: typeof ASHARE_MARKET_SESSION }).marketSession
            : ASHARE_MARKET_SESSION
        const layout = timeShareRange
          ? computeFiveDayTimeShareGeometry({
              range: timeShareRange,
              marketSession,
              contentWidth: this.deps.viewport.readonly.contentWidth.peek(),
              dpr: vp.dpr,
            })
          : null
        if (layout) {
          kLineCenters = layout.centers
          kLinePositions = new Array(layout.centers.length)
          kBarRects = new Array(layout.centers.length)
          for (let i = 0; i < layout.centers.length; i++) {
            const centerPx = Math.round(layout.centers[i]! * vp.dpr)
            kLinePositions[i] = (centerPx - Math.floor(layout.kWidthPx / 2)) / vp.dpr
            kBarRects[i] = {
              x: (centerPx - (Math.round(layout.barWidth * vp.dpr) - 1) / 2) / vp.dpr,
              width: layout.barVisible[i] ? layout.barWidth : 0,
            }
          }
          kWidthPx = layout.kWidthPx
          fiveDayTimeShareGeometry = layout.geometry
        } else {
          kWidthPx = getPhysicalKLineConfig(opt.kWidth, opt.kGap, vp.dpr).kWidthPx
        }
      } else if (mode.debugName === 'TimeShare') {
        const count = kLineCenters.length
        const marketSession =
          'marketSession' in mode && mode.marketSession
            ? (mode as { marketSession: typeof ASHARE_MARKET_SESSION }).marketSession
            : ASHARE_MARKET_SESSION
        const layout = computeTimeShareXLayout({
          arrivedCount: count,
          sessionSlots: resolveMarketSessionSlots(marketSession),
          totalWidth: this.deps.viewport.readonly.contentWidth.peek(),
          dpr: vp.dpr,
          slotIndices: internalData
            .slice(range.start, range.end)
            .map(
              (item, index) => resolveTimestampSessionSlot(item.timestamp, marketSession) ?? index,
            ),
        })
        if (layout) {
          const barWidthPx = Math.round(layout.barWidth * vp.dpr)
          for (let i = 0; i < count; i++) {
            const centerPx = Math.round(layout.centers[i]! * vp.dpr)
            kLineCenters[i] = centerPx / vp.dpr
            // 兼容需要起点的旧接口；分时绘制与交互均以 kLineCenters 为准。
            kLinePositions[i] = (centerPx - Math.floor(layout.kWidthPx / 2)) / vp.dpr
            kBarRects[i] = {
              x: (centerPx - (barWidthPx - 1) / 2) / vp.dpr,
              width: layout.barVisible[i] ? layout.barWidth : 0,
            }
          }
          kWidthPx = layout.kWidthPx
        } else {
          kWidthPx = getPhysicalKLineConfig(opt.kWidth, opt.kGap, vp.dpr).kWidthPx
        }
      } else {
        kWidthPx = getPhysicalKLineConfig(opt.kWidth, opt.kGap, vp.dpr).kWidthPx
      }
      this.cachedDrawFrame = {
        viewport: { ...vp },
        range: { ...range },
        kLinePositions,
        kLineCenters,
        kBarRects,
        kWidthPx,
        fiveDayTimeShareGeometry,
      }
    }

    return {
      vp,
      range,
      kLinePositions,
      kLineCenters,
      kBarRects,
      kWidthPx,
      useCachedFrame,
      data: internalData,
      zoomLevel: this.deps.zoom.readonly.zoomLevel.peek(),
      zoomLevelCount: this.deps.options.readonly.options.peek().zoomLevelCount,
      fiveDayTimeShareGeometry,
    }
  }

  private clearAxisCtx(
    ctx: CanvasRenderingContext2D,
    dpr: number,
    width: number,
    height: number,
  ): void {
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, width, height + 2 / dpr)
  }

  clearAllCanvases(): void {
    const vp = this.peekViewport()
    if (!vp) return
    for (const r of this.deps.getPaneRenderers()) {
      const { mainCtx, overlayCtx, yAxisCtx, yAxisOverlayCtx, leftAxisCtx, leftAxisOverlayCtx } =
        r.getContexts()
      const pane = r.getPane()
      mainCtx?.clearRect(0, 0, vp.plotWidth + 1, pane.height + 2 / vp.dpr)
      overlayCtx?.clearRect(0, 0, vp.plotWidth + 1, pane.height + 2 / vp.dpr)
      yAxisCtx?.clearRect(
        0,
        0,
        (yAxisCtx.canvas?.width ?? 0) / vp.dpr || vp.plotWidth + 1,
        pane.height + 2 / vp.dpr,
      )
      yAxisOverlayCtx?.clearRect(
        0,
        0,
        (yAxisOverlayCtx.canvas?.width ?? 0) / vp.dpr || vp.plotWidth + 1,
        pane.height + 2 / vp.dpr,
      )
      if (leftAxisCtx) {
        const laW = (leftAxisCtx.canvas?.width ?? 0) / vp.dpr || vp.plotWidth + 1
        leftAxisCtx.clearRect(0, 0, laW, pane.height + 2 / vp.dpr)
      }
      if (leftAxisOverlayCtx) {
        const laW = (leftAxisOverlayCtx.canvas?.width ?? 0) / vp.dpr || vp.plotWidth + 1
        leftAxisOverlayCtx.clearRect(0, 0, laW, pane.height + 2 / vp.dpr)
      }
    }
    const xCtx = this.xAxisCtx
    if (xCtx) {
      const xW = xCtx.canvas.width
      const xH = xCtx.canvas.height
      xCtx.clearRect(0, 0, xW, xH)
    }
    // M2 hybrid：可见 WebGPU canvas 不经 2D clearRect，需显式 transparent clear
    const scene = this.deps.getSceneRenderer()
    if (scene.caps.name === 'webgpu') {
      scene.surface.clearRegion({
        x: 0,
        y: 0,
        width: vp.plotWidth,
        height: vp.plotHeight,
        dpr: vp.dpr,
      })
    }
  }

  /** 遍历所有 pane，逐 pane 清 canvas → 构建 RenderContext → beginFrame → scene.paintPane，所有 pane 结束后 endFrame 统一提交 GPU / 时间轴 */
  private renderPanes(
    vp: Viewport,
    range: VisibleRange,
    kLinePositions: KLinePositions,
    kLineCenters: number[],
    kBarRects: Array<{ x: number; width: number }>,
    mainIndicatorRange: { min: number; max: number } | null,
    hasCrosshair: boolean,
    useCachedFrame: boolean,
    level: UpdateLevel,
    renderData: MarketSeriesData[],
    fiveDayTimeShareGeometry: FiveDayTimeShareGeometry | null,
  ): { sharedXAxisLabels: XAxisLabel[]; sharedXAxisRanges: XAxisRange[] } {
    // 跨 pane 共享的 Y/X 轴 labels 和 ranges（各 layer 写入，时间轴层读取）
    const sharedYAxisLabels: YAxisLabel[] = []
    const sharedXAxisLabels: XAxisLabel[] = []
    const sharedYAxisRanges: YAxisRange[] = []
    const sharedXAxisRanges: XAxisRange[] = []
    const indicatorStateReader = this.deps.getIndicatorManager().createRenderStateReader()

    const dataManager = this.deps.getDataManager()
    const mode = this.deps.getActiveMode()

    // main canvas 只画非 overlay 角色；overlay canvas 只画 overlay 角色
    const MAIN_CANVAS_ROLES: readonly LayerRole[] = [
      'background',
      'primary',
      'indicator',
      'component',
      'drawing',
    ]

    // 遍历主图 pane 和所有子图 pane，每个 pane 有一组独立 canvas 以及对应更新级别（main/overlay/yAxis）
    for (const renderer of this.deps.getPaneRenderers()) {
      const pane = renderer.getPane()
      const { mainCtx, overlayCtx, yAxisCtx, yAxisOverlayCtx, leftAxisCtx, leftAxisOverlayCtx } =
        renderer.getContexts()

      // 非缓存帧：更新 pane Y 轴范围；比较视图下以可见折线极值为准
      if (!useCachedFrame) {
        const comparisonActive = dataManager.getComparisonSpecs().length > 0

        if (pane.id === 'main' && comparisonActive) {
          // 比较视图：y 轴范围 = 可见区折线（主商品 close + 比较商品等价价）极值，
          // 随滚动/缩放逐帧重算，缩放与平移的 clamp 上下限同步跟随折线
          const lineRange = dataManager.getComparisonViewLineRange(range)
          if (lineRange) {
            const linePriceRange = { maxPrice: lineRange.max, minPrice: lineRange.min }
            pane.priceRange = linePriceRange
            pane.yAxis.setRange(linePriceRange)
          } else {
            mode.updatePaneRange(pane as any, range, dataManager, null)
          }
          // 绕过 Pane.updateRange 时需手动补齐 percent 基准价
          const internalData = dataManager.getInternalData()
          const baseIdx = Math.max(0, range.start)
          pane.yAxis.setBasePrice(internalData[baseIdx]?.close ?? null)
        } else {
          const indicatorRange =
            pane.role === 'price' && mode.useIndicatorScheduler ? mainIndicatorRange : null
          mode.updatePaneRange(pane as any, range, dataManager, indicatorRange)
        }

        if (pane.id === 'main' && this.settings.disableMainPaneVerticalScroll) {
          pane.yAxis.resetTransform()
        }
      }

      // 根据 UpdateLevel 决定清哪些 canvas
      const shouldUpdateMain = level === UpdateLevel.Main || level === UpdateLevel.All
      // Overlay 单独重绘：有十字线才画；overlayHadCrosshair 保证十字线消失时最后清一次
      const shouldUpdateOverlay =
        level === UpdateLevel.All ||
        (level === UpdateLevel.Overlay && (hasCrosshair || this.overlayHadCrosshair))

      // 清 main canvas
      if (shouldUpdateMain && mainCtx) {
        mainCtx.setTransform(1, 0, 0, 1, 0, 0)
        mainCtx.scale(vp.dpr, vp.dpr)
        mainCtx.clearRect(0, 0, vp.plotWidth + 1, pane.height + 2 / vp.dpr)
      }

      // 清 overlay canvas
      if (shouldUpdateOverlay && overlayCtx) {
        const overlayWidth = overlayCtx.canvas.width / vp.dpr
        overlayCtx.setTransform(1, 0, 0, 1, 0, 0)
        overlayCtx.scale(vp.dpr, vp.dpr)
        overlayCtx.clearRect(0, 0, overlayWidth + 1, pane.height + 2 / vp.dpr)
      }

      // 清 Y 轴静态 canvas（Main/All）
      if (shouldUpdateMain && yAxisCtx) {
        const yAxisWidth = yAxisCtx.canvas.width / vp.dpr
        this.clearAxisCtx(yAxisCtx, vp.dpr, yAxisWidth, pane.height)
      }
      if (shouldUpdateMain && leftAxisCtx) {
        const leftAxisWidth = leftAxisCtx.canvas.width / vp.dpr
        this.clearAxisCtx(leftAxisCtx, vp.dpr, leftAxisWidth, pane.height)
      }
      // 清 Y 轴动态 canvas（Overlay/All）
      if (shouldUpdateOverlay && yAxisOverlayCtx) {
        const yAxisWidth = yAxisOverlayCtx.canvas.width / vp.dpr
        this.clearAxisCtx(yAxisOverlayCtx, vp.dpr, yAxisWidth, pane.height)
      }
      if (shouldUpdateOverlay && leftAxisOverlayCtx) {
        const leftAxisWidth = leftAxisOverlayCtx.canvas.width / vp.dpr
        this.clearAxisCtx(leftAxisOverlayCtx, vp.dpr, leftAxisWidth, pane.height)
      }

      // 构造本 pane 的 RenderContext，供所有 layer 读取
      const opt = this.deps.getOption()
      const context: RenderContext = {
        ctx: mainCtx!,
        overlayCtx: overlayCtx ?? undefined,
        pane: wrapPaneInfo(pane),
        data: renderData,
        period: dataManager.currentPeriod,
        dataView: this.deps.dataView$(),
        timeShareRange: dataManager.getTimeShareRange() ?? undefined,
        fiveDayTimeShareGeometry: fiveDayTimeShareGeometry ?? undefined,
        comparisonData: dataManager.getComparisonData(),
        comparisonSymbols: dataManager.getComparisonSpecs(),
        comparisonColors: dataManager.getComparisonColors(),
        primarySymbol: dataManager.symbols.peek()[0]?.symbol,
        primarySymbolName: dataManager.symbols.peek()[0]?.instrument?.name,
        range,
        scrollLeft: vp.scrollLeft,
        kWidth: opt.kWidth,
        kGap: opt.kGap,
        dpr: vp.dpr,
        paneWidth: vp.plotWidth,
        kLinePositions,
        kLineCenters,
        kBarRects,
        indicatorStateReader,
        markerManager: this.markerManager,
        crosshairIndex: this.deps.getInteraction().getCrosshairIndex(),
        yAxisCtx: yAxisCtx ?? undefined,
        yAxisOverlayCtx: yAxisOverlayCtx ?? undefined,
        leftAxisCtx: leftAxisCtx ?? undefined,
        leftAxisOverlayCtx: leftAxisOverlayCtx ?? undefined,
        zoomLevel: this.deps.zoom.readonly.zoomLevel.peek(),
        zoomLevelCount: this.deps.options.readonly.options.peek().zoomLevelCount,
        viewport: {
          scrollLeft: vp.scrollLeft,
          plotWidth: vp.plotWidth,
          plotHeight: vp.plotHeight,
        },
        settings: {
          ...this.settings,
          // 分时昨收优先读 series 元数据，settings 作回退
          preClose:
            dataManager.getTimeSharePreClose() ?? (this.settings.preClose as number | undefined),
        },
        yAxisLabels: sharedYAxisLabels,
        xAxisLabels: sharedXAxisLabels,
        yAxisRanges: sharedYAxisRanges,
        xAxisRanges: sharedXAxisRanges,
        theme: this.deps.theme$.peek(),
        isAsiaMarket: this.settings.isAsiaMarket as boolean,
        colorPresetSettings: this.settings.colorPresetSettings,
        monthKeys: dataManager.getMonthKeys() ?? undefined,
        dayKeys: dataManager.getDayKeys() ?? undefined,
      }

      // 计算本 pane 的 Y 轴刻度（等分 + yToPrice 映射）
      {
        const pt = pane.yAxis.getPaddingTop()
        const pb = pane.yAxis.getPaddingBottom()
        const yStart = pt
        const yEnd = Math.max(pt, pane.height - pb)
        const viewH = Math.max(0, yEnd - yStart)
        const tickCount = Math.max(2, calculateTickCount(pane.height, pane.role === 'price'))
        const yAxisTicks: YAxisTick[] = []
        for (let i = 0; i < tickCount; i++) {
          const t = tickCount <= 1 ? 0 : i / (tickCount - 1)
          const y = yStart + t * viewH
          const value = pane.yAxis.yToPrice(y)
          yAxisTicks.push({ y, value })
        }
        context.yAxisTicks = yAxisTicks
      }

      this.paneCtxMap.set(pane.id, context)
      this.currentPaneId = pane.id

      const region = { x: 0, y: pane.top, width: vp.plotWidth, height: pane.height, dpr: vp.dpr }
      const sceneRenderer = this.deps.getSceneRenderer()
      const paneRole = (pane.id === 'main' ? 'main' : 'sub') as PaneRole
      // 画 main canvas（非 overlay 角色 layer）
      if (shouldUpdateMain) {
        // 标记后续 GPU 绘制属于此 region
        sceneRenderer.beginFrame(region)
        // 遍历 Scene 中该 pane 的可见 layer，逐层 paint
        this.scene.paintPane(
          {
            renderer: sceneRenderer,
            region,
            paneRole,
            paneId: pane.id,
            frameNumber: this.frameCount++,
            deltaMs: 0,
          },
          MAIN_CANVAS_ROLES,
        )
      }
      // 画 overlay canvas（仅 overlay 角色 layer）；All 级也画
      if (shouldUpdateOverlay) {
        sceneRenderer.beginFrame(region)
        this.scene.paintPane(
          {
            renderer: sceneRenderer,
            region,
            paneRole,
            paneId: pane.id,
            frameNumber: this.frameCount++,
            deltaMs: 0,
          },
          ['overlay'],
        )
      }
    }

    // 所有 pane 绘制完成后统一提交 GPU（WebGPU 单次 queue.submit，WebGL 单次 flush）
    this.deps.getSceneRenderer().endFrame()

    return { sharedXAxisLabels, sharedXAxisRanges }
  }

  private renderXAxis(
    vp: Viewport,
    range: VisibleRange,
    kLinePositions: KLinePositions,
    kLineCenters: number[],
    kBarRects: Array<{ x: number; width: number }>,
    kWidthPx: number,
    sharedXAxisLabels: XAxisLabel[],
    sharedXAxisRanges: XAxisRange[],
    renderData: MarketSeriesData[],
    fiveDayTimeShareGeometry: FiveDayTimeShareGeometry | null,
  ): void {
    const dom = this.deps.getDom()
    const xAxisCtx = this.xAxisCtx ?? dom.xAxisCanvas.getContext('2d')
    if (!this.xAxisCtx) {
      this.xAxisCtx = xAxisCtx
    }
    if (xAxisCtx && this.timeAxisLayer) {
      const opt = this.deps.getOption()
      const dataManager = this.deps.getDataManager()
      const activeMode = this.deps.getActiveMode()
      const marketSession =
        'marketSession' in activeMode
          ? (activeMode as { marketSession: typeof ASHARE_MARKET_SESSION }).marketSession
          : undefined
      this.timeAxisCtx = {
        ctx: xAxisCtx,
        pane: {
          id: 'xAxis',
          role: 'auxiliary',
          capabilities: {
            showPriceAxisTicks: false,
            showCrosshairPriceLabel: false,
            candleHitTest: false,
            supportsPriceTranslate: false,
          },
          top: 0,
          height: opt.bottomAxisHeight,
          yAxis: {
            priceToY: () => 0,
            yToPrice: () => 0,
            getPaddingTop: () => 0,
            getPaddingBottom: () => 0,
            getPriceOffset: () => 0,
            getDisplayRange: (baseRange) => baseRange ?? { maxPrice: 0, minPrice: 0 },
            getScaleType: () => 'linear' as const,
            getBasePrice: () => null,
            toPercent: () => 0,
            fromPercent: () => 0,
            getDisplayPercentRange: () => ({ minPct: 0, maxPct: 0 }),
          },
          priceRange: { maxPrice: 0, minPrice: 0 },
        },
        period: dataManager.currentPeriod,
        marketSession,
        data: renderData,
        dataView: this.deps.dataView$.peek(),
        timeShareRange: dataManager.getTimeShareRange() ?? undefined,
        fiveDayTimeShareGeometry: fiveDayTimeShareGeometry ?? undefined,
        range,
        scrollLeft: vp.scrollLeft,
        kWidth: opt.kWidth,
        kGap: opt.kGap,
        dpr: vp.dpr,
        paneWidth: vp.plotWidth,
        kLinePositions,
        kLineCenters,
        kBarRects,
        xAxisCtx,
        viewport: {
          scrollLeft: vp.scrollLeft,
          plotWidth: vp.plotWidth,
          plotHeight: vp.plotHeight,
        },
        yAxisLabels: [],
        xAxisLabels: sharedXAxisLabels,
        xAxisRanges: sharedXAxisRanges,
        theme: this.deps.theme$.peek(),
        isAsiaMarket: this.settings.isAsiaMarket as boolean,
        colorPresetSettings: this.settings.colorPresetSettings,
        monthKeys: dataManager.getMonthKeys() ?? undefined,
        dayKeys: dataManager.getDayKeys() ?? undefined,
      }
      const paintCtx: PaintContext = {
        renderer: this.deps.getSceneRenderer(),
        region: { x: 0, y: 0, width: vp.plotWidth, height: opt.bottomAxisHeight, dpr: vp.dpr },
        paneRole: 'global',
        paneId: 'xAxis',
        frameNumber: this.frameCount++,
        deltaMs: 0,
      }
      this.timeAxisLayer.paint(paintCtx)
    }
  }

  /** 按物理像素网格计算 K 线中心点，后续几何均由中心点派生。 */
  private calcKLineCenters(range: VisibleRange): number[] {
    const { start, end } = range
    const count = end - start

    if (count <= 0) return []

    const dpr = this.deps.viewport.readonly.dpr.peek()
    const opt = this.deps.getOption()
    const { unitPx, startXPx, kWidthPx } = getPhysicalKLineConfig(opt.kWidth, opt.kGap, dpr)

    const centers: number[] = new Array(count)
    const halfWidthPx = (kWidthPx - 1) / 2

    for (let i = 0; i < count; i++) {
      const dataIndex = start + i
      const leftPx = startXPx + dataIndex * unitPx
      centers[i] = (leftPx + halfWidthPx) / dpr
    }

    return centers
  }

  private checkVisibleRangeGapWhenIdle(): void {
    if (this.deps.getInteraction().isPointerDown()) return
    this.deps.getDataManager().checkVisibleRangeGap()
  }

  clearCachedFrame(): void {
    this.cachedDrawFrame = null
  }

  destroy(): void {
    if (this.raf !== null) {
      cancelAnimationFrame(this.raf)
      this.raf = null
    }
    this.cachedDrawFrame = null
    this.xAxisCtx = null
    this.scene.dispose()
    this.paneCtxMap.clear()
  }
}
