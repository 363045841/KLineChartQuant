/** 图表视图唯一事实来源：视图标识、分类、主序列渲染能力与工作区映射。 */
import type { SymbolSpec } from '../../../../controllers/types.js'
import { FIVE_DAY_TIME_SHARE_PERIOD, isTimeSharePeriod } from '../../../../controllers/types.js'
import {
  type ChartDataView,
  ChartDataViewId,
  isTimeShareDataView,
  resolveChartWorkspaceId,
} from '../../../../foundation/types/chartView.js'

export {
  type ChartDataView,
  ChartDataViewId,
  ChartWorkspaceId,
  isTimeShareDataView,
  resolveChartWorkspaceId,
} from '../../../../foundation/types/chartView.js'

/** 每个受支持图表的固定定义，新增视图必须补齐同一份声明。 */
export interface ChartViewDefinition {
  /** 主序列渲染偏好；分时视图始终以折线渲染。 */
  readonly primaryRenderer: PrimaryRendererType
  /** 是否依赖市场 session 生成交易槽位。 */
  readonly requiresMarketSession: boolean
  /** 视图横向交互能力。 */
  readonly capabilities: Readonly<ViewCapabilities>
  /** 该视图在主图中必须激活的系统渲染实例。 */
  readonly mainInstances: ReadonlyArray<MainInstanceDefinition>
}

/**
 * 主序列渲染类型：同一主序列可选的画法。
 * - `candlestick`：蜡烛图，实体 + 影线，需要 OHLC。
 * - `hollow-candlestick`：涨跌实体均为空心边框，保留影线，需要 OHLC。
 * - `ohlc-bar`：美式 OHLC 柱，只有横线不含实体，需要 OHLC。
 * - `line`：只连收盘价折线。
 * - `area`：收盘价折线 + 底部填充。
 * 蜡烛与 OHLC 柱依赖 OHLC；折线与面积只需收盘价，因此分时只用后两者。
 */
export type PrimaryRendererType =
  | 'candlestick'
  | 'hollow-candlestick'
  | 'ohlc-bar'
  | 'line'
  | 'area'

/** 每个视图独立保存的主序列渲染偏好。 */
export type PrimaryRendererByView = Readonly<Record<ChartDataView, PrimaryRendererType>>

/** 视图横向交互能力。 */
export interface ViewCapabilities {
  readonly allowPan: boolean
  readonly allowZoom: boolean
  readonly allowVerticalScroll: boolean
  readonly allowRightAxisScale: boolean
}

/** mode 源主图实例声明；只想让图表定义实例 id 和渲染层，不关心参数细节。 */
export interface MainInstanceDefinition {
  readonly instanceId: string
  readonly indicatorId: string
  readonly params?: Readonly<Record<string, unknown>>
}

const BAR_CAPABILITIES: Readonly<ViewCapabilities> = Object.freeze({
  allowPan: true,
  allowZoom: true,
  allowVerticalScroll: true,
  allowRightAxisScale: true,
})
const FIXED_CAPABILITIES: Readonly<ViewCapabilities> = Object.freeze({
  allowPan: false,
  allowZoom: false,
  allowVerticalScroll: false,
  allowRightAxisScale: false,
})
const SESSION_CAPABILITIES: Readonly<ViewCapabilities> = Object.freeze({
  allowPan: true,
  allowZoom: true,
  allowVerticalScroll: false,
  allowRightAxisScale: false,
})

/** 主图实例统一挂在 main pane 且序号一致，实例明细由视图声明。 */
const mainInstance = (instanceId: string, indicatorId: string): Readonly<MainInstanceDefinition> =>
  Object.freeze({ instanceId, indicatorId })

const KLINE_MAIN_INSTANCES = Object.freeze([
  mainInstance('mode:candle', 'candle'),
  mainInstance('mode:extrema-markers', 'extremaMarkers'),
  mainInstance('mode:last-price-line', 'lastPriceLine'),
  mainInstance('mode:last-price-label', 'lastPriceLabelRegistrar'),
])

/** 每个图表视图的唯一声明，渲染器/能力/市场 session/系统实例均由此派生。 */
export const CHART_VIEW_DEFINITIONS: Readonly<Record<ChartDataView, ChartViewDefinition>> =
  Object.freeze({
    [ChartDataViewId.KLine]: Object.freeze({
      primaryRenderer: 'candlestick',
      requiresMarketSession: false,
      capabilities: BAR_CAPABILITIES,
      mainInstances: KLINE_MAIN_INSTANCES,
    }),
    [ChartDataViewId.TimeShare]: Object.freeze({
      primaryRenderer: 'line',
      requiresMarketSession: true,
      capabilities: FIXED_CAPABILITIES,
      mainInstances: Object.freeze([mainInstance('mode:timeshare', 'timeShare')]),
    }),
    [ChartDataViewId.FiveDayTimeShare]: Object.freeze({
      primaryRenderer: 'line',
      requiresMarketSession: true,
      capabilities: SESSION_CAPABILITIES,
      mainInstances: Object.freeze([mainInstance('mode:five-day-timeshare', 'fiveDayTimeShare')]),
    }),
  })

/** 默认主序列渲染偏好直接取自各视图声明。 */
export const DEFAULT_PRIMARY_RENDERERS: PrimaryRendererByView = Object.freeze(
  Object.fromEntries(
    (Object.keys(CHART_VIEW_DEFINITIONS) as ChartDataView[]).map((view) => [
      view,
      CHART_VIEW_DEFINITIONS[view].primaryRenderer,
    ]),
  ) as PrimaryRendererByView,
)

/** 主品种周期 → 数据视图的唯一推导；比较集合不参与视图决策。 */
export function resolveChartDataView(period: string | undefined): ChartDataView {
  if (!isTimeSharePeriod(period)) return ChartDataViewId.KLine
  return period === FIVE_DAY_TIME_SHARE_PERIOD
    ? ChartDataViewId.FiveDayTimeShare
    : ChartDataViewId.TimeShare
}

/** 由主品种规格推导目标数据视图。 */
export function resolveChartDataViewForSpec(spec: SymbolSpec | null | undefined): ChartDataView {
  return resolveChartDataView(spec?.period)
}
