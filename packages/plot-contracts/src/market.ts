/** 指标读取宿主行情的中立契约；不暴露 Buffer、Provider 或可写状态。 */
import type { Bar } from './bar.js'

/** 内置数据源身份；指定后严格路由，不做跨来源回退。 */
export const DataSource = {
  Binance: 'binance',
  Gotdx: 'gotdx',
  BaoStock: 'baostock',
  TradingView: 'tradingview',
  MT5: 'mt5',
  THS: 'ths',
  Mock: 'mock',
} as const satisfies Record<string, string>
export type DataSource = (typeof DataSource)[keyof typeof DataSource]

export const DEFAULT_REQUEST_BARS = 300

export interface IndicatorBarsRequest {
  /** 目标来源的 sourceId；同品种缺省继承图表来源，跨品种必须显式给出。 */
  readonly source?: string
  readonly symbol: string
  readonly timeframe: string
  readonly calcBarsCount: number
}

export interface IndicatorMarketContext {
  readonly symbol: string
  /** 根据主图已加载历史与预热根数准备快照，分页仍由游标驱动。 */
  loadBars(request: IndicatorBarsRequest): Promise<readonly Bar[]>
}
