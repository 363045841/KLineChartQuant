/** 图表帧准备、各 Pane 坐标范围与 Scene 绘制调度。 */

import { createFrameCoordinates } from '@/engine/coordinates/impl/frameCoordinates.js'
import { symbolSpecIdentityKey } from '@/engine/data/symbolIdentity.js'
import { computeDrawingPriceRange } from '@/engine/drawing/geometry/impl/frameProjection.js'
import type { SnapLine } from '@/foundation/plugin/index.js'
import { GENERIC_ERROR_CODES, KLineChartError } from '../../../errors.js'
import type { ChartSettings } from '../../../foundation/config/chartSettings.js'
import { PRICE_AXIS_RANGE_MODE } from '../../../foundation/config/priceAxisRangeMode.js'
import type {
  AxisLabelsFrame,
  IndicatorAvailabilityReader,
  IndicatorRenderStateReader,
  RenderContext,
  TimeShareGeometry,
  XAxisRange,
} from '../../../foundation/plugin/index.js'
import { wrapPaneInfo } from '../../../foundation/plugin/index.js'
import {
  createFrameTransaction,
  type FrameTransaction,
} from '../../../foundation/reactivity/frameTransaction.js'
import type { ReadonlySignal } from '../../../foundation/reactivity/signal.js'
import {
  createTimeFormatter,
  resolveDisplayTimeZone,
  type TimeFormatter,
  type TimeTick,
  type TimeZoneSetting,
} from '../../../foundation/time/index.js'
import { resolveThemeColors } from '../../../foundation/tokens/index.js'
import { resolveChartWorkspaceId } from '../../../foundation/types/chartView.js'
import type { ChartSeriesDatum, KLineData } from '../../../foundation/types/price.js'
import { ScaleType } from '../../../foundation/types/scaleType.js'
import { systemClock } from '../../../foundation/utils/clock.js'
import { createScene } from '../../../rendering/scene/createScene.js'
import {
  type ContextLayer,
  type FramePaint,
  LAYER_PANE_GLOBAL,
  type LayerRole,
  type Scene,
  scenePaintTarget,
} from '../../../rendering/scene/types.js'
import { AxisWidthEstimator } from '../../axisWidth/impl/axisWidthEstimator.js'
import type { KLinePositions, Viewport } from '../../chart/index.js'
import { ChartDataViewId } from '../../chartModel/index.js'
import type { ChartDataManager } from '../../data/chartDataManager.js'
import type { DrawingObject, SnapIndicatorValue } from '../../drawing/index.js'
import {
  createDrawingLayer,
  createDrawingSessionLayer,
  createIndicatorDrawingLayer,
  DrawingDefinitionRegistry,
  DrawingStore,
  projectDrawingsForFrame,
  registerDefaultDrawingDefinitions,
} from '../../drawing/index.js'
import type { PaneRenderer } from '../../pane/index.js'
import { UpdateLevel } from '../../pane/index.js'
import { MAIN_PANE_ID } from '../../pane/types.js'
import { isPlotRenderState } from '../../plots/impl/readPlotState.js'
import { createCandleLayer } from '../../renderers/candle.js'
import { createComparisonLineLayer } from '../../renderers/comparisonLine.js'
import { CrosshairOverlay } from '../../renderers/crosshair/impl/crosshairOverlay.js'
import {
  type LockedCrosshairProjection,
  resolveLockedCrosshair,
} from '../../renderers/crosshair/impl/resolveLockedCrosshair.js'
import { createExtremaMarkersLayer } from '../../renderers/extremaMarkers.js'
import { createFiveDayTimeShareLayer } from '../../renderers/fiveDayTimeShare.js'
import { computeFootprintPriceRange, createFootprintLayer } from '../../renderers/footprint.js'
import { createGridLinesLayer } from '../../renderers/gridLines.js'
import {
  createAxisLabelsFrame,
  formatLastPriceCountdown,
  getLastPriceRemainingMs,
  paintAxisLabels,
  registerAxisLabel,
} from '../../renderers/impl/labels/index.js'
import { createLastPriceLabelLayer, createLastPriceLineLayer } from '../../renderers/lastPrice.js'
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
import type { ChartFrameGeometry, RendererDependencies } from '../types.js'
import {
  computePaneAutoRange,
  type ResolvedPanePriceRange,
  resolvePanePriceRange,
} from './panePriceRange.js'
import { projectFrameTimeTicks } from './timeTicks.js'

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
  /** K 线柱物理像素宽度 */
  kWidthPx: number
  /** Overlay 帧复用上一帧的几何缓存 */
  useCachedFrame: boolean
  /** 当前模式对应的强类型行情数据。 */
  data: readonly ChartSeriesDatum[]
  /** 与本帧主序列快照对应的提交版本。 */
  dataRevision: number
  /** 分时视图供所有 renderer 和交互共享的帧级几何。 */
  timeShareGeometry: TimeShareGeometry | null
  /** 帧准备阶段生成的真正可视 K 线极值。 */
  visiblePriceExtrema: VisiblePriceExtrema | null
  /** 跨数量级时生成的低频右轴测量意图；由 seal 阶段提交。 */
  /** 本帧每 Pane 解析后的价格轴范围、基准价与锁定初始化标记。 */
  panePriceRanges: Record<string, ResolvedPanePriceRange>
  /** 本帧是否启用比较叠加（仅 K 线视图）。 */
  comparisonActive: boolean
  /** 单帧生成的比较投影；轴范围、百分比基准与折线共享。 */
  comparisonProjection: ReturnType<ChartDataManager['getComparisonProjection']> | null
  /** 本帧指标实例状态读取器，范围解析与绘制共用。 */
  indicatorStateReader: IndicatorRenderStateReader
  /** 本帧指标可用性读取器。 */
  indicatorAvailability: IndicatorAvailabilityReader
  /** 本帧时间轴刻度；网格线与时间轴共享同一份结果。 */
  timeTicks: readonly TimeTick[]
}

/** Overlay 帧复用的上一帧几何缓存。 */
type CachedDrawFrame = {
  viewport: Viewport
  range: VisibleRange
  kLinePositions: KLinePositions
  kLineCenters: number[]
  kWidthPx: number
  timeShareGeometry: TimeShareGeometry | null
  visiblePriceExtrema: VisiblePriceExtrema | null
  timeTicks: readonly TimeTick[]
}

/** 单个 Pane 的 canvas 上下文与布局形状。 */
type PaneContexts = ReturnType<PaneRenderer['getContexts']>
type PaneLayout = ReturnType<PaneRenderer['getPane']>
type ViewportFrame = FrameContext['vp']

/** 把可空上下文收敛为可选属性，避免在 RenderContext 里散落 `?? undefined`。 */
function optional<T>(value: T | null | undefined): T | undefined {
  return value ?? undefined
}

/** Pane 三种表面的 layer 角色分组，避免每帧重建。 */
const MAIN_CANVAS_ROLES: readonly LayerRole[] = ['background', 'primary', 'indicator', 'component']
const OVERLAY_CANVAS_ROLES: readonly LayerRole[] = ['drawing', 'overlay']
const SESSION_CANVAS_ROLES: readonly LayerRole[] = ['overlay']

/** 缓存帧直接复用横向几何与时间分时几何，否则从当前投影读取。 */
function resolveFrameGeometry(
  cached: CachedDrawFrame | null,
  projection: FrameContext['viewSnapshot'],
): Pick<CachedDrawFrame, 'kLinePositions' | 'kLineCenters' | 'kWidthPx' | 'timeShareGeometry'> {
  if (cached) {
    return {
      kLinePositions: cached.kLinePositions,
      kLineCenters: cached.kLineCenters,
      kWidthPx: cached.kWidthPx,
      timeShareGeometry: cached.timeShareGeometry,
    }
  }
  return {
    kLinePositions: projection.positions,
    kLineCenters: projection.centers,
    kWidthPx: projection.kWidthPx,
    timeShareGeometry: projection.timeShareGeometry,
  }
}

/** 清空绘图表面；overlay 使用 canvas 自身宽度，主图使用逻辑绘图宽度。 */
function clearPlotSurface(
  ctx: CanvasRenderingContext2D | null | undefined,
  vp: ViewportFrame,
  pane: PaneLayout,
  useCanvasWidth = false,
): void {
  if (!ctx) return
  const width = useCanvasWidth ? ctx.canvas.width / vp.dpr : vp.plotWidth
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.scale(vp.dpr, vp.dpr)
  ctx.clearRect(0, 0, width + 1, pane.height + 2 / vp.dpr)
}

/** 四侧轴表面；静态与动态标签分别跟随 Main / Overlay 更新。 */
const AXIS_SURFACES = ['yRightStatic', 'yRightOverlay', 'yLeftStatic', 'yLeftOverlay'] as const
type AxisSurface = (typeof AXIS_SURFACES)[number]

/** 判断某侧轴表面是否属于本次更新级别。 */
function axisSurfaceUpdates(surface: AxisSurface, level: UpdateLevel): boolean {
  if (surface.endsWith('Static')) return level === UpdateLevel.Main || level === UpdateLevel.All
  return level === UpdateLevel.Overlay || level === UpdateLevel.All
}

/** 数据空间折线的每帧映射；仅线性价格轴可生成。 */
function createDataTransform(
  pane: PaneLayout,
  vp: ViewportFrame,
): { offsetX: number; yScale: number; yOffset: number } | undefined {
  const yOffset = pane.yAxis.priceToY(0)
  const yScale = pane.yAxis.priceToY(1) - yOffset
  if (pane.yAxis.getScaleType() !== ScaleType.Linear) return undefined
  if (!Number.isFinite(yScale) || !Number.isFinite(yOffset) || yScale === 0) return undefined
  return { offsetX: vp.scrollLeft, yScale, yOffset }
}

/** 清空单侧轴画布，保留 canvas 当前物理宽度。 */
function clearAxisSurface(
  ctx: CanvasRenderingContext2D | null | undefined,
  dpr: number,
  height: number,
): void {
  if (!ctx) return
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, ctx.canvas.width / dpr, height + 2 / dpr)
}

/** 范围决策共用的输入快照；读取阶段不修改 frame 或业务状态。 */
type PanePriceRangeInputs = Pick<FrameContext, 'comparisonActive' | 'comparisonProjection'> & {
  dataManager: ChartDataManager
  mode: ReturnType<RendererDependencies['getActiveMode']>
  axisStates: ReturnType<RendererDependencies['mainPriceAxis']['readonly']['paneRanges']['peek']>
  /** 每轴由实例输出派生的极值；主图价格轴也在其中。 */
  axisRanges: ReadonlyMap<string, { min: number; max: number } | null>
}

/** 范围决策结果及待提交的锁定初始化意图。 */
type PanePriceRangeResult = {
  panePriceRanges: Record<string, ResolvedPanePriceRange>
  pendingHandRanges: Array<{ axisId: string; range: PriceRange }>
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
  geometry: ChartFrameGeometry | null
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
/** 可参与磁吸的指标序列：在 Bar 上画出单一价格的折线类。 */
type SnapValuePlot = Extract<
  import('@363045841yyt/klinechart-plot-contracts').Plot,
  {
    readonly kind:
      | 'line'
      | 'linebr'
      | 'stepline'
      | 'steplinebr'
      | 'histogram'
      | 'columns'
      | 'points'
  }
>

/**
 * 标记类（shape/char/arrow）与 OHLC 图形没有单值语义，不参与值轴吸附。
 */
function isSnapValuePlot(
  plot: import('@363045841yyt/klinechart-plot-contracts').Plot,
): plot is SnapValuePlot {
  switch (plot.kind) {
    case 'line':
    case 'linebr':
    case 'stepline':
    case 'steplinebr':
    case 'histogram':
    case 'columns':
    case 'points':
      return true
    default:
      return false
  }
}

export class ChartRenderer {
  /** 依赖注入容器，ChartRenderer 不直接持有状态，从 deps 接口读取，也便于测试 mock */
  private deps: RendererDependencies

  /**
   * 帧事务：scheduleDraw 只写输入并合并 rAF；flush 内 prepare → seal → paint。
   * 绘制阶段不再反向写 kernel 几何（seal 在 render 回调最前、与 paint 同代）。
   */
  private readonly frameTx: FrameTransaction<FrameDrawInput, FrameDrawSnapshot>

  /** 直接投影帧事务的已发布快照，不另建可写的视口状态。 */
  readonly frameGeometry: ReadonlySignal<ChartFrameGeometry | null>

  /** 合并多次 scheduleDraw 的 level，合并后写入 frameTx */
  private pendingLevel: UpdateLevel = UpdateLevel.All

  /** 已排队的 rAF 句柄；null 表示当前没有挂起的帧调度 */
  private raf: number | null = null
  /** 捕获函数必须在绘制事务完成后、同一个 RAF 回调内同步执行。 */
  private pendingCaptures: Array<{ run: () => void; reject: (cause: unknown) => void }> = []
  /** 最新价签的秒级倒计时计时器；只请求 overlay 重绘。 */
  private lastPriceCountdownTimer: ReturnType<typeof setTimeout> | null = null

  readonly drawingStore: DrawingStore
  /** 指标图元包装缓存：未变化的源对象只绑定一次归属，避免每次投影重建。 */
  private readonly indicatorDrawingWrappers = new Map<
    string,
    WeakMap<DrawingObject, DrawingObject>
  >()
  /** 指标图元列表缓存；计算快照、实例列表和工作区不变时直接复用同一数组。 */
  private indicatorDrawingsCache: {
    readonly states: ReadonlyMap<string, unknown>
    readonly instances: readonly { readonly id: string }[]
    readonly workspaceId: ReturnType<typeof resolveChartWorkspaceId>
    readonly drawings: readonly DrawingObject[]
  } | null = null
  private readonly drawingDefinitions = new DrawingDefinitionRegistry()
  private readonly drawingLayer = createDrawingLayer()
  private readonly indicatorDrawingLayer = createIndicatorDrawingLayer()
  private xAxisCtx: CanvasRenderingContext2D | null = null
  private readonly crosshairOverlay: CrosshairOverlay

  private cachedDrawFrame: CachedDrawFrame | null = null

  private scene: Scene<RenderContext>
  private frameCount = 0
  private paneCtxMap = new Map<string, RenderContext>()
  /** 本帧锁定竖线投影；时间轴标签在 renderCrosshair 之后复用同一份结果。 */
  private lockedCrosshair: LockedCrosshairProjection | null = null
  private timeAxisLayer: ContextLayer<RenderContext> | null = null
  private displayTimeZoneSetting: TimeZoneSetting = 'UTC'
  private displayTimeFormatter: TimeFormatter = createTimeFormatter('UTC')
  /** 上次已测量右轴的可视区绝对值数量级。 */
  private readonly axisWidthEstimator = new AxisWidthEstimator()
  private readonly retainedAxisLabels = new Map<string, AxisLabelsFrame>()
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
      this.deps.footprintState$.peek(),
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
      this.deps.getActiveMode(),
      layers,
      ...layers.map((layer) => layer.visible),
      ...this.deps.getPaneRenderers().flatMap((renderer) => {
        const pane = renderer.getPane()
        return [
          renderer,
          pane.id,
          pane.top,
          pane.height,
          pane.role,
          ...pane.axes.flatMap((axis) => [
            axis.axisId,
            axis.yAxis.getScaleType(),
            axis.yAxis.getContentTop(),
            axis.yAxis.getContentHeight(),
            axis.yAxis.getBasePrice(),
          ]),
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
      // 锁定状态变化必须触发覆盖层重绘；屏幕 x 每帧由时间投影现算。
      interaction.crosshairLock,
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
      this.deps.getSnapIndicator?.(),
      countdown,
    ]
  }

  constructor(deps: RendererDependencies) {
    this.deps = deps
    this.crosshairOverlay = new CrosshairOverlay(deps.getDom().canvasLayer)
    this.drawingStore = new DrawingStore({
      drawings$: deps.drawings$,
      selectedDrawingIds$: deps.selectedDrawingIds$,
      getOverlay: deps.getOverlay,
      getIndicatorDrawings: () => this.getIndicatorDrawings(),
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
            geometry: null,
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
        const frame = skip
          ? null
          : this.prepareFrameData(mainChanged ? UpdateLevel.All : UpdateLevel.Overlay, countdown)
        const previousGeometry = this.frameTx.published$.peek().geometry
        // 跳过绘制时保留上屏几何；无数据的清屏帧发布 null，不能残留旧选框。
        const geometry = skip
          ? previousGeometry
          : frame
            ? previousGeometry?.viewSnapshot === frame.viewSnapshot &&
              previousGeometry.viewport === frame.vp &&
              previousGeometry.data === frame.data
              ? previousGeometry
              : Object.freeze({
                  viewSnapshot: frame.viewSnapshot,
                  viewport: frame.vp,
                  data: frame.data,
                })
            : null
        return {
          generation,
          countdown,
          level: mainChanged ? UpdateLevel.All : UpdateLevel.Overlay,
          frame,
          geometry,
          skip,
        }
      },
      render: (snapshot) => {
        // generation 0 占位不绘制
        if (snapshot.generation === 0) return
        // timer 只请求下一帧；即使本帧跳过 paint，也由事务统一续订。
        this.scheduleLastPriceCountdown(snapshot.countdown)
        if (snapshot.skip) return
        // 调整后备存储会自动清屏，必须紧邻本帧绘制，不能在 ResizeObserver 中提前执行。
        this.deps.commitPendingLayout()
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
        // 绘制：清原生目标 → 构建 RenderContext → Scene 选择目标与层序 → 时间轴。
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
    this.frameGeometry = this.frameTx.select((snapshot) => snapshot.geometry)
  }

  initCoreRenderers(): void {
    this.scene.addLayer(createLastPriceLineLayer())
    this.scene.addLayer(createLastPriceLabelLayer())
    const opt = this.deps.getOption()
    const axisWidth = opt.rightAxisWidth + (opt.priceLabelWidth ?? 0)
    const interaction = this.deps.getInteraction()

    {
      this.timeAxisLayer = createTimeAxisLayer({
        height: opt.bottomAxisHeight,
        getCrosshair: () => {
          // 锁定的竖线由渲染帧解析；时间轴标签必须与它同一条线，而不是鼠标位置。
          const locked = this.lockedCrosshair
          if (locked) return { x: locked.x, index: locked.index }
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
      this.scene.addLayer(createFootprintLayer(() => this.deps.footprintState$.peek()))
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
    this.scene.addLayer(this.drawingLayer)
    this.scene.addLayer(this.indicatorDrawingLayer)
    this.scene.addLayer(createDrawingSessionLayer())
  }

  getScene(): Scene {
    return this.scene
  }

  getDrawingStore(): DrawingStore {
    return this.drawingStore
  }

  /**
   * 已提交层图元的线段（Pane 局部坐标），供磁吸候选。
   * 会话覆盖不进入候选：拖拽中的图元吸自己会形成反馈回路。
   */
  getCoordinates(
    paneId: string,
  ): import('../../../foundation/geometry/frameCoordinates.js').FrameCoordinates | null {
    const context = this.paneCtxMap.get(paneId)
    if (!context) return null
    const dataManager = this.deps.getDataManager()
    const symbol = dataManager.symbols.peek()[0]
    const symbolKey = symbol === undefined ? undefined : symbolSpecIdentityKey(symbol)
    if (context.symbolKey !== symbolKey || context.period !== dataManager.currentPeriod) return null
    return context.coordinates
  }

  /** 已提交图元的磁吸线段，来自同一帧投影。 */
  getCommittedSnapLines(paneId: string): ReadonlyArray<SnapLine> {
    return this.paneCtxMap.get(paneId)?.drawingProjection?.snapLines ?? []
  }

  /**
   * 指定逻辑下标处该 Pane 的可吸附指标值。
   *
   * 只取「在某根 Bar 上画出一个价格」的序列：标记类（shape/char/arrow）与
   * OHLC 图形没有单值语义，参与吸附只会产生歧义。Plot 的显示位移在取样时扣除，
   * 因此读 `data[barIndex - offset]`。
   */
  getIndicatorSnapValues(paneId: string, barIndex: number): ReadonlyArray<SnapIndicatorValue> {
    const manager = this.deps.getIndicatorManager()
    const states = manager.getRenderStatesSnapshot()
    const values: SnapIndicatorValue[] = []
    for (const instance of manager.indicatorsComputed.peek()) {
      if ((instance.paneId ?? MAIN_PANE_ID) !== paneId) continue
      const state = states.get(instance.id)
      if (!isPlotRenderState(state)) continue
      for (const plot of state.plots) {
        if (!plot.visible || !isSnapValuePlot(plot)) continue
        const point = plot.data[barIndex - plot.offset]
        if (point === undefined) continue
        values.push({ id: `${instance.id}:${plot.id}`, value: point.value })
      }
    }
    return values
  }

  getSettings(): ChartSettings {
    return this.deps.settings$.peek()
  }

  /** 仅在持久化显示时区偏好变更时重建 formatter 状态。 */
  private getDisplayTimeFormatter(): TimeFormatter {
    const configured = this.getSettings().displayTimeZone
    const setting: TimeZoneSetting = configured === 'local' ? 'local' : 'UTC'
    if (setting !== this.displayTimeZoneSetting) {
      this.displayTimeZoneSetting = setting
      this.displayTimeFormatter = createTimeFormatter(resolveDisplayTimeZone(setting))
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
  }

  /** 将最新 viewport 位置同步到原生滚动容器，作为绘制帧的第一项 DOM 副作用。 */
  private commitViewportScroll(): void {
    this.deps.commitViewportScroll(this.deps.viewport.readonly.scrollLeft.peek())
  }

  /** 将 prepareFrameData 的帧几何按 level 画到 canvas，含所有 pane 的 main/overlay/yAxis 及时间轴 */
  private drawWithFrame(level: UpdateLevel, frame: FrameContext | null): void {
    // 当前视图无可绘制数据时必须清空所有 canvas，不能保留前一视图的像素。
    if (!frame) {
      this.lockedCrosshair = null
      this.clearAllCanvases()
      return
    }

    // 遍历所有 pane，清 canvas → 构建 RenderContext → scene.paint
    const { axisLabelsFrame, sharedXAxisRanges } = this.renderPanes(frame, level)
    this.renderCrosshair(frame)

    // 画底部时间轴（独立 layer，不进 scene）
    this.renderXAxis(frame, axisLabelsFrame, sharedXAxisRanges)
  }

  /** 在 pane 范围与绘制完成后，向整张图表的独立表面提交一次十字线。 */
  private renderCrosshair(frame: FrameContext): void {
    const interaction = this.deps.getInteraction()
    const renderers = this.deps.getPaneRenderers()
    const firstPane = renderers[0]?.getPane()
    const context = firstPane ? this.paneCtxMap.get(firstPane.id) : undefined
    if (!context) {
      this.lockedCrosshair = null
      this.crosshairOverlay.clear()
      return
    }
    const lock = interaction.crosshairLock
    this.lockedCrosshair = lock ? resolveLockedCrosshair(lock, context.coordinates) : null
    const activePane = renderers
      .find((renderer) => renderer.getPane().id === interaction.activePaneId)
      ?.getPane()
    this.crosshairOverlay.paint({
      viewport: frame.vp,
      pos: interaction.crosshairPos,
      price: interaction.crosshairPrice,
      activePane: activePane ? wrapPaneInfo(activePane) : null,
      lockedX: this.lockedCrosshair?.x ?? null,
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
    const remaining = getLastPriceRemainingMs(period, last.timestamp, now)
    return {
      now,
      remainingMs: remaining,
      text: formatLastPriceCountdown(remaining),
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
  /** 缓存帧复用极值；新帧按当前可见区间计算。 */
  private computeFrameVisibleExtrema(
    cached: CachedDrawFrame | null,
    projection: FrameContext['viewSnapshot'],
    data: readonly ChartSeriesDatum[],
    range: VisibleRange,
    centers: readonly number[],
    vp: Viewport,
  ): VisiblePriceExtrema | null {
    if (cached) return cached.visiblePriceExtrema
    if (!projection.hasPriceSeries) return null
    const shape = this.deps.settings$.peek().klineShape
    return computeVisiblePriceExtrema(
      data as readonly KLineData[],
      range,
      centers,
      vp.scrollLeft,
      vp.plotWidth,
      shape === 'line' || shape === 'area',
    )
  }

  private prepareFrameData(level: UpdateLevel, countdown: FrameCountdown): FrameContext | null {
    const cached = level === UpdateLevel.Overlay ? this.cachedDrawFrame : null
    const useCachedFrame = cached !== null

    const vp = cached ? cached.viewport : this.peekViewport()
    if (!vp) return null

    const internalData = this.deps.getDataManager().getRenderData()
    if (internalData.length === 0) return null

    const projection = this.deps.viewport.readonly.viewSnapshot.peek()
    if (!projection.ready) return null
    // 全部横向几何由模型一次投影，render 不再派生另一套坐标。
    const range = cached ? cached.range : this.deps.viewport.readonly.visibleRange.peek()

    const dataManager = this.deps.getDataManager()

    const geometry = resolveFrameGeometry(cached, projection)
    const visiblePriceExtrema = this.computeFrameVisibleExtrema(
      cached,
      projection,
      internalData,
      range,
      geometry.kLineCenters,
      vp,
    )
    const indicatorManager = this.deps.getIndicatorManager()

    // 时间轴刻度只依赖可见区间与槽位网格；Overlay 帧沿用已缓存的一份。
    const timeTicks = cached
      ? cached.timeTicks
      : projectFrameTimeTicks({
          data: internalData,
          grid: projection.grid,
          scrollLeft: vp.scrollLeft,
          plotWidth: vp.plotWidth,
          period: dataManager.currentPeriod,
          timeZone: this.getDisplayTimeFormatter().timeZone,
        })

    return {
      viewSnapshot: this.deps.viewport.readonly.viewSnapshot.peek(),
      countdown,
      vp,
      range,
      ...geometry,
      useCachedFrame,
      data: internalData,
      dataRevision: dataManager.getRenderDataRevision(),
      visiblePriceExtrema,
      timeTicks,
      // 价格轴范围在 render 回调里、visibleRange 更新之后统一收集。
      panePriceRanges: {},
      comparisonActive: false,
      comparisonProjection: null,
      indicatorStateReader: indicatorManager.createRenderStateReader(),
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
    const inputs = this.preparePanePriceRangeInputs(frame)
    const result = this.resolveFramePanePriceRanges(frame, inputs)
    this.applyPanePriceRangeFrame(frame, inputs, result)
    this.initializePendingHandRanges(result.pendingHandRanges)
  }

  /** 读取本帧范围输入，比较投影与轴状态各准备一次。 */
  private preparePanePriceRangeInputs(frame: FrameContext): PanePriceRangeInputs {
    const indicatorManager = this.deps.getIndicatorManager()
    const dataManager = this.deps.getDataManager()
    const mode = this.deps.getActiveMode()

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

    const axisRanges = new Map<string, { min: number; max: number } | null>()
    for (const renderer of this.deps.getPaneRenderers()) {
      for (const axis of renderer.getPane().axes) {
        axisRanges.set(
          axis.axisId,
          frame.useCachedFrame ? null : indicatorManager.getAxisIndicatorRange(axis.axisId),
        )
      }
    }
    return {
      dataManager,
      mode,
      axisRanges,
      comparisonActive,
      comparisonProjection,
      axisStates: this.deps.mainPriceAxis.readonly.paneRanges.peek(),
    }
  }

  /** 解析各 pane 范围并收集初始化意图，不修改 frame 或内核。 */
  private resolveFramePanePriceRanges(
    frame: FrameContext,
    inputs: PanePriceRangeInputs,
  ): PanePriceRangeResult {
    const panePriceRanges: Record<string, ResolvedPanePriceRange> = {}
    // 收集阶段只做决策，不写内核；待初始化的锁定范围先收集，循环后统一提交。
    const pendingHandRanges: Array<{ axisId: string; range: PriceRange }> = []
    for (const renderer of this.deps.getPaneRenderers()) {
      const pane = renderer.getPane()
      const axes = pane.axes
      for (const axis of axes) {
        const auto = this.resolveAxisAutoRange(frame, inputs, pane, axis.axisId)
        const context = this.createPaneRenderContext(
          frame,
          pane,
          renderer.getContexts(),
          inputs.dataManager,
          createAxisLabelsFrame(),
          [],
        )
        const drawings = this.drawingStore.getVisibleByPane(
          {
            paneId: pane.id,
            workspaceId: resolveChartWorkspaceId(this.deps.dataView$.peek()),
            symbolKey: context.symbolKey,
            period: context.period,
          },
          'committed',
          'indicator',
        )
        const drawingRange =
          axis.axisId === axes[0]?.axisId
            ? computeDrawingPriceRange(drawings, this.drawingDefinitions, context)
            : null
        const combined = drawingRange
          ? {
              range: {
                minPrice: auto ? Math.min(auto.range.minPrice, drawingRange.min) : drawingRange.min,
                maxPrice: auto ? Math.max(auto.range.maxPrice, drawingRange.max) : drawingRange.max,
              },
              basePrice: auto?.basePrice ?? null,
            }
          : auto
        const resolved = this.resolvePaneRange(inputs, axis.axisId, combined)
        panePriceRanges[axis.axisId] = resolved
        this.collectPendingHandRange(pendingHandRanges, frame, axis.axisId, resolved)
      }
    }
    return { panePriceRanges, pendingHandRanges }
  }

  /** 单轴自动范围：主图价格轴沿用行情范围，其余轴取实例输出极值。 */
  private resolveAxisAutoRange(
    frame: FrameContext,
    inputs: PanePriceRangeInputs,
    pane: PaneLayout,
    axisId: string,
  ): ReturnType<typeof computePaneAutoRange> {
    if (pane.id === MAIN_PANE_ID && axisId === MAIN_PANE_ID) {
      return this.resolvePaneAutoRange(frame, inputs, pane)
    }
    const range = inputs.axisRanges.get(axisId)
    return range ? { range: { minPrice: range.min, maxPrice: range.max }, basePrice: null } : null
  }

  /** 计算主图价格轴自动范围；足迹范围只在主图叠加。 */
  private resolvePaneAutoRange(
    frame: FrameContext,
    inputs: PanePriceRangeInputs,
    pane: PaneLayout,
  ): ReturnType<typeof computePaneAutoRange> {
    const shape = this.deps.settings$.peek().klineShape
    const auto = computePaneAutoRange({
      paneId: pane.id,
      role: pane.role,
      range: frame.range,
      dataManager: inputs.dataManager,
      mode: inputs.mode,
      mainIndicatorRange: inputs.axisRanges.get(MAIN_PANE_ID) ?? null,
      comparisonActive: inputs.comparisonActive,
      comparisonProjection: inputs.comparisonProjection,
      subIndicatorRange: null,
      closeOnly: shape === 'line' || shape === 'area',
    })
    if (pane.id !== MAIN_PANE_ID || inputs.comparisonActive) return auto
    const footprintRange = computeFootprintPriceRange(this.deps.footprintState$.peek(), frame.range)
    if (!footprintRange) return auto
    return {
      range: auto
        ? {
            minPrice: Math.min(auto.range.minPrice, footprintRange.minPrice),
            maxPrice: Math.max(auto.range.maxPrice, footprintRange.maxPrice),
          }
        : footprintRange,
      basePrice: auto?.basePrice ?? null,
    }
  }

  /** 把自动范围与轴状态合成为最终范围。 */
  private resolvePaneRange(
    inputs: PanePriceRangeInputs,
    axisId: string,
    auto: ReturnType<typeof computePaneAutoRange>,
  ): ResolvedPanePriceRange {
    const axisState = inputs.axisStates[axisId]
    return resolvePanePriceRange({
      rangeMode: axisState?.rangeMode ?? PRICE_AXIS_RANGE_MODE.AUTO,
      handRange: axisState?.handRange ?? null,
      autoRange: auto?.range ?? null,
      basePrice: auto?.basePrice ?? null,
    })
  }

  /** 新帧首次锁定手工范围时记录待提交意图；缓存帧不重复初始化。 */
  private collectPendingHandRange(
    pending: Array<{ axisId: string; range: PriceRange }>,
    frame: FrameContext,
    axisId: string,
    resolved: ResolvedPanePriceRange,
  ): void {
    if (frame.useCachedFrame || !resolved.initializeHandRange || !resolved.range) return
    pending.push({ axisId, range: resolved.range })
  }

  /** 将计算结果发布到帧对象，供后续轴投影和绘制共享。 */
  private applyPanePriceRangeFrame(
    frame: FrameContext,
    inputs: PanePriceRangeInputs,
    result: PanePriceRangeResult,
  ): void {
    frame.comparisonActive = inputs.comparisonActive
    frame.comparisonProjection = inputs.comparisonProjection
    frame.panePriceRanges = result.panePriceRanges
  }

  /** 唯一业务状态写入边界：一次 Action 初始化所有待保存的锁定范围。 */
  private initializePendingHandRanges(
    pendingHandRanges: PanePriceRangeResult['pendingHandRanges'],
  ): void {
    if (pendingHandRanges.length > 0) {
      this.deps.mainPriceAxis.actions.initializeHandRanges(pendingHandRanges)
    }
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
      r.clearText()
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
      // 可见 GPU 表面不在 2D 上下文里，必须由后端显式清空。
      if (r.getDom().mainGpuCanvas) {
        r.getMainGpuSurface(this.deps.getSceneRenderer())?.paint([], vp.dpr, true)
      }
      drawingCtx?.clearRect(0, 0, vp.plotWidth + 1, pane.height + 2 / vp.dpr)
      overlayCtx?.clearRect(0, 0, vp.plotWidth + 1, pane.height + 2 / vp.dpr)
      clearAxisSurface(yAxisCtx, vp.dpr, pane.height)
      clearAxisSurface(yAxisOverlayCtx, vp.dpr, pane.height)
      clearAxisSurface(leftAxisCtx, vp.dpr, pane.height)
      clearAxisSurface(leftAxisOverlayCtx, vp.dpr, pane.height)
    }
    const xCtx = this.xAxisCtx
    if (xCtx) {
      const xW = xCtx.canvas.width
      const xH = xCtx.canvas.height
      xCtx.clearRect(0, 0, xW, xH)
    }
  }

  /** 为当前活动指标绑定对象归属与面板，交给公共 drawing 链路绘制。 */
  private getIndicatorDrawings(): readonly DrawingObject[] {
    const manager = this.deps.getIndicatorManager()
    const states = manager.getRenderStatesSnapshot()
    const workspaceId = resolveChartWorkspaceId(this.deps.dataView$.peek())
    const instances = manager.indicatorsComputed.peek()
    const cached = this.indicatorDrawingsCache
    if (
      cached !== null &&
      cached.states === states &&
      cached.instances === instances &&
      cached.workspaceId === workspaceId
    )
      return cached.drawings
    const active = new Set(instances.map((instance) => instance.id))
    for (const id of this.indicatorDrawingWrappers.keys())
      if (!active.has(id)) this.indicatorDrawingWrappers.delete(id)
    const drawings = instances.flatMap((instance) => {
      const state = states.get(instance.id)
      if (!isPlotRenderState(state) || !state.drawings) return []
      let cache = this.indicatorDrawingWrappers.get(instance.id)
      if (!cache) {
        cache = new WeakMap()
        this.indicatorDrawingWrappers.set(instance.id, cache)
      }
      const paneId = instance.paneId ?? MAIN_PANE_ID
      return state.drawings.map((drawing) => {
        const wrapped = cache.get(drawing)
        if (
          wrapped !== undefined &&
          wrapped.paneId === paneId &&
          wrapped.workspaceId === workspaceId
        )
          return wrapped
        const wrapper: DrawingObject = {
          ...drawing,
          id: `${instance.id}:${drawing.id}`,
          ownerId: instance.id,
          paneId,
          workspaceId,
        }
        cache.set(drawing, wrapper)
        return wrapper
      })
    })
    this.indicatorDrawingsCache = { states, instances, workspaceId, drawings }
    return drawings
  }

  /** 提交轴宽与保留标签；宽度变化时只重画轴画布，不重跑主图。 */
  private commitAxisLabelWidths(
    level: UpdateLevel,
    axisLabelsFrame: AxisLabelsFrame,
    vp: ViewportFrame,
  ): void {
    const widths = this.measureAxisWidths(level, axisLabelsFrame)
    // 宿主快捷入口消费已测量的主轴列几何，不能按整块多轴画布居中。
    for (const renderer of this.deps.getPaneRenderers()) {
      const primaryAxisId = renderer.getPane().axes[0]!.axisId
      const width = `${widths.rightByAxis[primaryAxisId]}px`
      const style = renderer.getDom().yAxisCanvas.style
      if (style.getPropertyValue('--klc-primary-axis-width') !== width)
        style.setProperty('--klc-primary-axis-width', width)
    }
    this.retainAxisLabels(level, axisLabelsFrame)
    if (this.deps.commitAxisWidths?.(widths)) this.repaintAxisSurfaces(vp)
  }

  /** 按本帧标签估算左右轴宽与逐列宽度。 */
  private measureAxisWidths(
    level: UpdateLevel,
    axisLabelsFrame: AxisLabelsFrame,
  ): ReturnType<AxisWidthEstimator['estimate']> {
    return this.axisWidthEstimator.estimate({
      labels: axisLabelsFrame,
      axes: this.deps.getPaneRenderers().flatMap((renderer) => {
        const pane = renderer.getPane()
        return pane.axes.map((axis) => ({ axisId: axis.axisId, paneId: pane.id }))
      }),
      updateStatic: level === UpdateLevel.Main || level === UpdateLevel.All,
      updateOverlay: level === UpdateLevel.Overlay || level === UpdateLevel.All,
    })
  }

  /** 更新每条轴的轴标签保留帧，并移除已消失轴的记录。 */
  private retainAxisLabels(level: UpdateLevel, axisLabelsFrame: AxisLabelsFrame): void {
    const surfaces = AXIS_SURFACES
    const visibleAxisIds = new Set(
      this.deps
        .getPaneRenderers()
        .flatMap((renderer) => renderer.getPane().axes.map((axis) => axis.axisId)),
    )
    for (const id of this.retainedAxisLabels.keys()) {
      if (!visibleAxisIds.has(id)) this.retainedAxisLabels.delete(id)
    }
    for (const renderer of this.deps.getPaneRenderers()) {
      for (const axis of renderer.getPane().axes) {
        const retainedFrame = this.retainedAxisLabels.get(axis.axisId) ?? createAxisLabelsFrame()
        this.retainedAxisLabels.set(axis.axisId, retainedFrame)
        for (const surface of surfaces) {
          if (!axisSurfaceUpdates(surface, level)) continue
          const retained = retainedFrame.forSurface(surface, axis.axisId).labels
          retained.length = 0
          retained.push(...axisLabelsFrame.forSurface(surface, axis.axisId).labels)
        }
      }
    }
  }

  /** 轴宽变化后只重画轴表面，复用保留标签，不重跑主图与指标。 */
  private repaintAxisSurfaces(vp: ViewportFrame): void {
    for (const renderer of this.deps.getPaneRenderers()) {
      const pane = renderer.getPane()
      renderer.resize(vp.plotWidth, pane.height, vp.dpr)
      const contexts = renderer.getContexts()
      const targets = [
        contexts.yAxisCtx,
        contexts.yAxisOverlayCtx,
        contexts.leftAxisCtx,
        contexts.leftAxisOverlayCtx,
      ]
      const axisIds = pane.axes.map((axis) => axis.axisId)
      const layout = this.axisWidthEstimator.getLayout(axisIds)
      for (const target of targets) {
        if (target) clearAxisSurface(target, vp.dpr, pane.height)
      }
      for (const [index, surface] of AXIS_SURFACES.entries()) {
        const target = targets[index]
        if (!target) continue
        const axisList = surface.startsWith('yRight') ? axisIds : [axisIds[0]!]
        for (const axisId of axisList) {
          const column = layout[axisId]
          paintAxisLabels(
            target,
            this.retainedAxisLabels.get(axisId)?.forSurface(surface, axisId).labels ?? [],
            surface,
            {
              dpr: vp.dpr,
              axisWidth: column.width,
              axisHeight: pane.height,
              offsetX: column.left,
            },
          )
        }
      }
    }
  }

  /** 非缓存帧把收集阶段算好的范围投影到运行时轴，不做决策或回写。 */
  private applyPanePriceRange(
    pane: PaneLayout,
    frame: FrameContext,
    useCachedFrame: boolean,
  ): void {
    if (useCachedFrame) return
    for (const axis of pane.axes) {
      const resolved = frame.panePriceRanges[axis.axisId]
      if (!resolved) continue
      axis.yAxis.setBasePrice(resolved.basePrice)
      if (resolved.range) axis.yAxis.setRange(resolved.range)
    }
  }

  /** 判断正式图元层是否需要重绘；几何、文档、选中或覆盖成员变化都会使缓存失效。 */
  private shouldRepaintDrawing(
    useCachedFrame: boolean,
    drawingChanged: boolean,
    previousContext: RenderContext | undefined,
    drawingCtx: CanvasRenderingContext2D | null | undefined,
  ): boolean {
    return (
      !useCachedFrame ||
      drawingChanged ||
      previousContext?.drawingCtx !== drawingCtx ||
      !previousContext?.drawingProjection ||
      !previousContext?.indicatorDrawingProjection
    )
  }

  /** 为单个 Pane 构造本帧共享的 RenderContext。 */
  private createPaneRenderContext(
    frame: FrameContext,
    pane: PaneLayout,
    contexts: PaneContexts,
    dataManager: ChartDataManager,
    axisLabelsFrame: AxisLabelsFrame,
    sharedXAxisRanges: XAxisRange[],
  ): RenderContext {
    const vp = frame.vp
    const opt = this.deps.getOption()
    const symbol = dataManager.symbols.peek()[0]
    const paneInfo = wrapPaneInfo(pane)
    const dataView = this.deps.dataView$.peek()
    return {
      symbolKey: symbol === undefined ? undefined : symbolSpecIdentityKey(symbol),
      countdown: optional(frame.countdown.text),
      ctx: contexts.mainCtx!,
      overlayCtx: optional(contexts.overlayCtx),
      drawingCtx: optional(contexts.drawingCtx),
      pane: paneInfo,
      data: frame.data,
      dataRevision: frame.dataRevision,
      period: dataManager.currentPeriod,
      dataView,
      coordinates: createFrameCoordinates({
        data: frame.data,
        range: frame.range,
        kLineCenters: frame.kLineCenters,
        scrollLeft: vp.scrollLeft,
        dpr: vp.dpr,
        kWidth: opt.kWidth,
        kGap: opt.kGap,
        dataView,
        priceAxis: paneInfo.yAxis,
      }),
      marketSession: this.deps.getMarketSession(),
      displayTimeFormatter: this.getDisplayTimeFormatter(),
      timeTicks: frame.timeTicks,
      timeShareRange: optional(dataManager.getTimeShareRange()),
      timeShareGeometry: optional(frame.timeShareGeometry),
      comparisonData: dataManager.getComparisonData(),
      comparisonSymbols: frame.comparisonActive ? dataManager.getComparisonSpecs() : [],
      comparisonColors: dataManager.getComparisonColors(),
      comparisonHidden: dataManager.getComparisonHidden(),
      comparisonProjection: optional(frame.comparisonProjection),
      range: frame.range,
      scrollLeft: vp.scrollLeft,
      slotGrid: frame.viewSnapshot.grid,
      dataTransform: createDataTransform(pane, vp),
      kWidth: opt.kWidth,
      kGap: opt.kGap,
      dpr: vp.dpr,
      paneWidth: vp.plotWidth,
      kLinePositions: frame.kLinePositions,
      kLineCenters: frame.kLineCenters,
      kWidthPx: frame.kWidthPx,
      visiblePriceExtrema: frame.visiblePriceExtrema,
      indicatorStateReader: frame.indicatorStateReader,
      indicatorAvailability: frame.indicatorAvailability,
      crosshairIndex: this.deps.getInteraction().getCrosshairIndex(),
      yAxisCtx: optional(contexts.yAxisCtx),
      yAxisOverlayCtx: optional(contexts.yAxisOverlayCtx),
      leftAxisCtx: optional(contexts.leftAxisCtx),
      leftAxisOverlayCtx: optional(contexts.leftAxisOverlayCtx),
      zoomLevel: this.deps.zoom.readonly.zoomLevel.peek(),
      zoomLevelCount: this.deps.options.readonly.options.peek().zoomLevelCount,
      viewport: {
        scrollLeft: vp.scrollLeft,
        plotWidth: vp.plotWidth,
        plotHeight: vp.plotHeight,
      },
      settings: this.getSettings(),
      // 分时昨收只有一个来源：Buffer 快照；五日由 Buffer 取第一交易日。
      timeShareBaseline: optional(dataManager.getTimeSharePreClose()),
      yAxisRanges: [],
      xAxisRanges: sharedXAxisRanges,
      axisLabels: axisLabelsFrame,
      axisLayout: this.axisWidthEstimator.getLayout(pane.axes.map((axis) => axis.axisId)),
      theme: this.deps.theme$.peek(),
      isAsiaMarket: this.getSettings().isAsiaMarket as boolean,
      colorPresetSettings: this.getSettings().colorPresetSettings,
    }
  }

  /** 把单个 Pane 的 main/overlay 表面提交到 Scene；main 清屏，overlay 保留正式图元像素。 */
  private enqueuePanePaint(
    framePanes: Array<FramePaint & { paneId: string }>,
    renderer: PaneRenderer,
    context: RenderContext,
    pane: PaneLayout,
    shouldUpdateMain: boolean,
    shouldUpdateOverlay: boolean,
    shouldUpdateDrawing: boolean,
  ): void {
    const sceneRenderer = this.deps.getSceneRenderer()
    const targets = {
      main: context.ctx,
      drawing: context.drawingCtx ?? null,
      overlay: context.overlayCtx ?? null,
    }
    const bounds = { width: context.paneWidth, height: pane.height }
    const gpuSurface = renderer.getMainGpuSurface(sceneRenderer) ?? undefined
    const hasContextMain = this.scene.layers
      .peek()
      .some(
        (layer) =>
          layer.visible &&
          layer.kind !== 'draw-list' &&
          scenePaintTarget(layer.role) === 'main' &&
          (layer.pane === pane.id || layer.pane === LAYER_PANE_GLOBAL),
      )
    const sparseText = gpuSurface !== undefined && !hasContextMain
    if (shouldUpdateMain) {
      renderer.setMainRasterRequired(!sparseText)
      // 分配或释放后备存储会重置 Canvas 状态，必须在 Scene 合批前恢复本帧 DPR。
      targets.main.setTransform(context.dpr, 0, 0, context.dpr, 0, 0)
      if (!sparseText) renderer.clearText()
    }
    if (shouldUpdateMain) {
      framePanes.push({
        paneId: pane.id,
        context,
        renderer: sceneRenderer,
        targets,
        gpuSurface,
        ensureMainTarget: () => {
          renderer.setMainRasterRequired(true)
          const target = renderer.getContexts().mainCtx
          target?.setTransform(context.dpr, 0, 0, context.dpr, 0, 0)
          return target
        },
        paintText: sparseText
          ? (texts, dpr, textBounds) => renderer.paintText(texts, dpr, textBounds)
          : undefined,
        bounds,
        dpr: context.dpr,
        frameNumber: this.frameCount++,
        deltaMs: 0,
        roles: MAIN_CANVAS_ROLES,
        clear: true,
      })
    }
    if (!shouldUpdateOverlay) return
    framePanes.push({
      ensureOverlayTarget: () => renderer.setOverlayRasterRequired(true),
      finishOverlay: (used) => {
        if (!used) renderer.setOverlayRasterRequired(false)
      },
      paneId: pane.id,
      context,
      renderer: sceneRenderer,
      targets,
      bounds,
      dpr: context.dpr,
      frameNumber: this.frameCount++,
      deltaMs: 0,
      roles: shouldUpdateDrawing ? OVERLAY_CANVAS_ROLES : SESSION_CANVAS_ROLES,
      clear: false,
    })
  }

  /** 场景里是否有当前 Pane 可绘制的自定义 drawing layer。 */
  private hasCustomDrawingLayer(pane: PaneLayout): boolean {
    return this.scene.layers
      .peek()
      .some(
        (layer) =>
          layer !== this.drawingLayer &&
          layer.visible &&
          layer.role === 'drawing' &&
          (layer.pane === pane.id || layer.pane === LAYER_PANE_GLOBAL),
      )
  }

  /** 更新正式图元投影；需要时为首次出现的图元创建独立表面。 */
  private updateCommittedDrawing(
    renderer: PaneRenderer,
    context: RenderContext,
    previousContext: RenderContext | undefined,
    pane: PaneLayout,
    shouldUpdateDrawing: boolean,
  ): void {
    if (!shouldUpdateDrawing) {
      context.drawingProjection = previousContext?.drawingProjection
      context.indicatorDrawingProjection = previousContext?.indicatorDrawingProjection
      return
    }
    const labels = createAxisLabelsFrame()
    const projectionContext = { ...context, axisLabels: labels }
    // 用户图元需要独立画布保持像素；指标图元直接并入 main，避免多一张全尺寸画布。
    context.drawingProjection = projectDrawingsForFrame(
      this.drawingStore,
      this.drawingDefinitions,
      projectionContext,
      null,
      'committed',
      null,
      'user',
    )
    context.indicatorDrawingProjection = projectDrawingsForFrame(
      this.drawingStore,
      this.drawingDefinitions,
      projectionContext,
      null,
      'committed',
      null,
      'indicator',
    )
    this.drawingAxisLabels.set(renderer, labels)
    if (context.drawingCtx) return
    const hasPrimitives = (context.drawingProjection?.primitives.length ?? 0) > 0
    if (!hasPrimitives && !this.hasCustomDrawingLayer(pane)) return
    const created = renderer.ensureDrawingContext()
    if (!created) return
    created.setTransform(1, 0, 0, 1, 0, 0)
    created.scale(context.dpr, context.dpr)
    context.drawingCtx = created
  }

  /** 提交正式与会话图元投影，并把轴范围并入本帧共享集合。 */
  private appendDrawingProjections(
    renderer: PaneRenderer,
    context: RenderContext,
    sharedXAxisRanges: XAxisRange[],
  ): void {
    this.registerRetainedDrawingLabels(renderer, context)
    context.sessionDrawingProjection = projectDrawingsForFrame(
      this.drawingStore,
      this.drawingDefinitions,
      context,
      this.deps.getSelectionMarquee?.() ?? null,
      'session',
      this.deps.getSnapIndicator?.() ?? null,
    )
    this.mergeDrawingAxisRanges(context, sharedXAxisRanges)
  }

  /** 把上一帧保留的绘图轴标签注册回当前 Pane 上下文。 */
  private registerRetainedDrawingLabels(renderer: PaneRenderer, context: RenderContext): void {
    const retainedLabels = this.drawingAxisLabels.get(renderer)
    for (const label of retainedLabels?.forSurface('yRightOverlay', context.pane.id).labels ?? []) {
      registerAxisLabel(context, 'yRightOverlay', label)
    }
    for (const label of retainedLabels?.forSurface('xLabels').labels ?? []) {
      registerAxisLabel(context, 'xLabels', label)
    }
  }

  /** 把正式与会话图元的轴范围并入本帧共享集合。 */
  private mergeDrawingAxisRanges(context: RenderContext, sharedXAxisRanges: XAxisRange[]): void {
    for (const projection of [
      context.drawingProjection,
      context.indicatorDrawingProjection,
      context.sessionDrawingProjection,
    ]) {
      if (!projection) continue
      context.yAxisRanges.push(...projection.yAxisRanges)
      sharedXAxisRanges.push(...projection.xAxisRanges)
    }
  }

  /** 按更新级别清空 Pane 的绘图与轴表面；绘图表面保留策略由调用方判定。 */
  private clearPaneSurfaces(
    contexts: PaneContexts,
    pane: PaneLayout,
    vp: ViewportFrame,
    level: UpdateLevel,
    shouldUpdateDrawing: boolean,
    forceMain: boolean,
  ): { shouldUpdateMain: boolean; shouldUpdateOverlay: boolean } {
    // 指标图元已并入 main 目标，图元变化必须同时刷新 main，不能只清 drawing 画布。
    const shouldUpdateMain = level === UpdateLevel.Main || level === UpdateLevel.All || forceMain
    const shouldUpdateOverlay = level === UpdateLevel.Overlay || level === UpdateLevel.All
    if (shouldUpdateMain) {
      clearPlotSurface(contexts.mainCtx, vp, pane)
      clearAxisSurface(contexts.yAxisCtx, vp.dpr, pane.height)
      clearAxisSurface(contexts.leftAxisCtx, vp.dpr, pane.height)
    }
    if (shouldUpdateDrawing) clearPlotSurface(contexts.drawingCtx, vp, pane)
    if (shouldUpdateOverlay) {
      clearPlotSurface(contexts.overlayCtx, vp, pane, true)
      clearAxisSurface(contexts.yAxisOverlayCtx, vp.dpr, pane.height)
      clearAxisSurface(contexts.leftAxisOverlayCtx, vp.dpr, pane.height)
    }
    return { shouldUpdateMain, shouldUpdateOverlay }
  }

  /** 构造 pane 上下文，通过统一 drawing 投影绘制用户与指标对象。 */
  private renderPanes(
    frame: FrameContext,
    level: UpdateLevel,
  ): { axisLabelsFrame: AxisLabelsFrame; sharedXAxisRanges: XAxisRange[] } {
    const { vp, useCachedFrame } = frame
    // X 轴由多个 Pane 共享；Y 轴装饰必须保持 Pane 隔离。
    // 轴标签收集统一走 axisLabels 模块的单帧聚合：X 表面共享 + 每 Pane 独立 Y 表面。
    const axisLabelsFrame = createAxisLabelsFrame()
    const sharedXAxisRanges: XAxisRange[] = []
    const dataManager = this.deps.getDataManager()

    const drawingVersion = [
      ...this.drawingStore.getCommittedPaintVersion(),
      this.deps.getIndicatorManager().getRenderStatesSnapshot(),
      this.deps.getIndicatorManager().indicatorsComputed.peek(),
      // 图元颜色按主题解析，主题、涨跌约定或配色覆盖变化都必须使图元层失效。
      this.deps.theme$.peek(),
      this.getSettings().isAsiaMarket,
      this.getSettings().colorPresetSettings,
    ]
    const drawingChanged = !this.sameVersion(this.paintedDrawingVersion, drawingVersion)

    // 本帧所有 pane 的绘制输入；全部 pane 构建完成后再一次性交给 Scene。
    const framePanes: Array<FramePaint & { paneId: string }> = []
    const legendContexts: RenderContext[] = []

    // 遍历主图 pane 和所有子图 pane，每个 pane 有一组独立 canvas 以及对应更新级别（main/overlay/yAxis）
    for (const renderer of this.deps.getPaneRenderers()) {
      const pane = renderer.getPane()
      const contexts = renderer.getContexts()
      const previousContext = this.paneCtxMap.get(pane.id)
      const shouldUpdateDrawing = this.shouldRepaintDrawing(
        useCachedFrame,
        drawingChanged,
        previousContext,
        contexts.drawingCtx,
      )
      this.applyPanePriceRange(pane, frame, useCachedFrame)

      const { shouldUpdateMain, shouldUpdateOverlay } = this.clearPaneSurfaces(
        contexts,
        pane,
        vp,
        level,
        shouldUpdateDrawing,
        drawingChanged,
      )

      // 构造本 pane 的 RenderContext，供所有 layer 读取
      const context = this.createPaneRenderContext(
        frame,
        pane,
        contexts,
        dataManager,
        axisLabelsFrame,
        sharedXAxisRanges,
      )

      // 覆盖成员进入会话层时从正式层排除；连续移动复用正式层投影和像素。
      this.updateCommittedDrawing(renderer, context, previousContext, pane, shouldUpdateDrawing)
      this.appendDrawingProjections(renderer, context, sharedXAxisRanges)

      // 刻度锚定轴数值，再投影到本帧的价格坐标系；网格与左右轴共用。
      context.yAxisTicks = createYAxisTicks(pane, {
        period: context.period,
        comparisonActive: (context.comparisonSymbols?.length ?? 0) > 0,
        leftSetting: context.settings?.mainLeftAxisDisplaySetting,
        rightTypeSetting: context.settings?.mainRightAxisTypeSetting,
      })

      this.paneCtxMap.set(pane.id, context)
      legendContexts.push(context)

      this.enqueuePanePaint(
        framePanes,
        renderer,
        context,
        pane,
        shouldUpdateMain,
        shouldUpdateOverlay,
        shouldUpdateDrawing,
      )
    }

    // 所有 pane 构建完成后一次性绘制；Scene 逐 pane 过滤、z 排序、逐层隔离分发。
    this.scene.paint({ panes: framePanes })
    this.paintedDrawingVersion = drawingVersion

    this.commitAxisLabelWidths(level, axisLabelsFrame, vp)

    this.deps.projectLegendFrame(legendContexts)
    return { axisLabelsFrame, sharedXAxisRanges }
  }

  /** 在同一次绘制中提交时间轴尺寸与内容，避免 ResizeObserver 提前清空画布。 */
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
      kWidthPx,
      data: renderData,
      timeShareGeometry,
    } = frame
    const dom = this.deps.getDom()
    const xAxisCtx = this.xAxisCtx ?? dom.xAxisCanvas.getContext('2d')
    if (!this.xAxisCtx) {
      this.xAxisCtx = xAxisCtx
    }
    if (xAxisCtx && this.timeAxisLayer) {
      const opt = this.deps.getOption()
      // width / height 赋值会清空 canvas，必须紧邻下方 paint，不能交给视口 effect 提前执行。
      const canvas = dom.xAxisCanvas
      const widthPx = Math.round(vp.plotWidth * vp.dpr)
      const heightPx = Math.round(opt.bottomAxisHeight * vp.dpr)
      if (canvas.width !== widthPx) canvas.width = widthPx
      if (canvas.height !== heightPx) canvas.height = heightPx
      const cssWidth = `${widthPx / vp.dpr}px`
      const cssHeight = `${heightPx / vp.dpr}px`
      if (canvas.style.width !== cssWidth) canvas.style.width = cssWidth
      if (canvas.style.height !== cssHeight) canvas.style.height = cssHeight
      const dataManager = this.deps.getDataManager()
      const timeAxisContext: Omit<RenderContext, 'coordinates'> = {
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
            getContentTop: () => 0,
            getContentBottom: () => 0,
            getContentHeight: () => 0,
            getDisplayRange: (baseRange) => baseRange ?? { maxPrice: 0, minPrice: 0 },
            getScaleType: () => ScaleType.Linear,
            getBasePrice: () => null,
            toPercent: () => 0,
            fromPercent: () => 0,
            getDisplayPercentRange: () => ({ minPct: 0, maxPct: 0 }),
          },
          axes: [],
          axis: () => ({
            priceToY: () => 0,
            yToPrice: () => 0,
            getContentTop: () => 0,
            getContentBottom: () => 0,
            getContentHeight: () => 0,
            getDisplayRange: (baseRange) => baseRange ?? { maxPrice: 0, minPrice: 0 },
            getScaleType: () => ScaleType.Linear,
            getBasePrice: () => null,
            toPercent: () => 0,
            fromPercent: () => 0,
            getDisplayPercentRange: () => ({ minPct: 0, maxPct: 0 }),
          }),
          priceRange: { maxPrice: 0, minPrice: 0 },
        },
        period: dataManager.currentPeriod,
        marketSession: this.deps.getMarketSession(),
        data: renderData,
        dataView: this.deps.dataView$.peek(),
        displayTimeFormatter: this.getDisplayTimeFormatter(),
        timeTicks: frame.timeTicks,
        timeShareRange: optional(dataManager.getTimeShareRange()),
        timeShareGeometry: optional(timeShareGeometry),
        range,
        scrollLeft: vp.scrollLeft,
        slotGrid: frame.viewSnapshot.grid,
        kWidth: opt.kWidth,
        kGap: opt.kGap,
        dpr: vp.dpr,
        paneWidth: vp.plotWidth,
        kLinePositions,
        kLineCenters,
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
        coordinates: createFrameCoordinates({
          data: renderData,
          range,
          kLineCenters,
          scrollLeft: vp.scrollLeft,
          dpr: vp.dpr,
          kWidth: opt.kWidth,
          kGap: opt.kGap,
          dataView: timeAxisContext.dataView,
          priceAxis: timeAxisContext.pane.yAxis,
        }),
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
      kWidthPx: frame.kWidthPx,
      timeShareGeometry: frame.timeShareGeometry,
      visiblePriceExtrema: frame.visiblePriceExtrema,
      timeTicks: frame.timeTicks,
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
