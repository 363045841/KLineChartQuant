/**
 * 视口状态：导航事实与容器测量的唯一来源。
 *
 * 只保存三件事——导航目标、容器尺寸、精确 DPR；像素几何、槽位与可见区间全部由纯投影算出。
 * 派生值不回写，因此不存在第二份缩放或滚动状态。
 */

import type { TimeShareRange } from '../../data/provider/types.js'
import {
  batch,
  computed,
  createSubState,
  type ReadonlySignal,
} from '../../foundation/reactivity/signal.js'
import { type ChartDataView, ChartDataViewId } from '../../foundation/types/chartView.js'
import type { ChartSeriesDatum } from '../../foundation/types/price.js'
import type { MarketSessionConfig } from '../../foundation/utils/sessionTimeLabels.js'
import type { Viewport, ViewportState } from '../chart/index.js'
import { SCALE_X_STRATEGIES, type ScaleXInput } from '../scale/index.js'
import {
  clampNavigation,
  initialNavigation,
  projectPlot,
  type PlotNavigation,
  type ProjectPlotInput,
} from '../viewport/navigation.js'
import type { VisibleRange } from '../viewport/viewport.js'
import type { ZoomConfigBase } from '../viewport/zoom.js'

/**
 * 钳制 effective DPR，避免超出 MAX_CANVAS_PIXELS 上限。
 *
 * @param viewWidth 视口 CSS 宽度
 * @param viewHeight 视口 CSS 高度
 * @param effectiveDpr 当前有效 DPR
 * @param maxCanvasPixels 像素上限（默认 16M）
 * @returns 钳制后的 DPR
 */
export function clampDpr(
  viewWidth: number,
  viewHeight: number,
  effectiveDpr: number,
  maxCanvasPixels = 16 * 1024 * 1024,
): number {
  if (viewWidth * effectiveDpr * (viewHeight * effectiveDpr) > maxCanvasPixels) {
    return Math.sqrt(maxCanvasPixels / (viewWidth * viewHeight))
  }
  return effectiveDpr
}

/**
 * 根据 preciseDpr 与 window.devicePixelRatio 计算 effective DPR。
 *
 * @remarks Electron 环境下忽略 preciseDpr，直接读取系统 DPR，避免缩放控件与系统设置打架。
 *
 * @param preciseDpr 用户配置的高精度 DPR（0 表示自动）
 * @returns 最终生效的 DPR，最低为 1
 */
export function getEffectiveDprLogic(preciseDpr: number): number {
  if (typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron')) {
    return Math.max(1, (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1)
  }
  if (preciseDpr > 0) return preciseDpr
  const dpr = Math.round((typeof window !== 'undefined' ? window.devicePixelRatio : 1) * 64) / 64
  return Math.max(1, dpr || 1)
}

/** 视口模块的响应式输入；全部来自已提交状态。 */
export interface ViewportSignalDeps {
  /** 轴高与密度系数；K 线宽度由导航的缩放目标派生。 */
  geometry$: ReadonlySignal<{ bottomAxisHeight: number; gapRatio: number }>
  dataLength$: ReadonlySignal<number>
  dataView$: ReadonlySignal<ChartDataView>
  data$: ReadonlySignal<ReadonlyArray<ChartSeriesDatum>>
  marketSession$: ReadonlySignal<MarketSessionConfig | null>
  timeShareRange$: ReadonlySignal<TimeShareRange | null>
  zoom$: ReadonlySignal<ZoomConfigBase>
  /** 首次进入品种时使用的缩放级别。 */
  initialZoomLevel: number
}

/** 创建视口状态；派生值只在读取时计算，模块不保存几何副本。 */
export function createViewportState(deps: ViewportSignalDeps) {
  const initial = initialNavigation(deps.initialZoomLevel)
  const { signals, readonly } = createSubState({
    navigation: {
      [ChartDataViewId.KLine]: initial,
      [ChartDataViewId.TimeShare]: initial,
      [ChartDataViewId.FiveDayTimeShare]: initial,
    } as Readonly<Record<ChartDataView, PlotNavigation>>,
    viewWidth: 0,
    viewHeight: 0,
    preciseDpr: 0,
  })

  const dpr = computed(() => {
    const width = Math.max(1, readonly.viewWidth())
    const height = Math.max(1, readonly.viewHeight())
    return clampDpr(width, height, getEffectiveDprLogic(readonly.preciseDpr()))
  })
  const plotWidth = computed(() => Math.round(readonly.viewWidth()))
  const plotHeight = computed(
    () => Math.round(readonly.viewHeight()) - deps.geometry$().bottomAxisHeight,
  )
  const navigation = computed(() => readonly.navigation()[deps.dataView$()])
  const sessionSlotWidth = computed(() =>
    navigation().kind === 'slots' ? (navigation() as { sessionSlotWidth: number | null }).sessionSlotWidth : null,
  )

  /** 唯一投影输入；提交与派生值共用同一份构造，避免两处字段漂移。 */
  const projectionInput = (candidate: PlotNavigation): ProjectPlotInput => ({
    view: deps.dataView$(),
    navigation: candidate,
    width: plotWidth(),
    dpr: dpr(),
    data: deps.data$(),
    dataLength: deps.dataLength$(),
    marketSession: deps.marketSession$(),
    timeShareRange: deps.timeShareRange$(),
    gapRatio: deps.geometry$().gapRatio,
    zoom: deps.zoom$(),
  })

  const projected = computed(() => projectPlot(projectionInput(navigation())))
  const viewSnapshot = computed(() => projected().snapshot)

  const viewInput = computed<ScaleXInput>(() => ({
    view: deps.dataView$(),
    width: plotWidth(),
    dpr: dpr(),
    kWidth: projected().kWidth,
    kGapRatio: deps.geometry$().gapRatio,
    sessionSlotWidth: sessionSlotWidth(),
    data: deps.data$(),
    dataLength: deps.dataLength$(),
    marketSession: deps.marketSession$(),
    timeShareRange: deps.timeShareRange$(),
    scroll: viewSnapshot().scroll,
  }))

  const viewport = computed<Viewport>(() => ({
    viewWidth: readonly.viewWidth(),
    viewHeight: readonly.viewHeight(),
    plotWidth: plotWidth(),
    plotHeight: plotHeight(),
    dpr: dpr(),
    scrollLeft: viewSnapshot().scroll,
  }))

  const viewportState = computed<ViewportState>(() => {
    const snapshot = viewSnapshot()
    return {
      zoomLevel: projected().level,
      plotWidth: plotWidth(),
      plotHeight: plotHeight(),
      dpr: dpr(),
      visibleFrom: snapshot.range.start,
      visibleTo: snapshot.range.end,
      kWidth: snapshot.kWidth,
      kGap: snapshot.kGap,
    }
  })

  /** 提交一次导航目标；精确坐标会先由视图策略夹到合法边界。 */
  const commit = (next: PlotNavigation): boolean => {
    const view = deps.dataView$.peek()
    const candidate = clampNavigation(next, deps.zoom$.peek())
    if (!candidate) return false

    let write = candidate
    if (candidate.kind === 'slots') {
      const { snapshot } = projectPlot(projectionInput(candidate))
      write = { ...candidate, scroll: SCALE_X_STRATEGIES[view].navigate(snapshot, candidate.scroll) }
    }

    const navigationMap = readonly.navigation.peek()
    const current = navigationMap[view]
    // 几何没有变化就不写状态；声明式目标只在目标本身变化时写入。
    if (write.kind === 'slots') {
      const resolved = projectPlot(projectionInput(write))
      if (
        resolved.snapshot.scroll === viewSnapshot.peek().scroll &&
        resolved.kWidth === projected.peek().kWidth &&
        write.sessionSlotWidth === sessionSlotWidth.peek() &&
        current.kind !== 'time'
      )
        return false
    } else if (sameNavigation(current, write)) return false

    signals.navigation.set({ ...navigationMap, [view]: write })
    return true
  }

  return {
    readonly: {
      dpr,
      plotWidth,
      plotHeight,
      navigation,
      viewInput,
      viewSnapshot,
      viewport,
      viewportState,
      /** 生效的缩放级别；时间窗口导航下由窗口根数派生。 */
      zoomLevel: computed(() => projected().level),
      contentWidth: computed(() => viewSnapshot().contentWidth),
      leftLoadBufferWidth: computed(() => viewSnapshot().domOffset),
      maxScrollLeft: computed(() => Math.max(0, viewSnapshot().contentWidth - readonly.viewWidth())),
      /** 世界滚动坐标；最新端与时间窗口在测量后也有确定值。 */
      scroll: computed(() => viewSnapshot().scroll),
      /** 主 DOM 滚动容器的偏移，等于世界坐标加左侧加载缓冲。 */
      domScroll: computed(() => viewSnapshot().domScroll),
      kGap: computed(() => viewSnapshot().kGap),
      slotGrid: computed(() => viewSnapshot().grid),
      /** 最新端的世界坐标；固定视图没有最新端时为 null。 */
      latestScroll: computed(() => SCALE_X_STRATEGIES[deps.dataView$()].latest(viewSnapshot())),
      /** 含两侧渲染扩窗；start 可能为负，用于左缘加载判断。 */
      rawVisibleRange: computed<VisibleRange>(() => viewSnapshot().slotRange),
      /** 可索引可见区间；绘制、命中与指标共用。 */
      visibleRange: computed<VisibleRange>(() => viewSnapshot().range),
      viewWidth: readonly.viewWidth,
      viewHeight: readonly.viewHeight,
      preciseDpr: readonly.preciseDpr,
    },

    actions: {
      /** 提交导航目标；越界坐标被收敛，非法输入被拒绝。 */
      commit,
      /** 冻结当前位置为精确坐标，保持缩放与槽宽。 */
      commitScroll(scroll: number): boolean {
        const current = navigation.peek()
        return commit({
          kind: 'slots',
          scroll,
          zoomLevel: current.kind === 'time' ? projected.peek().level : current.zoomLevel,
          sessionSlotWidth: current.kind === 'slots' ? current.sessionSlotWidth : null,
        })
      },
      /** 只改缩放目标，保持当前锚点形态。 */
      commitZoom(zoomLevel: number): boolean {
        const current = navigation.peek()
        if (current.kind === 'time') {
          return commit({
            kind: 'slots',
            scroll: viewSnapshot.peek().scroll,
            zoomLevel,
            sessionSlotWidth: null,
          })
        }
        return commit({ ...current, zoomLevel })
      },
      /** 贴住最新端。 */
      commitLatest(zoomLevel: number): boolean {
        return commit({ kind: 'latest', zoomLevel })
      },
      /** 装满一个时间窗口。 */
      commitTimeWindow(fromTime: number, toTime: number): boolean {
        return commit({ kind: 'time', fromTime, toTime })
      },
      /** 写入测量结果；几何由订阅者重新投影。 */
      resize(width: number, height: number, preciseDpr: number): void {
        batch(() => {
          signals.viewWidth.set(Number.isFinite(width) ? Math.max(0, width) : 0)
          signals.viewHeight.set(Number.isFinite(height) ? Math.max(0, height) : 0)
          signals.preciseDpr.set(Number.isFinite(preciseDpr) ? preciseDpr : 0)
        })
      },
    },

    dispose(): void {
      batch(() => {
        signals.viewWidth.set(0)
        signals.viewHeight.set(0)
        signals.preciseDpr.set(0)
        signals.navigation.set({
          [ChartDataViewId.KLine]: initial,
          [ChartDataViewId.TimeShare]: initial,
          [ChartDataViewId.FiveDayTimeShare]: initial,
        })
      })
    },
  }
}

/** 比较两个导航目标是否等价。 */
function sameNavigation(left: PlotNavigation, right: PlotNavigation): boolean {
  if (left.kind !== right.kind) return false
  if (left.kind === 'time' && right.kind === 'time')
    return left.fromTime === right.fromTime && left.toTime === right.toTime
  if (left.kind === 'latest' && right.kind === 'latest')
    return left.zoomLevel === right.zoomLevel
  if (left.kind === 'slots' && right.kind === 'slots')
    return (
      left.scroll === right.scroll &&
      left.zoomLevel === right.zoomLevel &&
      left.sessionSlotWidth === right.sessionSlotWidth
    )
  return false
}

export type ViewportStateModule = ReturnType<typeof createViewportState>
export type { PlotNavigation }
