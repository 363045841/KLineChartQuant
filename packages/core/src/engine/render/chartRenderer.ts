import type { SymbolSpec } from '../../controllers/types.js'
import type { ChartSettings } from '../../foundation/config/chartSettings.js'
import { PRICE_AXIS_RANGE_MODE } from '../../foundation/config/priceAxisRangeMode.js'
import type {
  AxisLabelsFrame,
  FiveDayTimeShareGeometry,
  PluginHostImpl,
  RenderContext,
  XAxisRange,
  YAxisRange,
} from '../../foundation/plugin/index.js'
import { wrapPaneInfo } from '../../foundation/plugin/index.js'
import {
  createFrameTransaction,
  type FrameTransaction,
} from '../../foundation/reactivity/frameTransaction.js'
import type { ReadonlySignal } from '../../foundation/reactivity/signal.js'
import type { ChartSeriesDatum, KLineData } from '../../foundation/types/price.js'
import { ScaleType } from '../../foundation/types/scaleType.js'
import { type Clock, systemClock } from '../../foundation/utils/clock.js'
import {
  createDisplayTimeFormatter,
  type DisplayTimeFormatter,
  type DisplayTimeZoneSetting,
  resolveDisplayTimeZone,
} from '../../foundation/utils/dateFormat.js'
import { ASHARE_MARKET_SESSION } from '../../foundation/utils/timeShareAxisLabels.js'
import type { Renderer } from '../../rendering/render/Renderer.js'
import { createScene } from '../../rendering/scene/createScene.js'
import type {
  FramePaint,
  Layer,
  LayerRole,
  Scene,
  SceneFrame,
} from '../../rendering/scene/types.js'
import {
  createAxisLabelsFrame,
  formatLastPriceCountdown,
  getLastPriceRemainingMs,
  registerAxisLabel,
} from '../axisLabels/index.js'
import type {
  ChartDom,
  ChartOptions,
  KLinePositions,
  PaneSpec,
  Viewport,
  ViewportState,
} from '../chartTypes.js'
import { InteractionController } from '../controller/interaction.js'
import { ChartDataManager } from '../data/chartDataManager.js'
import {
  createDrawingLayer,
  createDrawingSessionLayer,
  DrawingDefinitionRegistry,
  type DrawingSelectionMarquee,
  DrawingStore,
  type DrawingStoreDeps,
  projectDrawingsForFrame,
  registerDefaultDrawingDefinitions,
} from '../drawing/index.js'
import { ChartIndicatorManager } from '../indicators/chartIndicatorManager.js'
import type { VisibleRange } from '../layout/pane.js'
import { UpdateLevel } from '../layout/pane.js'
import {
  type CustomMarkerEntity,
  MarkerManager,
  type MarkerManagerDeps,
} from '../marker/registry.js'
import type { ChartModeHandler } from '../modes/index.js'
import { PaneRenderer } from '../paneRenderer.js'
import { createCandleLayer } from '../renderers/candle.js'
import { createComparisonLineLayer } from '../renderers/comparisonLine.js'
import { createCrosshairLayer } from '../renderers/crosshair.js'
import { createCustomMarkersLayer } from '../renderers/customMarkers.js'
import { createExtremaMarkersLayer } from '../renderers/extremaMarkers.js'
import { createFiveDayTimeShareLayer } from '../renderers/fiveDayTimeShare.js'
import { createGridLinesLayer } from '../renderers/gridLines.js'
import { createMainIndicatorLegendLayer } from '../renderers/Indicator/mainIndicatorLegend/impl/createMainIndicatorLegendLayer.js'
import { createTimeAxisLayer } from '../renderers/timeAxis.js'
import { createTimeShareLayer } from '../renderers/timeShare.js'
import {
  createYAxisOverlayRendererLayer,
  createYAxisStaticRendererLayer,
} from '../renderers/yAxis.js'
import type { MainPriceAxisStateModule } from '../state/mainPriceAxisState.js'
import type { ChartDataView } from '../state/modeState.js'
import type { OptionsStateModule } from '../state/optionsState.js'
import type { ViewportStateModule } from '../state/viewportState.js'
import type { ZoomStateModule } from '../state/zoomState.js'
import { createYAxisTicks } from '../utils/axisTicks.js'
import { findVisibleBarRange } from '../utils/visibleBarIndex.js'
import {
  computeVisiblePriceExtrema,
  type VisiblePriceExtrema,
} from '../utils/visiblePriceExtrema.js'

type ResolvedChartOptions = Omit<ChartOptions, 'kWidth' | 'kGap'> & {
  kWidth: number
  kGap: number
}

/** 帧内共享的时间与倒计时派生结果。 */
type FrameCountdown = {
  now: number
  remainingMs: number | null
  text: string | null
}

/** 一帧绘制几何与数据；大数组结构共享，render 只读。 */
type FrameContext = {
  viewSnapshot: import('../view/types.js').ViewSnapshot
  /** 当前帧重新派生的时间与倒计时，不进入几何缓存。 */
  countdown: FrameCountdown
  /** 视口（scrollLeft、plotWidth、dpr 等） */
  vp: Viewport
  /** 可见 K 线起止索引 */
  range: VisibleRange
  /** 含左右扩窗的可见区间，仅用于数据缺口检测。 */
  rawRange: VisibleRange
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
  data: ChartSeriesDatum[]
  /** 与本帧主序列快照对应的提交版本。 */
  dataRevision: number
  /** 当前缩放级别索引 */
  zoomLevel: number
  /** 缩放级别总数 */
  zoomLevelCount: number
  /** 五日分时供所有 renderer 和交互共享的帧级几何。 */
  fiveDayTimeShareGeometry: FiveDayTimeShareGeometry | null
  /** 帧准备阶段生成的真正可视 K 线极值。 */
  visiblePriceExtrema: VisiblePriceExtrema | null
  /** 跨数量级时生成的低频右轴测量意图；由 seal 阶段提交。 */
  rightAxisWidthMeasurement: VisiblePriceExtrema | null
}

/** 帧事务输入：合并多次 scheduleDraw 的 level */
type FrameDrawInput = {
  level: UpdateLevel
}

/** 单帧快照，frame 为 null 表示无可画数据 */
type FrameDrawSnapshot = {
  countdown: FrameCountdown
  generation: number
  level: UpdateLevel
  frame: FrameContext | null
  skip: boolean
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

/** 在绘制帧内提交 viewport 的原生滚动位置，跳过无变化写入。 */
export interface RendererDependencies {
  /** 帧开始时读取一次的时间源，测试可注入。 */
  clock?: Clock
  /** 当前主品种的市场时段，倒计时显示与刷新共用。 */
  getMarketSession: () => typeof ASHARE_MARKET_SESSION | undefined
  getDom: () => ChartDom
  getOption: () => ResolvedChartOptions
  getPaneRenderers: () => PaneRenderer[]
  getInteraction: () => InteractionController
  getSceneRenderer: () => Renderer
  getPluginHost: () => PluginHostImpl
  /** 当前数据视图应显示的主图指标 ID 快照。 */
  getVisibleMainIndicatorIds: () => ReadonlyArray<string>
  /** 生效主题 SSOT */
  theme$: ReadonlySignal<'light' | 'dark'>
  /** zoomLevel / kWidth SSOT */
  zoom: ZoomStateModule
  /** zoomLevelCount 等 options SSOT */
  options: OptionsStateModule
  /** scroll / dpr / plot 几何 SSOT */
  viewport: ViewportStateModule
  /** 由 Chart 的 ViewportScrollBridge 在 render frame 内提交原生滚动。 */
  commitViewportScroll: (targetScrollLeft: number) => void
  getDataManager: () => ChartDataManager
  getIndicatorManager: () => ChartIndicatorManager
  getActiveMode: () => ChartModeHandler
  dataView$: ReadonlySignal<ChartDataView>
  settings$: ReadonlySignal<ChartSettings>
  mainPriceAxis: MainPriceAxisStateModule
  customMarkers$: MarkerManagerDeps['customMarkers$']
  drawings$: DrawingStoreDeps['drawings$']
  selectedDrawingIds$: DrawingStoreDeps['selectedDrawingIds$']
  getOverlay?: DrawingStoreDeps['getOverlay']
  /** 绘图交互会话中的临时框选，不进入持久化图元列表。 */
  getSelectionMarquee?: () => DrawingSelectionMarquee | null
  /** 主图图例上下文发布（dom / external 均触发；draw 内回调） */
  onLegendRows?: RenderContext['publishLegendRows']
  /** 无可绘制数据或清空图表时同步释放 DOM 标题。 */
  onClearLegendRows?: () => void
  onLegendContext?: (
    ctx: import('../renderers/Indicator/mainIndicatorLegend/types.js').LegendTemplateContext | null,
  ) => void
  /** 可视区极值跨数量级时才请求右轴实测与布局更新。 */
  commitRightAxisWidthMeasurement?: (extrema: VisiblePriceExtrema) => void
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
  /** 最新价签的秒级倒计时计时器；只请求 overlay 重绘。 */
  private lastPriceCountdownTimer: ReturnType<typeof setTimeout> | null = null

  readonly markerManager: MarkerManager
  readonly drawingStore: DrawingStore
  private readonly drawingDefinitions = new DrawingDefinitionRegistry()
  private xAxisCtx: CanvasRenderingContext2D | null = null

  private cachedDrawFrame: {
    viewport: Viewport
    range: VisibleRange
    kLinePositions: KLinePositions
    kLineCenters: number[]
    kBarRects: Array<{ x: number; width: number }>
    kWidthPx: number
    fiveDayTimeShareGeometry: FiveDayTimeShareGeometry | null
    visiblePriceExtrema: VisiblePriceExtrema | null
  } | null = null

  private scene: Scene<RenderContext>
  private frameCount = 0
  private paneCtxMap = new Map<string, RenderContext>()
  private currentPaneId = 'main'
  private timeAxisLayer: Layer<RenderContext> | null = null
  private displayTimeZoneSetting: DisplayTimeZoneSetting = 'UTC'
  private displayTimeFormatter: DisplayTimeFormatter = createDisplayTimeFormatter('UTC')
  private _prevFrameRange: { visible: VisibleRange; raw: VisibleRange } | null = null
  /** 上次已测量右轴的可视区绝对值数量级。 */
  private measuredVisiblePriceMagnitudeOrder: number | null = null
  /** 上一帧已提交的主层与交互层内容输入。 */
  private paintedMainVersion: readonly unknown[] | null = null
  private disposed = false
  private schedulingStopped = false
  private paintedOverlayVersion: readonly unknown[] | null = null
  /** 正式绘图层的输入版本；会话坐标变化仅刷新动态覆盖层。 */
  private paintedDrawingVersion: readonly unknown[] | null = null
  /** 保留正式图元的轴标签，动态帧重放到本帧收集器，随 Pane 回收。 */
  private drawingAxisLabels = new WeakMap<PaneRenderer, AxisLabelsFrame>()

  /** 按值比较帧输入，避免 viewport 每次派生新对象造成无效重绘。 */
  private sameVersion(previous: readonly unknown[] | null, next: readonly unknown[]): boolean {
    return (
      previous !== null &&
      previous.length === next.length &&
      previous.every((value, index) => Object.is(value, next[index]))
    )
  }

  /** 捕获主画布的绘制输入。 */
  private mainContentVersion(): readonly unknown[] {
    const vp = this.peekViewport()
    const opt = this.deps.getOption()
    const layers = this.scene.layers.peek()
    return [
      this.deps.getSceneRenderer(),
      this.deps.getDataManager().getRenderDataRevision(),
      ...this.deps.getDataManager().getComparisonContentInputs(),
      this.deps.getDataManager().currentPeriod,
      this.deps.dataView$.peek(),
      vp?.scrollLeft,
      vp?.plotWidth,
      vp?.plotHeight,
      vp?.viewWidth,
      vp?.viewHeight,
      vp?.dpr,
      opt.kWidth,
      opt.kGap,
      opt.rightAxisWidth,
      opt.leftAxisWidth,
      opt.bottomAxisHeight,
      this.deps.options.readonly.options.peek(),
      this.deps.settings$.peek(),
      this.deps.theme$.peek(),
      this.deps.mainPriceAxis.readonly.paneRanges.peek(),
      this.deps.getIndicatorManager().getRenderStatesSnapshot(),
      // Legend 顺序也属于展示输入，实例重排无需计算变化即可刷新 DOM。
      this.deps.getIndicatorManager().indicatorsComputed.peek(),
      this.deps.customMarkers$.peek(),
      this.deps.getActiveMode(),
      layers,
      ...layers.map((layer) => layer.visible),
      ...this.deps.getPaneRenderers().flatMap((renderer) => {
        const pane = renderer.getPane()
        const axis = pane.yAxis
        return [
          renderer,
          pane.id,
          pane.top,
          pane.height,
          pane.role,
          axis.getScaleType(),
          axis.getPaddingTop(),
          axis.getPaddingBottom(),
          axis.getBasePrice(),
        ]
      }),
    ]
  }

  /** 捕获交互画布与时间轴的输入；倒计时以秒为单位变化。 */
  private overlayContentVersion(countdown: string | null): readonly unknown[] {
    const interaction = this.deps.getInteraction()
    const pos = interaction.crosshairPos
    return [
      pos?.x,
      pos?.y,
      interaction.crosshairIndex,
      interaction.crosshairPrice,
      interaction.activePaneId,
      interaction.isDraggingState(),
      interaction.hoveredIndex,
      interaction.tooltipPos.x,
      interaction.tooltipPos.y,
      interaction.tooltipAnchorPlacement,
      this.deps.drawings$.peek(),
      this.deps.selectedDrawingIds$.peek(),
      // getOverlay 会新建数组，按图元引用比较才能同时捕获移动和避免空数组误失效。
      ...(this.deps.getOverlay?.() ?? []),
      this.deps.getSelectionMarquee?.(),
      countdown,
    ]
  }

  constructor(deps: RendererDependencies) {
    this.deps = deps
    this.markerManager = new MarkerManager({ customMarkers$: deps.customMarkers$ })
    this.drawingStore = new DrawingStore({
      drawings$: deps.drawings$,
      selectedDrawingIds$: deps.selectedDrawingIds$,
      getOverlay: deps.getOverlay,
    })
    registerDefaultDrawingDefinitions(this.drawingDefinitions)
    this.scene = createScene()
    this.frameTx = createFrameTransaction<FrameDrawInput, FrameDrawSnapshot>({
      initialInput: { level: UpdateLevel.All },
      derive: (input, generation) => {
        // generation 0 是 createFrameTransaction 构造占位，禁止 prepare/副作用
        if (generation === 0) {
          return {
            generation: 0,
            level: input.level,
            frame: null,
            skip: true,
            countdown: { now: 0, remainingMs: null, text: null },
          }
        }
        const countdown = this.deriveCountdown((this.deps.clock ?? systemClock).now())
        const mainChanged = !this.sameVersion(this.paintedMainVersion, this.mainContentVersion())
        const overlayChanged = !this.sameVersion(
          this.paintedOverlayVersion,
          this.overlayContentVersion(countdown.text),
        )
        const skip =
          !mainChanged &&
          !overlayChanged &&
          !this.deps.getInteraction().hasPendingHover() &&
          input.level !== UpdateLevel.Overlay
        return {
          generation,
          countdown,
          level: mainChanged ? UpdateLevel.All : UpdateLevel.Overlay,
          frame: skip
            ? null
            : this.prepareFrameData(mainChanged ? UpdateLevel.All : UpdateLevel.Overlay, countdown),
          skip,
        }
      },
      render: (snapshot) => {
        // generation 0 占位不绘制
        if (snapshot.generation === 0) return
        // timer 只请求下一帧；即使本帧跳过 paint，也由事务统一续订。
        this.scheduleLastPriceCountdown(snapshot.countdown)
        if (snapshot.skip) return
        // DOM scroll 与 canvas 绘制必须由同一帧事务提交，避免两个 rAF 产生视觉错位。
        this.commitViewportScroll()
        if (snapshot.frame && !snapshot.frame.useCachedFrame) {
          this.deps.getIndicatorManager().updateVisibleRangeForFrame(snapshot.frame.range)
        }
        // 把本帧 K 线信息(kLinePositions,range,kWidthPx,kLineCenters)写入 InteractionController，保证 hover 命中与本帧一致
        if (snapshot.frame) {
          this.sealFrameGeometry(snapshot.frame)
        }
        // 用本帧几何将鼠标坐标吸附到最近 K 线，算出十字线位置
        this.deps.getInteraction().flushPendingHover()
        // 绘制：清 canvas → 构建 RenderContext → 遍历 pane 调 scene.paint → endFrame（GPU 一次性 submit 所有 pane）→ 时间轴
        this.drawWithFrame(snapshot.level, snapshot.frame)
        if (snapshot.frame) {
          this.paintedMainVersion = this.mainContentVersion()
          this.paintedOverlayVersion = this.overlayContentVersion(snapshot.countdown.text)
        }
        if (snapshot.frame) {
          this.cacheDrawFrame(snapshot.frame)
        }
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

  private requiresRightAxisWidthMeasurement(extrema: VisiblePriceExtrema): boolean {
    const magnitude = Math.max(Math.abs(extrema.min), Math.abs(extrema.max))
    const nextOrder = magnitude >= 1 ? Math.floor(Math.log10(magnitude)) : 0
    return this.measuredVisiblePriceMagnitudeOrder !== nextOrder
  }

  initCoreRenderers(): void {
    const opt = this.deps.getOption()
    const axisWidth = opt.rightAxisWidth + (opt.priceLabelWidth ?? 0)
    const interaction = this.deps.getInteraction()

    {
      this.timeAxisLayer = createTimeAxisLayer({
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
    }
    {
      this.scene.addLayer(createGridLinesLayer())
    }
    {
      this.scene.addLayer(createCandleLayer())
    }
    {
      this.scene.addLayer(createTimeShareLayer())
    }
    {
      this.scene.addLayer(createFiveDayTimeShareLayer())
    }
    {
      this.scene.addLayer(createComparisonLineLayer())
    }
    {
      this.scene.addLayer(createCustomMarkersLayer())
    }
    {
      this.scene.addLayer(createExtremaMarkersLayer())
    }
    {
      this.scene.addLayer(
        createMainIndicatorLegendLayer(
          {
            yPaddingPx: opt.yPaddingPx,
            onContext: this.deps.onLegendContext,
            getVisibleIndicatorIds: () => this.deps.getVisibleMainIndicatorIds(),
            getLegendOptions: () => this.deps.getOption().legend,
          },
          this.deps.getPluginHost,
        ),
      )
    }
    {
      const layer = createCrosshairLayer({
        getCrosshairState: () => ({
          pos: interaction.crosshairPos,
          activePaneId: interaction.activePaneId,
          isDragging: interaction.isDraggingState(),
          price: interaction.crosshairPrice,
        }),
      })
      this.scene.addLayer(layer)
    }
    {
      const yAxisOpts = {
        axisWidth,
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
      this.scene.addLayer(createYAxisStaticRendererLayer(yAxisOpts))
      this.scene.addLayer(createYAxisOverlayRendererLayer(yAxisOpts))
    }
  }

  registerDrawingPlugins(): void {
    this.scene.addLayer(createDrawingLayer())
    this.scene.addLayer(createDrawingSessionLayer())
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

  /** 仅在持久化显示时区偏好变更时重建 formatter 状态。 */
  private getDisplayTimeFormatter(): DisplayTimeFormatter {
    const configured = this.settings.displayTimeZone
    const setting: DisplayTimeZoneSetting = configured === 'local' ? 'local' : 'UTC'
    if (setting !== this.displayTimeZoneSetting) {
      this.displayTimeZoneSetting = setting
      this.displayTimeFormatter = createDisplayTimeFormatter(resolveDisplayTimeZone(setting))
    }
    return this.displayTimeFormatter
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
    if (this.schedulingStopped) return
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

  /** 外部 Layer 私有数据变化时使帧缓存失效，下一帧仍由 RAF 合并。 */
  invalidateFrame(): void {
    if (this.schedulingStopped) return
    this.paintedMainVersion = null
    this.paintedOverlayVersion = null
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
    this.deps.getInteraction().setViewSnapshot(frame.viewSnapshot)
    const widthMeasurement = frame.rightAxisWidthMeasurement
    if (widthMeasurement) {
      const magnitude = Math.max(Math.abs(widthMeasurement.min), Math.abs(widthMeasurement.max))
      this.measuredVisiblePriceMagnitudeOrder =
        magnitude >= 1 ? Math.floor(Math.log10(magnitude)) : 0
      this.deps.commitRightAxisWidthMeasurement?.(widthMeasurement)
    }
  }

  /** 将最新 viewport 位置同步到原生滚动容器，作为绘制帧的第一项 DOM 副作用。 */
  private commitViewportScroll(): void {
    this.deps.commitViewportScroll(this.deps.viewport.readonly.scrollLeft.peek())
  }

  /** 将 prepareFrameData 的帧几何按 level 画到 canvas，含所有 pane 的 main/overlay/yAxis 及时间轴 */
  private drawWithFrame(level: UpdateLevel, frame: FrameContext | null): void {
    this.markerManager.clear()

    // 当前视图无可绘制数据时必须清空所有 canvas，不能保留前一视图的像素。
    if (!frame) {
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
    const renderData = frame.data

    const { visiblePriceExtrema, rightAxisWidthMeasurement } = frame
    const requiresRightAxisWidthMeasurement = rightAxisWidthMeasurement !== null
    const mainIndicatorRange = useCachedFrame
      ? null
      : this.deps.getIndicatorManager().getMainIndicatorPriceRange()

    // 遍历所有 pane，清 canvas → 构建 RenderContext → scene.paint
    const { axisLabelsFrame, sharedXAxisRanges } = this.renderPanes(
      vp,
      range,
      kLinePositions,
      kLineCenters,
      kBarRects,
      kWidthPx,
      mainIndicatorRange,
      useCachedFrame,
      level,
      renderData,
      frame.dataRevision,
      fiveDayTimeShareGeometry,
      visiblePriceExtrema,
      requiresRightAxisWidthMeasurement,
      frame.countdown.text,
    )

    // 画底部时间轴（独立 layer，不进 scene）
    this.renderXAxis(
      vp,
      range,
      kLinePositions,
      kLineCenters,
      kBarRects,
      kWidthPx,
      axisLabelsFrame,
      sharedXAxisRanges,
      renderData,
      fiveDayTimeShareGeometry,
    )
  }

  /** 停止本根 K 线倒计时的刷新计时器。 */
  private clearLastPriceCountdownTimer(): void {
    if (this.lastPriceCountdownTimer !== null) {
      clearTimeout(this.lastPriceCountdownTimer)
      this.lastPriceCountdownTimer = null
    }
  }

  /** 用本帧唯一时间快照派生最新 K 线的倒计时。 */
  private deriveCountdown(now: number): FrameCountdown {
    const data = this.deps.getDataManager().getRenderData()
    const last = data[data.length - 1]
    if (
      !last ||
      !this.peekViewport() ||
      !this.deps.viewport.readonly.viewSnapshot.peek().hasPriceSeries ||
      !this.deps.settings$.peek().showLastPriceCountdown
    ) {
      return { now, remainingMs: null, text: null }
    }
    const period = this.deps.getDataManager().currentPeriod
    const marketSession = this.deps.getMarketSession()
    const remaining = getLastPriceRemainingMs(period, last.timestamp, marketSession, now)
    return {
      now,
      remainingMs: remaining,
      text: formatLastPriceCountdown(period, last.timestamp, marketSession, now),
    }
  }

  /** 使用帧时间快照续订唯一 timer，回调只请求 Overlay 帧。 */
  private scheduleLastPriceCountdown(countdown: FrameCountdown): void {
    this.clearLastPriceCountdownTimer()
    const { now, remainingMs: remaining } = countdown
    if (remaining === null) return
    const delay = Math.min(remaining, 1_000 - (now % 1_000) + 1)
    this.lastPriceCountdownTimer = setTimeout(() => {
      this.lastPriceCountdownTimer = null
      this.scheduleDraw(UpdateLevel.Overlay)
    }, delay)
  }

  /**
   * 计算一帧的 viewport、可见区间、K 线位置。
   *
   * Overlay 时复用 cachedDrawFrame 跳过重算，Main/All 强制刷新缓存。
   * 帧缓存用于复用当前可见区几何。
   * TimeShare 模式按 plotWidth 平分 bar，覆盖 K 线位置。
   */
  /** viewWidth 为 0 表示尚未完成首帧尺寸 */
  private peekViewport(): Viewport | null {
    if (this.deps.viewport.readonly.viewWidth.peek() === 0) return null
    return this.deps.viewport.readonly.viewport.peek()
  }

  private prepareFrameData(level: UpdateLevel, countdown: FrameCountdown): FrameContext | null {
    const useCachedFrame = level === UpdateLevel.Overlay && this.cachedDrawFrame !== null

    const vp = useCachedFrame ? this.cachedDrawFrame!.viewport : this.peekViewport()
    if (!vp) return null

    const internalData = [...this.deps.getDataManager().getRenderData()]
    if (internalData.length === 0) return null

    const projection = this.deps.viewport.readonly.viewSnapshot.peek()
    if (!projection.ready) return null
    // 全部横向几何由模型一次投影，render 不再派生另一套坐标。
    const range = useCachedFrame
      ? this.cachedDrawFrame!.range
      : this.deps.viewport.readonly.visibleRange.peek()
    const rawRange = useCachedFrame
      ? (this._prevFrameRange?.raw ?? range)
      : this.deps.viewport.readonly.rawVisibleRange.peek()

    const dataManager = this.deps.getDataManager()

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
      kLineCenters = projection.centers
      kLinePositions = projection.positions
      kBarRects = projection.bars
      kWidthPx = projection.kWidthPx
      fiveDayTimeShareGeometry = projection.fiveDayGeometry
    }

    const visiblePriceExtrema = useCachedFrame
      ? this.cachedDrawFrame!.visiblePriceExtrema
      : projection.hasPriceSeries
        ? computeVisiblePriceExtrema(
            internalData as KLineData[],
            range,
            kLineCenters,
            vp.scrollLeft,
            vp.plotWidth,
          )
        : null
    const rightAxisWidthMeasurement =
      !useCachedFrame &&
      visiblePriceExtrema &&
      this.requiresRightAxisWidthMeasurement(visiblePriceExtrema)
        ? visiblePriceExtrema
        : null

    return {
      viewSnapshot: this.deps.viewport.readonly.viewSnapshot.peek(),
      countdown,
      vp,
      range,
      rawRange,
      kLinePositions,
      kLineCenters,
      kBarRects,
      kWidthPx,
      useCachedFrame,
      data: internalData,
      dataRevision: dataManager.getRenderDataRevision(),
      zoomLevel: this.deps.zoom.readonly.zoomLevel.peek(),
      zoomLevelCount: this.deps.options.readonly.options.peek().zoomLevelCount,
      fiveDayTimeShareGeometry,
      visiblePriceExtrema,
      rightAxisWidthMeasurement,
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
    this.deps.onClearLegendRows?.()
    this.paintedMainVersion = null
    this.paintedOverlayVersion = null
    this.paintedDrawingVersion = null
    const vp = this.peekViewport()
    if (!vp) return
    for (const r of this.deps.getPaneRenderers()) {
      const {
        mainCtx,
        drawingCtx,
        overlayCtx,
        yAxisCtx,
        yAxisOverlayCtx,
        leftAxisCtx,
        leftAxisOverlayCtx,
      } = r.getContexts()
      const pane = r.getPane()
      mainCtx?.clearRect(0, 0, vp.plotWidth + 1, pane.height + 2 / vp.dpr)
      drawingCtx?.clearRect(0, 0, vp.plotWidth + 1, pane.height + 2 / vp.dpr)
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
    // 可见 GPU canvas 不经 2D clearRect，需显式 transparent clear
    const scene = this.deps.getSceneRenderer()
    if (scene.caps.name !== 'canvas2d') {
      scene.surface.clearRegion({
        x: 0,
        y: 0,
        width: vp.plotWidth,
        height: vp.plotHeight,
        dpr: vp.dpr,
      })
    }
  }

  /** 构建所有 pane 的上下文与区域，由 Scene 逐 pane 绑定并绘制，最后统一提交 GPU。 */
  private renderPanes(
    vp: Viewport,
    range: VisibleRange,
    kLinePositions: KLinePositions,
    kLineCenters: number[],
    kBarRects: Array<{ x: number; width: number }>,
    kWidthPx: number,
    mainIndicatorRange: { min: number; max: number } | null,
    useCachedFrame: boolean,
    level: UpdateLevel,
    renderData: ChartSeriesDatum[],
    dataRevision: number,
    fiveDayTimeShareGeometry: FiveDayTimeShareGeometry | null,
    visiblePriceExtrema: VisiblePriceExtrema | null,
    requiresRightAxisWidthMeasurement: boolean,
    countdown: string | null,
  ): { axisLabelsFrame: AxisLabelsFrame; sharedXAxisRanges: XAxisRange[] } {
    // X 轴由多个 Pane 共享；Y 轴装饰必须保持 Pane 隔离。
    // 轴标签收集统一走 axisLabels 模块的单帧聚合：X 表面共享 + 每 Pane 独立 Y 表面。
    const axisLabelsFrame = createAxisLabelsFrame()
    const sharedXAxisRanges: XAxisRange[] = []
    const indicatorManager = this.deps.getIndicatorManager()
    const indicatorStateReader = indicatorManager.createRenderStateReader()

    const dataManager = this.deps.getDataManager()
    const mode = this.deps.getActiveMode()

    // 正式图元保存到独立 canvas，会话图元与十字线共用动态覆盖 canvas。
    const MAIN_CANVAS_ROLES: readonly LayerRole[] = [
      'background',
      'primary',
      'indicator',
      'component',
    ]
    const OVERLAY_CANVAS_ROLES: readonly LayerRole[] = ['drawing', 'overlay']
    const SESSION_CANVAS_ROLES: readonly LayerRole[] = ['overlay']
    const drawingVersion = this.drawingStore.getCommittedPaintVersion()
    const drawingChanged = !this.sameVersion(this.paintedDrawingVersion, drawingVersion)

    // 本帧所有 pane 的绘制输入；全部 pane 构建完成后再一次性交给 Scene。
    const framePanes: Array<FramePaint & { paneId: string }> = []
    const sceneRenderer = this.deps.getSceneRenderer()

    // 遍历主图 pane 和所有子图 pane，每个 pane 有一组独立 canvas 以及对应更新级别（main/overlay/yAxis）
    for (const renderer of this.deps.getPaneRenderers()) {
      const pane = renderer.getPane()
      const {
        mainCtx,
        drawingCtx,
        overlayCtx,
        yAxisCtx,
        yAxisOverlayCtx,
        leftAxisCtx,
        leftAxisOverlayCtx,
      } = renderer.getContexts()
      const previousContext = this.paneCtxMap.get(pane.id)
      const shouldUpdateDrawing =
        !useCachedFrame ||
        drawingChanged ||
        previousContext?.drawingCtx !== drawingCtx ||
        !previousContext?.drawingProjection

      // 非缓存帧：更新 pane Y 轴范围；比较视图下以可见折线极值为准
      if (!useCachedFrame) {
        const comparisonActive = dataManager.getComparisonSpecs().length > 0

        if (pane.id === 'main' && comparisonActive) {
          // 比较视图：y 轴范围 = 可见区各比较商品等价价极值，
          // 随滚动/缩放逐帧重算，缩放与平移的 clamp 上下限同步跟随折线
          const lineRange = dataManager.getComparisonViewLineRange(
            range,
            kLineCenters,
            vp.scrollLeft,
            vp.plotWidth,
          )
          if (lineRange) {
            const linePriceRange = { maxPrice: lineRange.max, minPrice: lineRange.min }
            pane.yAxis.setRange(linePriceRange)
          } else {
            mode.updatePaneRange(pane as any, range, dataManager, null)
          }
          // 绕过 Pane.updateRange 时需手动补齐 percent 基准价；
          // 基准与折线一致，锚定内容区内首根完全可见的 bar。
          const { first: baseIdx } = findVisibleBarRange(
            range,
            kLineCenters,
            vp.scrollLeft,
            vp.plotWidth,
          )
          const baseItem = renderData[baseIdx]
          pane.yAxis.setBasePrice(baseItem && 'close' in baseItem ? baseItem.close : null)
        } else {
          const subPaneEntry = indicatorManager.getSubPaneEntry(pane.id)
          const subIndicatorState = subPaneEntry
            ? indicatorStateReader.get<{
                valueMin?: number
                valueMax?: number
                visibleMin?: number
                visibleMax?: number
              }>(subPaneEntry.instanceId)
            : undefined
          const subIndicatorRange =
            subIndicatorState &&
            Number.isFinite(subIndicatorState.valueMin ?? subIndicatorState.visibleMin) &&
            Number.isFinite(subIndicatorState.valueMax ?? subIndicatorState.visibleMax)
              ? {
                  min: subIndicatorState.valueMin ?? subIndicatorState.visibleMin!,
                  max: subIndicatorState.valueMax ?? subIndicatorState.visibleMax!,
                }
              : null
          if (pane.role === 'indicator') {
            // 副图坐标轴只由对应指标 state 驱动，与 K 线/分时主图模式无关。
            if (subIndicatorRange) {
              pane.yAxis.setRange({
                minPrice: subIndicatorRange.min,
                maxPrice: subIndicatorRange.max,
              })
            }
          } else {
            const indicatorRange = mode.useIndicatorScheduler ? mainIndicatorRange : null
            mode.updatePaneRange(pane as any, range, dataManager, indicatorRange)
          }
        }

        {
          const axisRange = this.deps.mainPriceAxis.readonly.paneRanges.peek()[pane.id]
          const handRange = axisRange?.handRange
          if (axisRange?.rangeMode === PRICE_AXIS_RANGE_MODE.HAND) {
            if (!handRange) {
              // 新品种的首个有效帧只使用自身范围，清除旧品种的平移和缩放。
              pane.yAxis.resetTransform()
              this.deps.mainPriceAxis.actions.initializeHandRange(
                pane.yAxis.getDisplayRange(),
                pane.id,
              )
            } else {
              pane.yAxis.setRange(handRange)
            }
          }
        }
      }

      // 根据 UpdateLevel 决定清哪些 canvas
      const shouldUpdateMain = level === UpdateLevel.Main || level === UpdateLevel.All
      // 会话图元与十字线每次重画；正式层只在几何、文档、选中或覆盖成员变化时重画。
      const shouldUpdateOverlay = level === UpdateLevel.Overlay || level === UpdateLevel.All

      // 清 main canvas
      if (shouldUpdateMain && mainCtx) {
        mainCtx.setTransform(1, 0, 0, 1, 0, 0)
        mainCtx.scale(vp.dpr, vp.dpr)
        mainCtx.clearRect(0, 0, vp.plotWidth + 1, pane.height + 2 / vp.dpr)
      }

      // 清正式图元 canvas；成员、选中或视口不变时保留其像素。
      if (shouldUpdateDrawing && drawingCtx) {
        drawingCtx.setTransform(1, 0, 0, 1, 0, 0)
        drawingCtx.scale(vp.dpr, vp.dpr)
        drawingCtx.clearRect(0, 0, vp.plotWidth + 1, pane.height + 2 / vp.dpr)
      }

      // 清动态覆盖 canvas，不触碰正式图元的像素。
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
        publishLegendRows: this.deps.onLegendRows,
        countdown: countdown ?? undefined,
        ctx: mainCtx!,
        overlayCtx: overlayCtx ?? undefined,
        drawingCtx: drawingCtx ?? undefined,
        pane: wrapPaneInfo(pane),
        data: renderData,
        dataRevision,
        period: dataManager.currentPeriod,
        dataView: this.deps.dataView$(),
        marketSession: this.deps.getMarketSession(),
        displayTimeFormatter: this.getDisplayTimeFormatter(),
        timeShareRange: dataManager.getTimeShareRange() ?? undefined,
        fiveDayTimeShareGeometry: fiveDayTimeShareGeometry ?? undefined,
        comparisonData: dataManager.getComparisonData(),
        comparisonSymbols: dataManager.getComparisonSpecs(),
        comparisonColors: dataManager.getComparisonColors(),
        range,
        scrollLeft: vp.scrollLeft,
        kWidth: opt.kWidth,
        kGap: opt.kGap,
        dpr: vp.dpr,
        paneWidth: vp.plotWidth,
        kLinePositions,
        kLineCenters,
        kBarRects,
        kWidthPx,
        visiblePriceExtrema,
        requiresRightAxisWidthMeasurement,
        getLogicalIndexAtTimestamp: (timestamp) =>
          dataManager.getLogicalIndexAtTimestamp(timestamp),
        getTimestampAtLogicalIndex: (index) => dataManager.getAxisTimestampAtLogicalIndex(index),
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
        yAxisRanges: [],
        xAxisRanges: sharedXAxisRanges,
        axisLabels: axisLabelsFrame,
        theme: this.deps.theme$.peek(),
        isAsiaMarket: this.settings.isAsiaMarket as boolean,
        colorPresetSettings: this.settings.colorPresetSettings,
      }

      // 覆盖成员进入会话层时从正式层排除；连续移动复用正式层投影和像素。
      if (shouldUpdateDrawing) {
        const labels = createAxisLabelsFrame()
        context.drawingProjection = projectDrawingsForFrame(
          this.drawingStore,
          this.drawingDefinitions,
          { ...context, axisLabels: labels },
          null,
          'committed',
        )
        this.drawingAxisLabels.set(renderer, labels)
      } else {
        context.drawingProjection = previousContext?.drawingProjection
      }
      const retainedLabels = this.drawingAxisLabels.get(renderer)
      for (const label of retainedLabels?.forSurface('yRightOverlay', pane.id).labels ?? []) {
        registerAxisLabel(context, 'yRightOverlay', label)
      }
      for (const label of retainedLabels?.forSurface('xLabels').labels ?? []) {
        registerAxisLabel(context, 'xLabels', label)
      }
      context.sessionDrawingProjection = projectDrawingsForFrame(
        this.drawingStore,
        this.drawingDefinitions,
        context,
        this.deps.getSelectionMarquee?.() ?? null,
        'session',
      )
      for (const projection of [context.drawingProjection, context.sessionDrawingProjection]) {
        if (!projection) continue
        context.yAxisRanges.push(...projection.yAxisRanges)
        sharedXAxisRanges.push(...projection.xAxisRanges)
      }

      // 刻度锚定轴数值，再投影到本帧的价格坐标系；网格与左右轴共用。
      context.yAxisTicks = createYAxisTicks(pane, {
        period: context.period,
        comparisonActive: (context.comparisonSymbols?.length ?? 0) > 0,
        leftSetting: context.settings?.mainLeftAxisDisplaySetting,
        rightTypeSetting: context.settings?.mainRightAxisTypeSetting,
      })

      this.paneCtxMap.set(pane.id, context)
      this.currentPaneId = pane.id

      const region = { x: 0, y: pane.top, width: vp.plotWidth, height: pane.height, dpr: vp.dpr }
      // 画 main canvas（非 overlay 角色 layer）
      if (shouldUpdateMain) {
        framePanes.push({
          paneId: pane.id,
          context,
          renderer: sceneRenderer,
          region,
          frameNumber: this.frameCount++,
          deltaMs: 0,
          roles: MAIN_CANVAS_ROLES,
          clear: true,
        })
      }
      // 画 overlay canvas（绘图和动态 overlay 角色 layer）
      if (shouldUpdateOverlay) {
        // GPU 主层在本帧已经清过；overlay 不得清除其可见 GPU 内容。
        framePanes.push({
          paneId: pane.id,
          context,
          renderer: sceneRenderer,
          region,
          frameNumber: this.frameCount++,
          deltaMs: 0,
          roles: shouldUpdateDrawing ? OVERLAY_CANVAS_ROLES : SESSION_CANVAS_ROLES,
          clear: false,
        })
      }
    }

    // 所有 pane 构建完成后一次性绘制；Scene 逐 pane 过滤、z 排序、逐层隔离分发。
    this.scene.paint({ panes: framePanes })
    this.paintedDrawingVersion = drawingVersion

    // 所有 pane 绘制完成后统一提交 GPU（WebGPU 单次 queue.submit，WebGL 单次 flush）
    this.deps.getSceneRenderer().endFrame()

    return { axisLabelsFrame, sharedXAxisRanges }
  }

  private renderXAxis(
    vp: Viewport,
    range: VisibleRange,
    kLinePositions: KLinePositions,
    kLineCenters: number[],
    kBarRects: Array<{ x: number; width: number }>,
    kWidthPx: number,
    axisLabelsFrame: AxisLabelsFrame,
    sharedXAxisRanges: XAxisRange[],
    renderData: ChartSeriesDatum[],
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
      const timeAxisContext: RenderContext = {
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
            getScaleType: () => ScaleType.Linear,
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
        displayTimeFormatter: this.getDisplayTimeFormatter(),
        getLogicalIndexAtTimestamp: (timestamp) =>
          dataManager.getLogicalIndexAtTimestamp(timestamp),
        getTimestampAtLogicalIndex: (index) => dataManager.getAxisTimestampAtLogicalIndex(index),
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
        kWidthPx,
        xAxisCtx,
        viewport: {
          scrollLeft: vp.scrollLeft,
          plotWidth: vp.plotWidth,
          plotHeight: vp.plotHeight,
        },
        yAxisRanges: [],
        xAxisRanges: sharedXAxisRanges,
        axisLabels: axisLabelsFrame,
        theme: this.deps.theme$.peek(),
        isAsiaMarket: this.settings.isAsiaMarket as boolean,
        colorPresetSettings: this.settings.colorPresetSettings,
      }
      this.timeAxisLayer.paint({
        ...timeAxisContext,
        paneId: 'xAxis',
        clear: false,
        sceneRenderer: this.deps.getSceneRenderer(),
      })
    }
  }

  /** 在成功绘制后缓存主层几何，供下一帧 Overlay 复用。 */
  private cacheDrawFrame(frame: FrameContext): void {
    if (frame.useCachedFrame) return
    this._prevFrameRange = {
      visible: { ...frame.range },
      raw: { ...frame.rawRange },
    }
    this.cachedDrawFrame = {
      viewport: { ...frame.vp },
      range: { ...frame.range },
      kLinePositions: frame.kLinePositions,
      kLineCenters: frame.kLineCenters,
      kBarRects: frame.kBarRects,
      kWidthPx: frame.kWidthPx,
      fiveDayTimeShareGeometry: frame.fiveDayTimeShareGeometry,
      visiblePriceExtrema: frame.visiblePriceExtrema,
    }
  }

  clearCachedFrame(): void {
    this.cachedDrawFrame = null
    this.paintedMainVersion = null
    this.paintedOverlayVersion = null
  }

  /** 停止申请和提交新帧，保留 Scene 供异步插件卸载访问。 */
  stopScheduling(): void {
    if (this.schedulingStopped) return
    this.schedulingStopped = true
    this.clearLastPriceCountdownTimer()
    if (this.raf !== null) {
      cancelAnimationFrame(this.raf)
      this.raf = null
    }
  }

  destroy(): void {
    if (this.disposed) return
    this.disposed = true
    this.stopScheduling()
    this.cachedDrawFrame = null
    this.xAxisCtx = null
    this.scene.dispose()
    this.paneCtxMap.clear()
  }
}
