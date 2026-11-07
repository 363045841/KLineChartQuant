/** 指标读取宿主行情的中立契约；不暴露 Buffer、Provider 或可写状态。 */
import type { Bar } from './bar.js'
import type { ScriptTimeContext } from './time.js'

export type { ScriptMarketSession, ScriptSessionRange, ScriptTimeContext } from './time.js'

/**
 * @summary 数据源
 *
 * 内置数据源身份；指定后严格路由，不做跨来源回退。
 */
export const DataSource = {
  /** @summary 币安 */
  Binance: 'binance',
  /** @summary 通达信 */
  Gotdx: 'gotdx',
  /** @summary 证券宝 */
  BaoStock: 'baostock',
  /** @summary TradingView */
  TradingView: 'tradingview',
  /** @summary MetaTrader 5 */
  MT5: 'mt5',
  /** @summary 同花顺 */
  THS: 'ths',
  /** @summary 模拟数据 */
  Mock: 'mock',
} as const satisfies Record<string, string>
export type DataSource = (typeof DataSource)[keyof typeof DataSource]

/**
 * @summary 目标周期
 *
 * 脚本 `request.security` 的目标周期，由宿主注入为 VM 全局枚举。
 *
 * 取值是周期短写法，只登记图表已支持的周期；需要新周期时先扩 `KLinePeriod`，
 * 再在这里登记对应写法，宿主侧 `requestPeriod` 不接受未登记的值。
 */
export const Timeframe = {
  /** @summary 1 分钟 */
  Minute1: '1',
  /** @summary 5 分钟 */
  Minute5: '5',
  /** @summary 15 分钟 */
  Minute15: '15',
  /** @summary 30 分钟 */
  Minute30: '30',
  /** @summary 1 小时 */
  Hour1: '60',
  /** @summary 4 小时 */
  Hour4: '240',
  /** @summary 日线 */
  Day: 'D',
  /** @summary 周线 */
  Week: 'W',
  /** @summary 月线 */
  Month1: 'M',
  /** @summary 季线 */
  Month3: '3M',
  /** @summary 年线 */
  Month12: '12M',
} as const satisfies Record<string, string>
export type Timeframe = (typeof Timeframe)[keyof typeof Timeframe]

export const DEFAULT_REQUEST_BARS = 300
/** 低周期请求默认最多保留最近十万根实际明细，避免跨年分钟历史无限加载。 */
export const DEFAULT_INTRABAR_LIMIT = 100_000

export interface IndicatorBarsRequest {
  /** lower_tf 保留全部日内明细；security 为每个主图bar输出一个对齐值。 */
  readonly mode?: 'security' | 'lower_tf'
  readonly ignore_invalid_timeframe?: boolean
  /** 目标来源的 sourceId；同品种缺省继承图表来源，跨品种必须显式给出。 */
  readonly source?: string
  readonly symbol: string
  readonly timeframe: string
  readonly calcBarsCount: number
}

export interface IndicatorMarketContext {
  readonly symbol: string
  readonly time?: ScriptTimeContext
  /** 本次计算的生命周期；只在宿主使用，不传入脚本或跨线程消息。 */
  readonly signal?: AbortSignal
  /** 根据主图已加载历史与预热根数准备快照，分页仍由游标驱动。 */
  loadBars(request: IndicatorBarsRequest, signal?: AbortSignal): Promise<readonly Bar[]>
}
