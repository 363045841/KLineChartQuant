/** 图表帧准备、各 Pane 坐标范围与 Scene 绘制调度。 */

import { plotPointAt } from '@363045841yyt/klinechart-plot-contracts'
import { createFrameCoordinates } from '@/engine/coordinates/impl/frameCoordinates.js'
import { symbolSpecIdentityKey } from '@/engine/data/symbolIdentity.js'
import { resolveDrawingRenderAxis } from '@/engine/drawing/geometry/impl/drawingAxis.js'
import { computeDrawingPriceRange } from '@/engine/drawing/geometry/impl/frameProjection.js'
import { bindRenderAxis, objectAxisId } from '@/foundation/geometry/axisBinding.js'
import type { SnapLine } from '@/foundation/plugin/index.js'
import { GENERIC_ERROR_CODES, KLineChartError } from '../../../errors.js'
import type { ChartSettings } from '../../../foundation/config/chartSettings.js'
import {
  PRICE_AXIS_RANGE_MODE,
  resolvePriceAxisRangeMode,
} from '../../../foundation/config/priceAxisRangeMode.js'
import type {
  DrawingPrimitive,
  IndicatorAvailabilityReader,
  IndicatorRenderStateReader,
  RenderContext,
  TimeShareGeometry,
  XAxisRange,
  YAxisTick,
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
  type FramePaint,
  LAYER_PANE_GLOBAL,
  type LayerRole,
  type Scene,
  scenePaintTarget,
} from '../../../rendering/scene/types.js'
import {
  type AxisColumn,
  type AxisColumnPalette,
  type AxisColumnProjection,
  type AxisLabelScope,
  type AxisLabelsFrame,
  collectAxisLabels,
  createValueProjection,
  measureAxisLabels,
  paintAxisLabels,
  TIME_AXIS,
} from '../../axisLabels/index.js'
import { estimateAxisWidths } from '../../axisWidth/impl/axisWidths.js'
import type { KLinePositions, Viewport } from '../../chart/index.js'
import { ChartDataViewId } from '../../chartModel/index.js'
import type { ChartDataManager } from '../../data/chartDataManager.js'
import type { DrawingObject, SnapIndicatorValue } from '../../drawing/index.js'
import {
  createDrawingOverlayLayer,
  createDrawingSessionLayer,
  createIndicatorDrawingLayer,
  DrawingDefinitionRegistry,
  DrawingStore,
  projectDrawingsForFrame,
  registerDefaultDrawingDefinitions,
} from '../../drawing/index.js'
import type { PaneAxisSpec } from '../../pane/axisTypes.js'
import type { PaneRenderer } from '../../pane/index.js'
import { UpdateLevel } from '../../pane/index.js'
import { isPlotRenderState } from '../../plots/impl/readPlotState.js'
import { CrosshairOverlay } from '../../renderers/crosshair/impl/crosshairOverlay.js'
import {
  type LockedCrosshairProjection,
  resolveLockedCrosshair,
} from '../../renderers/crosshair/impl/resolveLockedCrosshair.js'
import { computeFootprintPriceRange } from '../../renderers/footprint.js'
import { createGridLinesLayer } from '../../renderers/gridLines.js'
import { paintAxisRanges } from '../../renderers/paintAxisRanges.js'
import { COMPARISON_LINE_LAYER_ID, PRICE_SERIES_AXIS_ID } from '../../renderers/rendererIds.js'
import { paintTimeAxis } from '../../renderers/timeAxis.js'
import { createYAxisTicks, type PriceRange } from '../../scale/index.js'
import type { VisibleRange } from '../../viewport/viewport.js'
import {
  computeVisiblePriceExtrema,
  type VisiblePriceExtrema,
} from '../../viewport/visiblePriceExtrema.js'
import type { ChartFrameGeometry, RendererDependencies } from '../types.js'
import { formatLastPriceCountdown, getLastPriceRemainingMs } from './countdown.js'
import { resolveDrawingLabels } from './frameAxisLabels.js'
import {
  collectRangeContributions,
  computeAutoRange,
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
const MAIN_CANVAS_ROLES: readonly LayerRole[] = ['content']
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
  indicatorManager: ReturnType<RendererDependencies['getIndicatorManager']>
  mode: ReturnType<RendererDependencies['getActiveMode']>
  axisStates: ReturnType<RendererDependencies['axesState']['readonly']['paneRanges']['peek']>
  /** 足迹范围；只在价格轴且没有比较投影时参与，缓存帧不计算。 */
  footprintRange: PriceRange | null
}

/** 范围决策结果及待提交的手动范围初始化意图。 */
type PanePriceRangeResult = {
  panePriceRanges: Record<string, ResolvedPanePriceRange>
  pendingManualRanges: Array<{ axisId: string; range: PriceRange }>
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
  private readonly drawingLayer = createDrawingOverlayLayer()
  private readonly indicatorDrawingLayer = createIndicatorDrawingLayer()
  private xAxisCtx: CanvasRenderingContext2D | null = null
  private readonly crosshairOverlay: CrosshairOverlay

  private cachedDrawFrame: CachedDrawFrame | null = null

  private scene: Scene<RenderContext>
  private frameCount = 0
  private paneCtxMap = new Map<string, RenderContext>()
  /** 本帧锁定竖线投影；时间轴标签在 renderCrosshair 之后复用同一份结果。 */
  private lockedCrosshair: LockedCrosshairProjection | null = null
  private displayTimeZoneSetting: TimeZoneSetting = 'UTC'
  private displayTimeFormatter: TimeFormatter = createTimeFormatter('UTC')
  /** 上一帧已提交的主层与交互层内容输入。 */
  private paintedMainVersion: readonly unknown[] | null = null
  private disposed = false
  private schedulingStopped = false
  private paintedOverlayVersion: readonly unknown[] | null = null
  /** 正式绘图层的输入版本；会话坐标变化仅刷新动态覆盖层。 */
  private paintedDrawingVersion: readonly unknown[] | null = null
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
      this.deps.axesState.readonly.paneRanges.peek(),
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
        // 帧也只能通过统一协调者安装正式与预览对象的坐标资源。
        this.deps.synchronizeRuntime()
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
    this.scene.addLayer(createGridLinesLayer())
  }

  registerDrawingPlugins(): void {
    this.scene.addLayer(this.drawingLayer)
    this.scene.addLayer(this.indicatorDrawingLayer)
    this.scene.addLayer(createDrawingSessionLayer())
  }

  getScene(): Scene {
    return this.scene
  }

  /** 当前轴列布局是命中与绘制共同使用的唯一几何。 */
  getAxisLayout(paneId: string) {
    const renderer = this.deps.getPaneRenderers().find((item) => item.getPane().id === paneId)
    if (!renderer)
      throw new KLineChartError(GENERIC_ERROR_CODES.NOT_REGISTERED, `Pane 未注册：${paneId}`)
    return renderer.getPane().axisLayout
  }

  /**
   * 已提交层图元的线段（Pane 局部坐标），供磁吸候选。
   * 会话覆盖不进入候选：拖拽中的图元吸自己会形成反馈回路。
   */
  getCoordinates(
    paneId: string,
    axisId?: string,
  ): import('../../../foundation/geometry/frameCoordinates.js').FrameCoordinates | null {
    const context = this.paneCtxMap.get(paneId)
    if (!context) return null
    const dataManager = this.deps.getDataManager()
    const symbol = dataManager.symbols.peek()[0]
    const symbolKey = symbol === undefined ? undefined : symbolSpecIdentityKey(symbol)
    if (context.symbolKey !== symbolKey || context.period !== dataManager.currentPeriod) return null
    // 未指定轴时使用 Pane 的主轴（轴列第一条），与绘图/交互的默认坐标一致。
    const targetAxisId = axisId ?? context.pane.axes[0]?.axisId
    if (targetAxisId === undefined) return context.coordinates
    return createFrameCoordinates({
      data: context.data,
      range: context.range,
      kLineCenters: context.kLineCenters,
      scrollLeft: context.scrollLeft,
      dpr: context.dpr,
      kWidth: context.kWidth,
      kGap: context.kGap,
      dataView: context.dataView,
      priceAxis: context.pane.axis(targetAxisId),
    })
  }

  /** 已提交图元的磁吸线段，来自同一帧投影。 */
  getCommittedSnapLines(paneId: string): ReadonlyArray<SnapLine> {
    return this.paneCtxMap.get(paneId)?.drawingProjection?.snapLines ?? []
  }

  /**
   * 指定逻辑下标处该 Pane 的可吸附指标值。
   *
   * 只取「在某根 Bar 上画出一个价格」的序列：标记类（shape/char/arrow）与
   * OHLC 图形没有单值语义，参与吸附只会产生歧义。位移已在产出时物化。
   */
  getIndicatorSnapValues(paneId: string, barIndex: number): ReadonlyArray<SnapIndicatorValue> {
    const manager = this.deps.getIndicatorManager()
    const states = manager.getRenderStatesSnapshot()
    const values: SnapIndicatorValue[] = []
    for (const instance of manager.indicatorsComputed.peek()) {
      if (instance.paneId !== paneId) continue
      const state = states.get(instance.id)
      if (!isPlotRenderState(state)) continue
      for (const plot of state.plots) {
        if (!plot.visible || !isSnapValuePlot(plot)) continue
        const point = plotPointAt(plot, barIndex)
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

  /** 将 prepareFrameData 的帧几何按 level 画到 canvas，含所有 pane 的 main/overlay 及时间轴 */
  private drawWithFrame(level: UpdateLevel, frame: FrameContext | null): void {
    // 当前视图无可绘制数据时必须清空所有 canvas，不能保留前一视图的像素。
    if (!frame) {
      this.lockedCrosshair = null
      this.clearAllCanvases()
      return
    }

    // 遍历所有 pane，清 canvas → 构建 RenderContext → scene.paint
    const { labels, sharedXAxisRanges } = this.renderPanes(frame, level)
    this.renderCrosshair(frame)

    // 画底部时间轴（独立画布，不进 scene）
    this.renderXAxis(frame, labels, sharedXAxisRanges)
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
    const market = period === 'daily' ? this.deps.getMarketSession() : undefined
    const remaining = getLastPriceRemainingMs(period, last.timestamp, now, market)
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
   * 口径取数与手动范围裁决都在 panePriceRange 模块内完成，这里只准备输入。
   * 决策阶段不写内核；尚未保存的手动范围先收集，循环结束后一次快照提交。
   */
  private collectPanePriceRanges(frame: FrameContext): void {
    const inputs = this.preparePanePriceRangeInputs(frame)
    const result = this.resolveFramePanePriceRanges(frame, inputs)
    this.applyPanePriceRangeFrame(frame, inputs, result)
    this.initializePendingManualRanges(result.pendingManualRanges)
  }

  /** 读取本帧范围输入，比较投影、足迹与轴状态各准备一次。 */
  private preparePanePriceRangeInputs(frame: FrameContext): PanePriceRangeInputs {
    const dataManager = this.deps.getDataManager()

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
    return {
      dataManager,
      indicatorManager: this.deps.getIndicatorManager(),
      mode: this.deps.getActiveMode(),
      comparisonActive,
      comparisonProjection,
      axisStates: this.deps.axesState.readonly.paneRanges.peek(),
      // 缓存帧保留上一帧轴范围，不再重算会在帧内被丢弃的来源。
      footprintRange: frame.useCachedFrame
        ? null
        : computeFootprintPriceRange(this.deps.footprintState$.peek(), frame.range),
    }
  }

  /** 解析各 pane 范围并收集初始化意图，不修改 frame 或内核。 */
  private resolveFramePanePriceRanges(
    frame: FrameContext,
    inputs: PanePriceRangeInputs,
  ): PanePriceRangeResult {
    const panePriceRanges: Record<string, ResolvedPanePriceRange> = {}
    // 收集阶段只做决策，不写内核；待初始化的手动范围先收集，循环后统一提交。
    const pendingManualRanges: Array<{ axisId: string; range: PriceRange }> = []
    const pricePaneId = this.deps.getPricePaneId()
    for (const renderer of this.deps.getPaneRenderers()) {
      const pane = renderer.getPane()
      // 每个 Pane 只构造一次帧上下文，绘图按其所属轴一次分组，避免轴数乘绘图数。
      const context = this.createPaneRenderContext(
        frame,
        pane,
        renderer.getContexts(),
        inputs.dataManager,
        [],
      )
      const drawingRanges = this.collectPaneDrawingRanges(pane, context)
      for (const axis of pane.axes) {
        const axisState = inputs.axisStates[axis.axisId]
        const isPriceSeries = pane.id === pricePaneId && axis.axisId === PRICE_SERIES_AXIS_ID
        // 状态保存用户选择；当前模式没有 K 线可拟合时按全并处理，条件恢复后自动生效。
        const rangeMode = resolvePriceAxisRangeMode(
          isPriceSeries && inputs.mode.fitsPriceBars,
          axisState?.rangeMode ?? PRICE_AXIS_RANGE_MODE.All,
        )
        const indicatorRange = frame.useCachedFrame
          ? null
          : inputs.indicatorManager.getAxisIndicatorRange(axis.axisId)
        const basis = this.resolveBasisRange(
          frame,
          inputs,
          pane,
          axis.axisId,
          isPriceSeries,
          indicatorRange,
        )
        const autoRange = computeAutoRange({
          rangeMode,
          basis: basis?.range ?? null,
          contributions: collectRangeContributions({
            rangeMode,
            isPriceSeries,
            useIndicatorScheduler: inputs.mode.useIndicatorScheduler,
            comparisonActive: inputs.comparisonActive,
            indicatorRange,
            footprintRange: inputs.footprintRange,
            drawingRange: drawingRanges.get(axis.axisId) ?? null,
          }),
        })
        const resolved = resolvePanePriceRange({
          rangeMode,
          currentRange: axisState?.range ?? null,
          autoRange,
          basePrice: basis?.basePrice ?? null,
        })
        panePriceRanges[axis.axisId] = resolved
        if (!frame.useCachedFrame && resolved.initializeRange && resolved.range)
          pendingManualRanges.push({ axisId: axis.axisId, range: resolved.range })
      }
    }
    return { panePriceRanges, pendingManualRanges }
  }

  /**
   * 可见绘图的价格范围，按所属轴分组。
   *
   * 带 owner 的脚本绘图并入其所属轴；用户手绘图只在该 Pane 没有其它对象时参与，
   * 否则拖动图元会牵动价格窗口。
   */
  private collectPaneDrawingRanges(
    pane: PaneLayout,
    context: RenderContext,
  ): Map<string, PriceRange> {
    const drawings = this.drawingStore.getVisibleByPane(
      {
        paneId: pane.id,
        workspaceId: resolveChartWorkspaceId(this.deps.dataView$.peek()),
        symbolKey: context.symbolKey,
        period: context.period,
      },
      'committed',
      'all',
    )
    const objectAxes = new Set(
      this.deps
        .getIndicatorManager()
        .getAxesInPane(pane.id)
        .filter((axis) => axis.objectIds.length > 0)
        .map((axis) => axis.axisId),
    )
    const drawingsByAxis = new Map<string, DrawingObject[]>()
    for (const drawing of drawings) {
      const axisId = resolveDrawingRenderAxis(pane, drawing)
      if (drawing.ownerId === undefined && objectAxes.has(axisId)) continue
      const group = drawingsByAxis.get(axisId)
      if (group) group.push(drawing)
      else drawingsByAxis.set(axisId, [drawing])
    }
    const drawingRanges = new Map<string, PriceRange>()
    for (const [axisId, group] of drawingsByAxis) {
      const range = computeDrawingPriceRange(group, this.drawingDefinitions, context)
      if (range) drawingRanges.set(axisId, { minPrice: range.min, maxPrice: range.max })
    }
    return drawingRanges
  }

  /**
   * 单条轴的主投影：价格轴取可见行情，比较激活时换成比较投影；
   * 指标轴没有行情可拟合，主投影就是自身输出极值。
   */
  private resolveBasisRange(
    frame: FrameContext,
    inputs: PanePriceRangeInputs,
    pane: PaneLayout,
    axisId: string,
    isPriceSeries: boolean,
    indicatorRange: { min: number; max: number } | null,
  ): { range: PriceRange | null; basePrice: number | null } | null {
    if (!isPriceSeries) {
      return {
        range: indicatorRange
          ? { minPrice: indicatorRange.min, maxPrice: indicatorRange.max }
          : null,
        basePrice: null,
      }
    }
    if (
      inputs.comparisonActive &&
      inputs.comparisonProjection &&
      this.hasComparisonSeries(pane.id)
    ) {
      const { min, max, basePrice } = inputs.comparisonProjection
      return { range: { minPrice: min, maxPrice: max }, basePrice }
    }
    const shape = this.deps.settings$.peek().klineShape
    return inputs.mode.computePaneRange(
      frame.range,
      inputs.dataManager,
      shape === 'line' || shape === 'area',
    )
  }

  /** 比较线是否绘制在该 Pane；比较层当前属于 main，不按 Pane 身份推断。 */
  private hasComparisonSeries(paneId: string): boolean {
    const layer = this.scene.layers.peek().find((item) => item.id === COMPARISON_LINE_LAYER_ID)
    return layer?.pane === paneId
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

  /** 唯一业务状态写入边界：一次 Action 初始化所有待保存的手动范围。 */
  private initializePendingManualRanges(
    pendingManualRanges: PanePriceRangeResult['pendingManualRanges'],
  ): void {
    if (pendingManualRanges.length > 0) {
      this.deps.axesState.actions.initializeManualRanges(pendingManualRanges)
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
      const paneId = instance.paneId
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

  /** 提交轴宽并重画轴；标签已在本帧全量收集，绘制直接使用当前这份。 */
  private commitAxisLabelWidths(labels: AxisLabelsFrame, vp: ViewportFrame): void {
    this.deps.commitAxisWidths?.(this.measureAxisWidths(labels))
    this.paintAxisSurfaces(vp, labels)
  }

  /** 按本帧标签估算左右轴宽与逐列宽度。 */
  private measureAxisWidths(labels: AxisLabelsFrame): ReturnType<typeof estimateAxisWidths> {
    return estimateAxisWidths({
      axes: this.deps.getPaneRenderers().flatMap((renderer) => {
        const pane = renderer.getPane()
        const primary = pane.axes[0]
        return pane.axes.map((axis) => {
          const projection = this.valueProjection(pane, axis.axisId)
          const axisLabels = labels.forAxis(axis.axisId)
          const staticLabels = axisLabels.filter((label) => label.role !== 'marker')
          const mirrorsLeft =
            primary !== undefined &&
            primary.axisId === axis.axisId &&
            primary.yAxis.getScaleType() === ScaleType.Percent
          return {
            axisId: axis.axisId,
            paneId: pane.id,
            staticWidth: measureAxisLabels(staticLabels, projection),
            overlayWidth: measureAxisLabels(
              axisLabels.filter((label) => label.role === 'marker'),
              projection,
            ),
            leftWidth: mirrorsLeft
              ? measureAxisLabels(
                  staticLabels.filter((label) => label.role === 'tick'),
                  createValueProjection(primary.yAxis, this.axisSpec(pane, axis.axisId), 'raw'),
                )
              : 0,
          }
        })
      }),
    })
  }

  /** 用本帧标签重画全部轴画布；这是轴表面唯一的清空与绘制入口。 */
  private paintAxisSurfaces(vp: ViewportFrame, labels: AxisLabelsFrame): void {
    for (const renderer of this.deps.getPaneRenderers()) {
      const pane = renderer.getPane()
      renderer.resize(vp.plotWidth, pane.height, vp.dpr)
      const contexts = renderer.getContexts()
      // 区间带与时间轴同源：读本帧已合并的上下文数据，拖拽中的会话层也在其中。
      const ranges = this.paneCtxMap.get(pane.id)?.yAxisRanges ?? []
      for (const target of [
        contexts.yAxisCtx,
        contexts.yAxisOverlayCtx,
        contexts.leftAxisCtx,
        contexts.leftAxisOverlayCtx,
      ]) {
        if (target) clearAxisSurface(target, vp.dpr, pane.height)
      }
      for (const axis of pane.axes) {
        if (pane.axisLayout[axis.axisId] === undefined) continue
        const column = this.createValueColumn(pane, axis.axisId, vp.dpr)
        const axisLabels = labels.forAxis(axis.axisId)
        // 选中图元的区间带铺在静态层，标签随后覆盖其上。
        if (contexts.yAxisCtx) {
          paintAxisRanges(
            contexts.yAxisCtx,
            ranges.filter((range) => range.axisId === axis.axisId),
            column,
          )
          paintAxisLabels(
            contexts.yAxisCtx,
            axisLabels.filter((label) => label.role !== 'marker'),
            column,
          )
        }
        if (contexts.yAxisOverlayCtx)
          paintAxisLabels(
            contexts.yAxisOverlayCtx,
            axisLabels.filter((label) => label.role === 'marker'),
            column,
          )
      }
      this.paintLeftAxis(contexts, pane, vp.dpr, labels)
    }
  }

  /**
   * 左轴是主轴的原始价镜像：只在主轴为百分比语义时显示刻度。
   *
   * @param contexts 该 Pane 的画布上下文
   * @param pane 该 Pane
   * @param dpr 设备像素比
   * @param labels 本帧标签快照
   */
  private paintLeftAxis(
    contexts: PaneContexts,
    pane: PaneLayout,
    dpr: number,
    labels: AxisLabelsFrame,
  ): void {
    const primary = pane.axes[0]
    const ctx = contexts.leftAxisCtx
    if (!primary || !ctx) return
    if (primary.yAxis.getScaleType() !== ScaleType.Percent) return
    const column: AxisColumn = {
      dpr,
      width: ctx.canvas.width / dpr,
      height: pane.height,
      offsetX: 0,
      projection: createValueProjection(primary.yAxis, this.axisSpec(pane, primary.axisId), 'raw'),
      palette: this.axisPalette(),
    }
    const ticks = labels.forAxis(primary.axisId).filter((label) => label.role === 'tick')
    paintAxisLabels(ctx, ticks, column)
  }

  /** 轴规格；轴不存在时抛异常，不选择其他轴。 */
  private axisSpec(pane: PaneLayout, axisId: string): PaneAxisSpec {
    const spec = this.deps
      .getIndicatorManager()
      .getAxesInPane(pane.id)
      .find((item) => item.axisId === axisId)
    if (spec === undefined)
      throw new KLineChartError(
        GENERIC_ERROR_CODES.NOT_REGISTERED,
        `Pane ${pane.id} 中不存在轴 ${axisId}`,
      )
    return spec
  }

  /** 值轴的文本与坐标投影：轴宽估算与绘制共用。 */
  private valueProjection(
    pane: PaneLayout,
    axisId: string,
  ): AxisColumnProjection & { readonly kind: 'value' } {
    return createValueProjection(
      pane.axis(axisId),
      this.axisSpec(pane, axisId),
      'axis',
    ) as AxisColumnProjection & { readonly kind: 'value' }
  }

  /**
   * 构造一条值轴列的绘制输入。
   *
   * @param pane 所属 Pane
   * @param axisId 轴身份
   * @param dpr 设备像素比
   */
  private createValueColumn(pane: PaneLayout, axisId: string, dpr: number): AxisColumn {
    const layout = pane.axisLayout[axisId]
    return {
      dpr,
      width: layout?.width ?? 0,
      height: pane.height,
      offsetX: layout?.left ?? 0,
      projection: createValueProjection(pane.axis(axisId), this.axisSpec(pane, axisId), 'axis'),
      palette: this.axisPalette(),
    }
  }

  /** 当前主题下的轴列文字色。 */
  private axisPalette(): AxisColumnPalette {
    const colors = resolveThemeColors(
      this.deps.theme$.peek(),
      this.getSettings().isAsiaMarket,
      this.getSettings().colorPresetSettings,
    )
    return { text: colors.text.secondary, onBackground: colors.label.text }
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
      const override = this.deps.axesState.readonly.paneRanges.peek()[axis.axisId]?.baseValue
      axis.yAxis.setBasePrice(override === undefined ? resolved.basePrice : override)
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
      /** 主价格序列所在 Pane 才绘制价格刻度与价签。 */
      hasPriceSeries: pane.id === this.deps.getPricePaneId(),
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
        priceAxis: {
          priceToY: (value) => paneInfo.yAxis.priceToY(value),
          yToPrice: (value) => paneInfo.yAxis.yToPrice(value),
        },
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
      dataTransform: undefined,
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
      axisLayout: pane.axisLayout,
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
    return this.scene.layers.peek().some(
      (layer) =>
        layer !== this.drawingLayer &&
        // 每图元的对象层也属于 drawing 角色，但不是自定义渲染扩展。
        layer.object === undefined &&
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
      context.drawingObjectProjections = previousContext?.drawingObjectProjections
      context.indicatorDrawingProjection = previousContext?.indicatorDrawingProjection
      return
    }
    // 用户图元按对象拆分：几何进各自的对象层，聚合投影只留手柄/框选/磁吸。
    const objectProjections = new Map<string, ReadonlyArray<DrawingPrimitive>>()
    context.drawingProjection = projectDrawingsForFrame(
      this.drawingStore,
      this.drawingDefinitions,
      context,
      null,
      'committed',
      null,
      'user',
      objectProjections,
    )
    context.drawingObjectProjections = objectProjections
    context.indicatorDrawingProjection = projectDrawingsForFrame(
      this.drawingStore,
      this.drawingDefinitions,
      context,
      null,
      'committed',
      null,
      'indicator',
    )
    if (context.drawingCtx) return
    const hasPrimitives =
      (context.drawingProjection?.primitives.length ?? 0) > 0 || objectProjections.size > 0
    if (!hasPrimitives && !this.hasCustomDrawingLayer(pane)) return
    const created = renderer.ensureDrawingContext()
    if (!created) return
    created.setTransform(1, 0, 0, 1, 0, 0)
    created.scale(context.dpr, context.dpr)
    context.drawingCtx = created
  }

  /** 提交正式与会话图元投影，并把轴范围并入本帧共享集合。 */
  private appendDrawingProjections(context: RenderContext, sharedXAxisRanges: XAxisRange[]): void {
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
    // 轴画布不在这里清：轴标签每帧全量收集，统一由轴表面绘制入口清空并重画。
    if (shouldUpdateMain) clearPlotSurface(contexts.mainCtx, vp, pane)
    if (shouldUpdateDrawing) clearPlotSurface(contexts.drawingCtx, vp, pane)
    if (shouldUpdateOverlay) clearPlotSurface(contexts.overlayCtx, vp, pane, true)
    return { shouldUpdateMain, shouldUpdateOverlay }
  }

  /** 构造 pane 上下文，通过统一 drawing 投影绘制用户与指标对象。 */
  private renderPanes(
    frame: FrameContext,
    level: UpdateLevel,
  ): { labels: AxisLabelsFrame; sharedXAxisRanges: XAxisRange[] } {
    const { vp, useCachedFrame } = frame
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
    const scopes: AxisLabelScope[] = []

    // 遍历主图 pane 和所有子图 pane，每个 pane 有一组独立 canvas 以及对应更新级别（main/overlay）
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
      if (!pane.hasAxes) {
        this.paneCtxMap.delete(pane.id)
        continue
      }
      const context = this.createPaneRenderContext(
        frame,
        pane,
        contexts,
        dataManager,
        sharedXAxisRanges,
      )

      // 覆盖成员进入会话层时从正式层排除；连续移动复用正式层投影和像素。
      this.updateCommittedDrawing(renderer, context, previousContext, pane, shouldUpdateDrawing)
      this.appendDrawingProjections(context, sharedXAxisRanges)

      // 刻度锚定轴数值，再投影到本帧的价格坐标系；网格、轴标签与左右轴共用同一份结果。
      const axisTicks = new Map<string, readonly YAxisTick[]>()
      for (const axis of pane.axes) {
        axisTicks.set(
          axis.axisId,
          createYAxisTicks(
            bindRenderAxis(context, axis.axisId).pane.yAxis,
            {
              period: context.period,
              comparisonActive: (context.comparisonSymbols?.length ?? 0) > 0,
              leftSetting: context.settings?.mainLeftAxisDisplaySetting,
              rightTypeSetting: context.settings?.mainRightAxisTypeSetting,
            },
            axis.yAxis.getScaleType() === ScaleType.Percent,
          ),
        )
      }
      context.yAxisTicks = pane.axes.flatMap((axis) => [...(axisTicks.get(axis.axisId) ?? [])])

      this.paneCtxMap.set(pane.id, context)
      scopes.push(this.createAxisLabelScope(frame, context, axisTicks))
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

    const labels = collectAxisLabels(scopes)
    this.commitAxisLabelWidths(labels, vp)

    this.deps.projectLegendFrame(legendContexts)
    return { labels, sharedXAxisRanges }
  }

  /**
   * 构造单个 Pane 的标签收集输入。
   *
   * 十字线是整帧唯一的指针位置；是否出价签由活动 Pane 决定，
   * 因此每个 Pane 都拿到同一份位置，不在这里裁剪。
   *
   * @param frame 本帧几何
   * @param context 该 Pane 的渲染上下文
   */
  private createAxisLabelScope(
    frame: FrameContext,
    context: RenderContext,
    axisTicks: ReadonlyMap<string, readonly YAxisTick[]>,
  ): AxisLabelScope {
    const interaction = this.deps.getInteraction()
    const pane = context.pane
    const pos = interaction.crosshairPos
    const index = interaction.crosshairIndex
    const active = interaction.activePaneId === pane.id
    return {
      pane,
      axes: this.deps.getIndicatorManager().getAxesInPane(pane.id),
      axisTicks,
      data: frame.data,
      dataView: context.dataView,
      period: context.period,
      timeFormatter: context.displayTimeFormatter,
      marketSession: context.marketSession,
      timeTicks: frame.timeTicks,
      timeShareGeometry: optional(frame.timeShareGeometry),
      timeAxisWidth: frame.vp.plotWidth,
      worldXToLogical: (worldX) => context.coordinates.xToLogical(worldX - context.scrollLeft),
      // 十字线整帧唯一；价签是否出现由活动 Pane 决定。
      crosshair: pos && index !== null ? { y: pos.y, index } : null,
      active,
      logicalToTime: (logical) => context.coordinates.logicalToTime(logical),
      indicatorState: frame.indicatorStateReader,
      // 拖动期间被拖图元只存在于会话投影，两者的标签在边界合并。
      drawingLabels: resolveDrawingLabels(
        context.drawingProjection,
        context.sessionDrawingProjection,
      ),
      theme: {
        theme: context.theme,
        isAsiaMarket: context.isAsiaMarket,
        colorPresetSettings: context.colorPresetSettings,
      },
      countdown: frame.countdown.text,
    }
  }

  /**
   * 在同一次绘制中提交时间轴尺寸与内容，避免 ResizeObserver 提前清空画布。
   *
   * @param frame 本帧几何
   * @param labels 本帧标签快照；时间轴取 TIME_AXIS 分桶
   * @param sharedXAxisRanges 本帧时间范围带
   */
  private renderXAxis(
    frame: FrameContext,
    labels: AxisLabelsFrame,
    sharedXAxisRanges: XAxisRange[],
  ): void {
    const { vp, range, kLineCenters, data: renderData } = frame
    const opt = this.deps.getOption()
    const dom = this.deps.getDom()
    this.xAxisCtx ??= dom.xAxisCanvas.getContext('2d')
    const ctx = this.xAxisCtx
    if (!ctx) return

    // width / height 赋值会清空 canvas，必须紧邻下方绘制，不能交给视口 effect 提前执行。
    const canvas = dom.xAxisCanvas
    const widthPx = Math.round(vp.plotWidth * vp.dpr)
    const heightPx = Math.round(opt.bottomAxisHeight * vp.dpr)
    if (canvas.width !== widthPx) canvas.width = widthPx
    if (canvas.height !== heightPx) canvas.height = heightPx
    const cssWidth = `${widthPx / vp.dpr}px`
    const cssHeight = `${heightPx / vp.dpr}px`
    if (canvas.style.width !== cssWidth) canvas.style.width = cssWidth
    if (canvas.style.height !== cssHeight) canvas.style.height = cssHeight

    const coordinates = createFrameCoordinates({
      data: renderData,
      range,
      kLineCenters,
      scrollLeft: vp.scrollLeft,
      dpr: vp.dpr,
      kWidth: opt.kWidth,
      kGap: opt.kGap,
      dataView: this.deps.dataView$.peek(),
      priceAxis: { priceToY: () => 0, yToPrice: () => 0 },
    })
    paintTimeAxis(
      ctx,
      labels.forAxis(TIME_AXIS),
      {
        dpr: vp.dpr,
        width: vp.plotWidth,
        height: opt.bottomAxisHeight,
        offsetX: 0,
        projection: { kind: 'time', xFor: (index) => coordinates.logicalToX(index) ?? Number.NaN },
        palette: this.axisPalette(),
      },
      sharedXAxisRanges,
      vp.scrollLeft,
    )
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
