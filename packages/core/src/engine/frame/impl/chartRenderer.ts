/** 图表帧准备、各 Pane 坐标范围与 Scene 绘制调度。 */
import { GENERIC_ERROR_CODES, KLineChartError } from '../../../errors.js'
import type { ChartSettings } from '../../../foundation/config/chartSettings.js'
import { PRICE_AXIS_RANGE_MODE } from '../../../foundation/config/priceAxisRangeMode.js'
import type {
  AxisLabelsFrame,
  FiveDayTimeShareGeometry,
  IndicatorAvailabilityReader,
  IndicatorRenderStateReader,
  RenderContext,
  XAxisRange,
} from '../../../foundation/plugin/index.js'
import { wrapPaneInfo } from '../../../foundation/plugin/index.js'
import {
  createFrameTransaction,
  type FrameTransaction,
} from '../../../foundation/reactivity/frameTransaction.js'
import { resolveThemeColors } from '../../../foundation/tokens/index.js'
import type { ChartSeriesDatum, KLineData } from '../../../foundation/types/price.js'
import { ScaleType } from '../../../foundation/types/scaleType.js'
import { systemClock } from '../../../foundation/utils/clock.js'
import {
  createDisplayTimeFormatter,
  type DisplayTimeFormatter,
  type DisplayTimeZoneSetting,
  resolveDisplayTimeZone,
} from '../../../foundation/utils/dateFormat.js'
import { createScene } from '../../../rendering/scene/createScene.js'
import type { FramePaint, Layer, LayerRole, Scene } from '../../../rendering/scene/types.js'
import type { KLinePositions, Viewport } from '../../chart/index.js'
import { ChartDataViewId } from '../../chartModel/index.js'
import type { ChartDataManager } from '../../data/chartDataManager.js'
import {
  createDrawingLayer,
  createDrawingSessionLayer,
  DrawingDefinitionRegistry,
  DrawingStore,
  projectDrawingsForFrame,
  registerDefaultDrawingDefinitions,
} from '../../drawing/index.js'
import { MarkerManager } from '../../marker/registry.js'
import type { PaneRenderer } from '../../pane/index.js'
import { UpdateLevel } from '../../pane/index.js'
import { createCandleLayer } from '../../renderers/candle.js'
import { createComparisonLineLayer } from '../../renderers/comparisonLine.js'
import { CrosshairOverlay } from '../../renderers/crosshair/impl/crosshairOverlay.js'
import { createCustomMarkersLayer } from '../../renderers/customMarkers.js'
import { createExtremaMarkersLayer } from '../../renderers/extremaMarkers.js'
import { createFiveDayTimeShareLayer } from '../../renderers/fiveDayTimeShare.js'
import { createGridLinesLayer } from '../../renderers/gridLines.js'
import {
  createAxisLabelsFrame,
  formatLastPriceCountdown,
  getLastPriceRemainingMs,
  registerAxisLabel,
} from '../../renderers/impl/labels/index.js'
import { createTimeAxisLayer } from '../../renderers/timeAxis.js'
import { createTimeShareLayer } from '../../renderers/timeShare.js'
import {
  createYAxisOverlayRendererLayer,
  createYAxisStaticRendererLayer,
} from '../../renderers/yAxis.js'
import { createYAxisTicks, type PriceRange } from '../../scale/index.js'
import type { VisibleRange } from '../../viewport/viewport.js'
import {
  computeVisiblePriceExtrema,
  type VisiblePriceExtrema,
} from '../../viewport/visiblePriceExtrema.js'
import type { RendererDependencies } from '../types.js'
import {
  computePaneAutoRange,
  type ResolvedPanePriceRange,
  resolvePanePriceRange,
} from './panePriceRange.js'

/** 帧内共享的时间与倒计时派生结果。 */
type FrameCountdown = {
  now: number
  remainingMs: number | null
  text: string | null
}

/** 一帧绘制几何与数据；大数组结构共享，render 只读。 */
type FrameContext = {
  viewSnapshot: import('../../scale/index.js').ScaleXSnapshot
  /** 当前帧重新派生的时间与倒计时，不进入几何缓存。 */
  countdown: FrameCountdown
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
  data: ChartSeriesDatum[]
  /** 与本帧主序列快照对应的提交版本。 */
  dataRevision: number
  /** 五日分时供所有 renderer 和交互共享的帧级几何。 */
  fiveDayTimeShareGeometry: FiveDayTimeShareGeometry | null
  /** 帧准备阶段生成的真正可视 K 线极值。 */
  visiblePriceExtrema: VisiblePriceExtrema | null
  /** 跨数量级时生成的低频右轴测量意图；由 seal 阶段提交。 */
  rightAxisWidthMeasurement: VisiblePriceExtrema | null
  /** 本帧每 Pane 解析后的价格轴范围、基准价与锁定初始化标记。 */
  panePriceRanges: Record<string, ResolvedPanePriceRange>
  /** 本帧是否启用比较叠加（仅 K 线视图）。 */
  comparisonActive: boolean
  /** 单帧生成的比较投影；轴范围、百分比基准与折线共享。 */
  comparisonProjection: ReturnType<ChartDataManager['getComparisonProjection']> | null
  /** 本帧主图指标极值。 */
  mainIndicatorRange: { min: number; max: number } | null
  /** 本帧指标实例状态读取器，范围解析与绘制共用。 */
  indicatorStateReader: IndicatorRenderStateReader
  /** 本帧指标可用性读取器。 */
  indicatorAvailability: IndicatorAvailabilityReader
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

/** Main 与 Overlay 合并为 All；相同级别保持不变 */
export function mergeUpdateLevel(current: UpdateLevel, next: UpdateLevel): UpdateLevel {
  if (current === UpdateLevel.All || next === UpdateLevel.All) return UpdateLevel.All
  if (current === next) return current
  // 仅剩 Main ↔ Overlay 两种组合，合并为 All
  return UpdateLevel.All
}

/** 在绘制帧内提交 viewport 的原生滚动位置，跳过无变化写入。 */
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
  /** 捕获函数必须在绘制事务完成后、同一个 RAF 回调内同步执行。 */
  private pendingCaptures: Array<{ run: () => void; reject: (cause: unknown) => void }> = []
  /** 最新价签的秒级倒计时计时器；只请求 overlay 重绘。 */
  private lastPriceCountdownTimer: ReturnType<typeof setTimeout> | null = null

  readonly markerManager: MarkerManager
  readonly drawingStore: DrawingStore
  private readonly drawingDefinitions = new DrawingDefinitionRegistry()
  private xAxisCtx: CanvasRenderingContext2D | null = null
  private readonly crosshairOverlay: CrosshairOverlay

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
  private timeAxisLayer: Layer<RenderContext> | null = null
  private displayTimeZoneSetting: DisplayTimeZoneSetting = 'UTC'
  private displayTimeFormatter: DisplayTimeFormatter = createDisplayTimeFormatter('UTC')
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
      this.deps.primaryRenderer$?.peek(),
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
      this.deps.getLegendConfiguration(),
      // getOverlay 会新建数组，按图元引用比较才能同时捕获移动和避免空数组误失效。
      ...(this.deps.getOverlay?.() ?? []),
      this.deps.getSelectionMarquee?.(),
      countdown,
    ]
  }

  constructor(deps: RendererDependencies) {
    this.deps = deps
    this.crosshairOverlay = new CrosshairOverlay(deps.getDom().canvasLayer)
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
        if (snapshot.frame) {
          if (!snapshot.frame.useCachedFrame) {
            this.deps.getIndicatorManager().updateVisibleRangeForFrame(snapshot.frame.range)
          }
          // visibleRange 就绪后统一收集价格轴范围，供后续绘制纯投影。
          this.collectPanePriceRanges(snapshot.frame)
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
        this.completeFrameCaptures()
      },
      schedule: (run) => {
        this.raf = requestAnimationFrame(() => {
          this.raf = null
          try {
            run()
          } catch (error) {
            this.rejectFrameCaptures(error)
            throw error
          }
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

  getMarkerManager(): MarkerManager {
    return this.markerManager
  }

  getDrawingStore(): DrawingStore {
    return this.drawingStore
  }

  getSettings(): ChartSettings {
    return this.deps.settings$.peek()
  }

  /** 仅在持久化显示时区偏好变更时重建 formatter 状态。 */
  private getDisplayTimeFormatter(): DisplayTimeFormatter {
    const configured = this.getSettings().displayTimeZone
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

  /** 强制完整重绘，在该帧呈现前调用捕获函数；异步读回不会阻塞后续绘制。 */
  captureFrame<T>(capture: () => T | Promise<T>): Promise<T> {
    if (this.schedulingStopped) {
      return Promise.reject(new KLineChartError(GENERIC_ERROR_CODES.DISPOSED, '截图帧调度已停止'))
    }
    const result = new Promise<T>((resolve, reject) => {
      this.pendingCaptures.push({
        run: () => {
          try {
            resolve(capture())
          } catch (error) {
            reject(error)
          }
        },
        reject,
      })
    })
    this.invalidateFrame()
    this.scheduleDraw(UpdateLevel.All)
    return result
  }

  /** 在帧完成位置执行已排队的截图请求，执行期间的新请求留给下一帧。 */
  private completeFrameCaptures(): void {
    const requests = this.pendingCaptures
    this.pendingCaptures = []
    for (const request of requests) request.run()
  }

  /** 绘制失败或销毁时结束挂起截图，避免宿主永久停留在忙碌状态。 */
  private rejectFrameCaptures(cause: unknown): void {
    const requests = this.pendingCaptures
    this.pendingCaptures = []
    for (const request of requests) request.reject(cause)
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
    try {
      this.frameTx.flush()
    } catch (error) {
      this.rejectFrameCaptures(error)
      throw error
    }
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

    // 遍历所有 pane，清 canvas → 构建 RenderContext → scene.paint
    const { axisLabelsFrame, sharedXAxisRanges } = this.renderPanes(frame, level)
    this.renderCrosshair(frame.vp)

    // 画底部时间轴（独立 layer，不进 scene）
    this.renderXAxis(frame, axisLabelsFrame, sharedXAxisRanges)
  }

  /** 在 pane 范围与绘制完成后，向整张图表的独立表面提交一次十字线。 */
  private renderCrosshair(viewport: Viewport): void {
    const interaction = this.deps.getInteraction()
    const renderers = this.deps.getPaneRenderers()
    const firstPane = renderers[0]?.getPane()
    const context = firstPane ? this.paneCtxMap.get(firstPane.id) : undefined
    if (!context) {
      this.crosshairOverlay.clear()
      return
    }
    const activePane = renderers
      .find((renderer) => renderer.getPane().id === interaction.activePaneId)
      ?.getPane()
    this.crosshairOverlay.paint({
      viewport,
      pos: interaction.crosshairPos,
      price: interaction.crosshairPrice,
      activePane: activePane ? wrapPaneInfo(activePane) : null,
      color: resolveThemeColors(context.theme, context.isAsiaMarket, context.colorPresetSettings)
        .crosshairLine,
    })
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

  /** viewWidth 为 0 表示尚未完成首帧尺寸。 */
  private peekViewport(): Viewport | null {
    if (this.deps.viewport.readonly.viewWidth.peek() === 0) return null
    return this.deps.viewport.readonly.viewport.peek()
  }

  /**
   * 计算一帧的 viewport、可见区间与 K 线几何。
   *
   * Overlay 且已有缓存帧时复用 cachedDrawFrame，跳过重算；Main/All 强制刷新。
   * 帧几何全部来自 viewSnapshot 投影，render 不再派生另一套坐标。
   */
  private prepareFrameData(level: UpdateLevel, countdown: FrameCountdown): FrameContext | null {
    const cached = level === UpdateLevel.Overlay ? this.cachedDrawFrame : null
    const useCachedFrame = cached !== null

    const vp = cached ? cached.viewport : this.peekViewport()
    if (!vp) return null

    const internalData = [...this.deps.getDataManager().getRenderData()]
    if (internalData.length === 0) return null

    const projection = this.deps.viewport.readonly.viewSnapshot.peek()
    if (!projection.ready) return null
    // 全部横向几何由模型一次投影，render 不再派生另一套坐标。
    const range = cached ? cached.range : this.deps.viewport.readonly.visibleRange.peek()

    const dataManager = this.deps.getDataManager()

    let kLinePositions: KLinePositions
    let kLineCenters: number[]
    let kBarRects: Array<{ x: number; width: number }>
    let kWidthPx: number
    let fiveDayTimeShareGeometry: FiveDayTimeShareGeometry | null

    if (cached) {
      kLinePositions = cached.kLinePositions
      kLineCenters = cached.kLineCenters
      kBarRects = cached.kBarRects
      kWidthPx = cached.kWidthPx
      fiveDayTimeShareGeometry = cached.fiveDayTimeShareGeometry
    } else {
      kLineCenters = projection.centers
      kLinePositions = projection.positions
      kBarRects = projection.bars
      kWidthPx = projection.kWidthPx
      fiveDayTimeShareGeometry = projection.fiveDayGeometry
    }

    const visiblePriceExtrema = cached
      ? cached.visiblePriceExtrema
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
      !cached && visiblePriceExtrema && this.requiresRightAxisWidthMeasurement(visiblePriceExtrema)
        ? visiblePriceExtrema
        : null

    const indicatorManager = this.deps.getIndicatorManager()

    return {
      viewSnapshot: this.deps.viewport.readonly.viewSnapshot.peek(),
      countdown,
      vp,
      range,
      kLinePositions,
      kLineCenters,
      kBarRects,
      kWidthPx,
      useCachedFrame,
      data: internalData,
      dataRevision: dataManager.getRenderDataRevision(),
      fiveDayTimeShareGeometry,
      visiblePriceExtrema,
      rightAxisWidthMeasurement,
      // 价格轴范围在 render 回调里、visibleRange 更新之后统一收集。
      panePriceRanges: {},
      comparisonActive: false,
      comparisonProjection: null,
      mainIndicatorRange: null,
      indicatorStateReader: indicatorManager.createRenderStateReader({
        data: internalData,
        range,
      }),
      indicatorAvailability: indicatorManager.createAvailabilityReader(),
    }
  }

  /**
   * 收集阶段：visibleRange 更新后，统一解析每个 Pane 本帧最终使用的价格范围。
   *
   * 自动范围分派与锁定优先决策都在 panePriceRange 模块内完成，这里只准备输入。
   * 决策阶段不写内核；尚未保存的锁定范围先收集，循环结束后一次快照提交。
   */
  private collectPanePriceRanges(frame: FrameContext): void {
    const indicatorManager = this.deps.getIndicatorManager()
    const dataManager = this.deps.getDataManager()
    const mode = this.deps.getActiveMode()

    const mainIndicatorRange = frame.useCachedFrame
      ? null
      : indicatorManager.getMainIndicatorPriceRange()
    const comparisonActive =
      this.deps.dataView$() === ChartDataViewId.KLine && dataManager.getComparisonSpecs().length > 0
    const comparisonProjection = comparisonActive
      ? dataManager.getComparisonProjection(
          frame.range,
          frame.kLineCenters,
          frame.vp.scrollLeft,
          frame.vp.plotWidth,
        )
      : null

    frame.mainIndicatorRange = mainIndicatorRange
    frame.comparisonActive = comparisonActive
    frame.comparisonProjection = comparisonProjection

    const panePriceRanges: Record<string, ResolvedPanePriceRange> = {}
    // 收集阶段只做决策，不写内核；待初始化的锁定范围先收集，循环后统一提交。
    const pendingHandRanges: Array<{ paneId: string; range: PriceRange }> = []
    for (const renderer of this.deps.getPaneRenderers()) {
      const pane = renderer.getPane()
      const auto = computePaneAutoRange({
        paneId: pane.id,
        role: pane.role,
        range: frame.range,
        dataManager,
        mode,
        mainIndicatorRange,
        comparisonActive,
        comparisonProjection,
        subIndicatorRange: this.readSubIndicatorRange(frame, pane.id),
      })
      const axisState = this.deps.mainPriceAxis.readonly.paneRanges.peek()[pane.id]
      const resolved = resolvePanePriceRange({
        rangeMode: axisState?.rangeMode ?? PRICE_AXIS_RANGE_MODE.AUTO,
        handRange: axisState?.handRange ?? null,
        autoRange: auto?.range ?? null,
        basePrice: auto?.basePrice ?? null,
      })
      panePriceRanges[pane.id] = resolved
      if (!frame.useCachedFrame && resolved.initializeHandRange && resolved.range) {
        pendingHandRanges.push({ paneId: pane.id, range: resolved.range })
      }
    }
    frame.panePriceRanges = panePriceRanges
    // 本帧唯一的业务状态写入：一次快照提交所有待初始化的锁定范围。
    if (pendingHandRanges.length > 0) {
      this.deps.mainPriceAxis.actions.initializeHandRanges(pendingHandRanges)
    }
  }

  /** 读取副图指标 state 的极值；非副图或未就绪返回 null。 */
  private readSubIndicatorRange(
    frame: FrameContext,
    paneId: string,
  ): { min: number; max: number } | null {
    const subPaneEntry = this.deps.getIndicatorManager().getSubPaneEntry(paneId)
    if (!subPaneEntry) return null
    const state = frame.indicatorStateReader.get<{
      valueMin?: number
      valueMax?: number
      visibleMin?: number
      visibleMax?: number
    }>(subPaneEntry.instanceId)
    const min = state?.valueMin ?? state?.visibleMin
    const max = state?.valueMax ?? state?.visibleMax
    return typeof min === 'number' && typeof max === 'number' ? { min, max } : null
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
    this.crosshairOverlay.clear()
    this.deps.clearLegendFrame()
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
      if (yAxisCtx) {
        this.clearAxisCtx(yAxisCtx, vp.dpr, yAxisCtx.canvas.width / vp.dpr, pane.height)
      }
      if (yAxisOverlayCtx) {
        this.clearAxisCtx(
          yAxisOverlayCtx,
          vp.dpr,
          yAxisOverlayCtx.canvas.width / vp.dpr,
          pane.height,
        )
      }
      if (leftAxisCtx) {
        this.clearAxisCtx(leftAxisCtx, vp.dpr, leftAxisCtx.canvas.width / vp.dpr, pane.height)
      }
      if (leftAxisOverlayCtx) {
        this.clearAxisCtx(
          leftAxisOverlayCtx,
          vp.dpr,
          leftAxisOverlayCtx.canvas.width / vp.dpr,
          pane.height,
        )
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
    frame: FrameContext,
    level: UpdateLevel,
  ): { axisLabelsFrame: AxisLabelsFrame; sharedXAxisRanges: XAxisRange[] } {
    const {
      vp,
      range,
      kLinePositions,
      kLineCenters,
      kBarRects,
      kWidthPx,
      useCachedFrame,
      data: renderData,
      dataRevision,
      fiveDayTimeShareGeometry,
      visiblePriceExtrema,
    } = frame
    const requiresRightAxisWidthMeasurement = frame.rightAxisWidthMeasurement !== null
    const countdown = frame.countdown.text
    // X 轴由多个 Pane 共享；Y 轴装饰必须保持 Pane 隔离。
    // 轴标签收集统一走 axisLabels 模块的单帧聚合：X 表面共享 + 每 Pane 独立 Y 表面。
    const axisLabelsFrame = createAxisLabelsFrame()
    const sharedXAxisRanges: XAxisRange[] = []
    const indicatorStateReader = frame.indicatorStateReader
    const indicatorAvailability = frame.indicatorAvailability

    const dataManager = this.deps.getDataManager()

    // 单帧只生成一次比较投影，轴范围、百分比基准和折线共享同一快照。
    const comparisonActive = frame.comparisonActive
    const comparisonProjection = frame.comparisonProjection

    // 正式图元保存到独立 canvas，会话图元使用 pane 动态覆盖 canvas。
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
    const legendContexts: RenderContext[] = []
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

      // 非缓存帧：把收集阶段算好的范围直接投影到运行时轴，不做任何决策或回写。
      if (!useCachedFrame) {
        const resolved = frame.panePriceRanges[pane.id]
        if (resolved) {
          pane.yAxis.setBasePrice(resolved.basePrice)
          if (resolved.range) pane.yAxis.setRange(resolved.range)
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
        comparisonSymbols: comparisonActive ? dataManager.getComparisonSpecs() : [],
        comparisonColors: dataManager.getComparisonColors(),
        comparisonHidden: dataManager.getComparisonHidden(),
        comparisonProjection: comparisonProjection ?? undefined,
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
        indicatorAvailability,
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
          ...this.getSettings(),
          // 分时昨收优先读 series 元数据，settings 作回退
          preClose:
            dataManager.getTimeSharePreClose() ??
            (this.getSettings().preClose as number | undefined),
        },
        yAxisRanges: [],
        xAxisRanges: sharedXAxisRanges,
        axisLabels: axisLabelsFrame,
        theme: this.deps.theme$.peek(),
        isAsiaMarket: this.getSettings().isAsiaMarket as boolean,
        colorPresetSettings: this.getSettings().colorPresetSettings,
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
        // 正式图元表面在 pane 首次出现图元时创建；新表面为空白，只需与清除路径相同的 DPR 变换。
        if (!context.drawingCtx && (context.drawingProjection?.primitives.length ?? 0) > 0) {
          const createdDrawingCtx = renderer.ensureDrawingContext()
          if (createdDrawingCtx) {
            createdDrawingCtx.setTransform(1, 0, 0, 1, 0, 0)
            createdDrawingCtx.scale(vp.dpr, vp.dpr)
            context.drawingCtx = createdDrawingCtx
          }
        }
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
      legendContexts.push(context)

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

    this.deps.projectLegendFrame(legendContexts)
    return { axisLabelsFrame, sharedXAxisRanges }
  }

  private renderXAxis(
    frame: FrameContext,
    axisLabelsFrame: AxisLabelsFrame,
    sharedXAxisRanges: XAxisRange[],
  ): void {
    const {
      vp,
      range,
      kLinePositions,
      kLineCenters,
      kBarRects,
      kWidthPx,
      data: renderData,
      fiveDayTimeShareGeometry,
    } = frame
    const dom = this.deps.getDom()
    const xAxisCtx = this.xAxisCtx ?? dom.xAxisCanvas.getContext('2d')
    if (!this.xAxisCtx) {
      this.xAxisCtx = xAxisCtx
    }
    if (xAxisCtx && this.timeAxisLayer) {
      const opt = this.deps.getOption()
      const dataManager = this.deps.getDataManager()
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
        marketSession: this.deps.getMarketSession(),
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
        isAsiaMarket: this.getSettings().isAsiaMarket as boolean,
        colorPresetSettings: this.getSettings().colorPresetSettings,
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
    this.rejectFrameCaptures(new KLineChartError(GENERIC_ERROR_CODES.DISPOSED, '截图帧调度已停止'))
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
    this.crosshairOverlay.dispose()
    this.scene.dispose()
    this.paneCtxMap.clear()
  }
}
