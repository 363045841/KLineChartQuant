/**
 * 视口导航契约与纯投影。
 *
 * 导航是唯一的可写事实，有三种形态：
 * - `slots`：用户手势后的精确世界坐标；
 * - `latest`：贴住最新端，宽度变化时由投影重新解算；
 * - `time`：装满一个时间窗口，宽度变化时重新解算。
 *
 * 三者都由几何与数据一次算出，绝不回写派生值。
 */

import type { TimeShareRange } from '../../data/provider/types.js'
import type { ChartSeriesDatum } from '../../foundation/types/price.js'
import type { ChartDataView } from '../../foundation/types/chartView.js'
import type { MarketSessionConfig } from '../../foundation/utils/sessionTimeLabels.js'
import { SCALE_X_STRATEGIES, type ScaleXInput, type ScaleXSnapshot } from '../scale/index.js'
import { createKLineSlotGeometry } from './slotGrid.js'
import { projectTimeRange } from './timeNavigation.js'
import { kGapFromKWidth, type ZoomConfigBase, zoomLevelToKWidth } from './zoom.js'

/** 精确世界坐标导航；手势提交后总是这种形态。 */
export interface SlotNavigation {
  readonly kind: 'slots'
  /** 视口左缘的世界坐标。 */
  readonly scroll: number
  readonly zoomLevel: number
  /** 分时每个交易槽的宽度；K 线视图恒为 null。 */
  readonly sessionSlotWidth: number | null
}

/** 贴住最新端；位置在投影时按当前宽度解算。 */
export interface LatestNavigation {
  readonly kind: 'latest'
  readonly zoomLevel: number
}

/** 装满一个时间窗口；缩放由窗口根数派生。 */
export interface TimeNavigation {
  readonly kind: 'time'
  readonly fromTime: number
  readonly toTime: number
}

/** 单个数据视图的导航目标。 */
export type PlotNavigation = SlotNavigation | LatestNavigation | TimeNavigation

/** 初始导航：贴住最新端并使用配置的初始缩放。 */
export function initialNavigation(zoomLevel: number): PlotNavigation {
  return Object.freeze({ kind: 'latest' as const, zoomLevel })
}

/** 把导航收敛到合法范围；非法输入直接拒绝，不做静默替换。 */
export function clampNavigation(
  navigation: PlotNavigation,
  zoom: ZoomConfigBase,
): PlotNavigation | null {
  if (navigation.kind === 'time') {
    const { fromTime, toTime } = navigation
    if (!Number.isFinite(fromTime) || !Number.isFinite(toTime) || toTime < fromTime) return null
    return Object.freeze({ kind: 'time' as const, fromTime, toTime })
  }
  if (!Number.isFinite(navigation.zoomLevel)) return null
  const zoomLevel = Math.max(1, Math.min(zoom.zoomLevelCount, navigation.zoomLevel))
  if (navigation.kind === 'latest') return Object.freeze({ kind: 'latest' as const, zoomLevel })
  if (!Number.isFinite(navigation.scroll)) return null
  const slot = navigation.sessionSlotWidth
  return Object.freeze({
    kind: 'slots' as const,
    scroll: navigation.scroll,
    zoomLevel,
    sessionSlotWidth: typeof slot === 'number' && slot > 0 ? slot : null,
  })
}

/** 纯投影输入：导航目标加上测量得到的几何。 */
export interface ProjectPlotInput {
  readonly view: ChartDataView
  readonly navigation: PlotNavigation
  readonly width: number
  readonly dpr: number
  readonly data: ReadonlyArray<ChartSeriesDatum>
  readonly dataLength: number
  readonly marketSession: MarketSessionConfig | null
  readonly timeShareRange: TimeShareRange | null
  readonly gapRatio: number
  readonly zoom: ZoomConfigBase
}

/** 一次投影的结果：视图策略快照、生效的 K 线宽度与缩放级别。 */
export interface ProjectedPlot {
  readonly snapshot: ScaleXSnapshot
  readonly kWidth: number
  readonly level: number
}

const project = (input: ProjectPlotInput, scroll: number, kWidth: number): ScaleXSnapshot =>
  SCALE_X_STRATEGIES[input.view].project({
    view: input.view,
    width: input.width,
    dpr: input.dpr,
    kWidth,
    kGapRatio: input.gapRatio,
    sessionSlotWidth: input.navigation.kind === 'slots' ? input.navigation.sessionSlotWidth : null,
    data: input.data,
    dataLength: input.dataLength,
    marketSession: input.marketSession,
    timeShareRange: input.timeShareRange,
    scroll,
  })

/** 时间窗口在给定宽度下的槽位与缩放；不可解算时为 null。 */
export function timeNavigationToSlots(
  bars: ReadonlyArray<{ readonly timestamp: number }>,
  fromTime: number,
  toTime: number,
  geometry: { readonly plotWidth: number; readonly dpr: number; readonly gapRatio: number },
  zoom: ZoomConfigBase,
): SlotNavigation | null {
  const frame = projectTimeRange(bars, fromTime, toTime, {
    plotWidth: geometry.plotWidth,
    gapRatio: geometry.gapRatio,
    minKWidth: zoom.minKWidth,
    maxKWidth: zoom.maxKWidth,
    zoomLevelCount: zoom.zoomLevelCount,
  })
  if (!frame) return null
  const kWidth = zoomLevelToKWidth(frame.level, zoom)
  const gap = kGapFromKWidth(kWidth, geometry.dpr, geometry.gapRatio)
  const { grid } = createKLineSlotGeometry(kWidth, gap, geometry.dpr)
  return Object.freeze({
    kind: 'slots' as const,
    scroll: grid.origin + frame.anchorSlot * grid.step,
    zoomLevel: frame.level,
    sessionSlotWidth: null,
  })
}

/**
 * 把导航目标投影成槽位几何。
 *
 * `latest` 与 `time` 在宽度未测量时退化为不可绘制快照（`ready=false`），
 * 一旦测量完成，同一份导航会得到确定位置，不需要任何重试。
 */
export function projectPlot(input: ProjectPlotInput): ProjectedPlot {
  if (input.navigation.kind === 'time') {
    const resolved =
      input.width > 0
        ? timeNavigationToSlots(
            input.data,
            input.navigation.fromTime,
            input.navigation.toTime,
            { plotWidth: input.width, dpr: input.dpr, gapRatio: input.gapRatio },
            input.zoom,
          )
        : null
    const kWidth = zoomLevelToKWidth(resolved?.zoomLevel ?? 1, input.zoom)
    return {
      snapshot: project(input, resolved?.scroll ?? 0, kWidth),
      kWidth,
      level: resolved?.zoomLevel ?? 1,
    }
  }
  const kWidth = zoomLevelToKWidth(input.navigation.zoomLevel, input.zoom)
  if (input.navigation.kind === 'slots')
    return {
      snapshot: project(input, input.navigation.scroll, kWidth),
      kWidth,
      level: input.navigation.zoomLevel,
    }
  const base = project(input, 0, kWidth)
  const latest = SCALE_X_STRATEGIES[input.view].latest(base)
  return {
    snapshot: latest === null ? base : project(input, latest, kWidth),
    kWidth,
    level: input.navigation.zoomLevel,
  }
}
