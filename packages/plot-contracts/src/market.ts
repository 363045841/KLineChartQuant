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
/**
 * 低周期明细单页根数。
 *
 * 明细页只能按游标串行拉取（下一页依赖本页最早时间戳），根数太小会把一次
 * 覆盖数万根 1 分钟数据的请求拆成上百次往返。取 1000 是因为连接器的单页上限
 * 就是 1000（MT5 连接器对 limit > 1000 返回 422），再大只会整页失败。
 */
export const DEFAULT_INTRABAR_PAGE_LIMIT = 1000

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


/**
 * 一次脚本运行最多带多少条期权快照。
 *
 * 采集是分钟级，1440 条约一整天；更长的历史在图上已超出任何一段可视范围，
 * 只会放大跨线程载荷。历史从 2026-11-14 起积累，需要更长区间时再调大。
 */
export const DEFAULT_OPTION_HISTORY_ROWS = 1440

/** 期权关键位请求：按期权标的取最近若干条快照。 */
export interface OptionLevelsRequest {
  /** 期权标的，形如 `BTC`、`ETH`、`XAUUSD`。 */
  readonly underlying: string
  /** 最多取多少条历史快照，缺省 1 表示只要最新一条。 */
  readonly historyLimit?: number
}

/**
 * 一条期权关键位快照。
 *
 * 主图默认口径是近月（最近一个到期日）；`allChain*` 是 90 天内全链聚合，作参考线。
 * `gammaFlipSource` 说明主图翻转位来自近月还是全链兜底。
 */
export interface OptionLevelsRow {
  /** 采集时刻（毫秒，UTC） */
  readonly capturedAt: number
  /** 近月到期日 */
  readonly nearTermExpiryIso: string
  /** 近月剩余天数 */
  readonly nearTermDteDays: number
  /** 近月平值隐含波动率，百分数（44.4 表示 44.4%） */
  readonly atmIvPercent: number | null
  /** 最近一次采集的现货指数 */
  readonly spotIndex: number
  /** 主图翻转位 */
  readonly gammaFlipUsd: number | null
  /** 主图翻转位来源 */
  readonly gammaFlipSource: 'near-term' | 'all-chain'
  /** 近月 Call 墙行权价（OI 口径：该方向持仓最集中） */
  readonly callWallUsd: number | null
  /** 近月 Put 墙行权价（OI 口径） */
  readonly putWallUsd: number | null
  /** 近月 Gamma 加权 Call 墙行权价（OI×Γ 最大，主口径：日内对冲火力最密集处） */
  readonly callGammaWallUsd: number | null
  /** 近月 Gamma 加权 Put 墙行权价（OI×Γ 最大） */
  readonly putGammaWallUsd: number | null
  /** 近月最大痛点 */
  readonly maxPainUsd: number
  /** 近月 ±1σ 下沿 */
  readonly sigmaLowerUsd: number
  /** 近月 ±1σ 上沿 */
  readonly sigmaUpperUsd: number
  /** 近月 ±2σ 下沿 */
  readonly sigma2LowerUsd: number
  /** 近月 ±2σ 上沿 */
  readonly sigma2UpperUsd: number
  /** 全链翻转位 */
  readonly allChainGammaFlipUsd: number | null
  /** 全链 Call 墙行权价 */
  readonly allChainCallWallUsd: number | null
  /** 全链 Put 墙行权价 */
  readonly allChainPutWallUsd: number | null
  /** 全链最大痛点 */
  readonly allChainMaxPainUsd: number
  /** 近月 P/C 持仓比 */
  readonly putCallOiRatio: number | null
  /** 全链 P/C 持仓比 */
  readonly allChainPutCallOiRatio: number | null
}

export interface IndicatorMarketContext {
  readonly symbol: string
  /**
   * 当前图表品种映射到的期权标的，例如 `BTCUSDT` 映射到 `BTC`。
   *
   * 映射由宿主配置层维护；没有映射时为 null，脚本据此判定本图没有期权数据。
   */
  readonly optionUnderlying: string | null
  readonly time?: ScriptTimeContext
  /** 本次计算的生命周期；只在宿主使用，不传入脚本或跨线程消息。 */
  readonly signal?: AbortSignal
  /** 根据主图已加载历史与预热根数准备快照，分页仍由游标驱动。 */
  loadBars(request: IndicatorBarsRequest, signal?: AbortSignal): Promise<readonly Bar[]>

  /**
   * 读期权关键位快照，按采集时刻升序返回。
   *
   * 数据来自 analytics 只读服务；服务不可用时返回空数组，由脚本自行处理缺失。
   */
  loadOptionLevels(
    request: OptionLevelsRequest,
    signal?: AbortSignal,
  ): Promise<readonly OptionLevelsRow[]>
}
