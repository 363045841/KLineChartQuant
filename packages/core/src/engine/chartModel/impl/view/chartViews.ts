/** 图表视图唯一事实来源：视图标识、分类、主序列渲染能力与工作区映射。 */
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
  /** 视图拥有的基础绘制图层，不进入指标定义或实例集合。 */
  readonly systemLayers: ReadonlyArray<string>
}

/**
 * 主序列渲染类型：同一主序列可选的画法。
 * - `candlestick`：蜡烛图，实体 + 影线，需要 OHLC。
 * - `hollow-candlestick`：涨跌实体均为空心边框，保留影线，需要 OHLC。
 * - `ohlc-bar`：美国线，高低价竖线 + 左开盘/右收盘短横线，需要 OHLC。
 * - `high-low`：实体以 K 线宽度覆盖 high 到 low，保留原始区间与涨跌颜色。
 * - `footprint`：按逐笔成交展示每根 K 线内的价格档位分布。
 * - `line`：只连收盘价折线。
 * - `area`：收盘价折线 + 底部填充。
 * 蜡烛与 OHLC 柱依赖 OHLC；折线与面积只需收盘价，因此分时只用后两者。
 */
export type PrimaryRendererType =
  | 'candlestick'
  | 'hollow-candlestick'
  | 'ohlc-bar'
  | 'high-low'
  | 'footprint'
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

const KLINE_SYSTEM_LAYERS = Object.freeze([
  'candle',
  'extremaMarkers',
  'lastPriceLine',
  'lastPriceLabelRegistrar',
])

/** 每个图表视图的唯一声明，渲染器/能力/市场 session/系统实例均由此派生。 */
export const CHART_VIEW_DEFINITIONS: Readonly<Record<ChartDataView, ChartViewDefinition>> =
  Object.freeze({
    [ChartDataViewId.KLine]: Object.freeze({
      primaryRenderer: 'candlestick',
      requiresMarketSession: false,
      capabilities: BAR_CAPABILITIES,
      systemLayers: KLINE_SYSTEM_LAYERS,
    }),
    [ChartDataViewId.TimeShare]: Object.freeze({
      primaryRenderer: 'line',
      requiresMarketSession: true,
      capabilities: FIXED_CAPABILITIES,
      systemLayers: Object.freeze(['timeShare']),
    }),
    [ChartDataViewId.FiveDayTimeShare]: Object.freeze({
      primaryRenderer: 'line',
      requiresMarketSession: true,
      capabilities: SESSION_CAPABILITIES,
      systemLayers: Object.freeze(['fiveDayTimeShare']),
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
