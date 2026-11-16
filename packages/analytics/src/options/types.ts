/**
 * 期权分析数据契约。
 *
 * 数据源固定为 Deribit 公开 REST：一次 `get_book_summary_by_currency` 拿全链，
 * 一次 `get_index_price` 拿现货指数。本模块只描述「拿到什么」与「算出什么」，
 * 不关心传输方式与落盘位置。
 */

import type { OptionCurrency, OptionVenue } from './markets'

export type { OptionCurrency, OptionMarket, OptionVenue } from './markets'
export { OPTION_CURRENCIES, OPTION_MARKETS, optionMarketOf } from './markets'

/** 期权方向。 */
export type OptionType = 'call' | 'put'

/** 参与 GEX 聚合的最大剩余天数：超过 90 天的合约流动性差，会污染净 GEX。 */
export const OPTION_CHAIN_MAX_DTE_DAYS = 90

/** 原始期权链按天分片的滚动保留天数。 */
export const OPTION_CHAIN_RETENTION_DAYS = 90

/** 分钟行的保留天数：一年，供研究与训练回看。 */
export const OPTION_MINUTE_RETENTION_DAYS = 365

/** 小时行的保留天数：与分钟行一致，避免同一段时间只有一种颗粒度。 */
export const OPTION_HOURLY_RETENTION_DAYS = 365

/** 日行的保留天数：十年，日级样本的体积可以忽略。 */
export const OPTION_DAILY_RETENTION_DAYS = 3650

/** Deribit 全链快照中的一张合约。字段来自 `get_book_summary_by_currency`，greeks 不存在，需本地自算。 */
export interface OptionContract {
  /** 合约名，形如 `BTC-27NOV26-73000-C` */
  readonly instrumentName: string
  /** 标的 */
  readonly currency: OptionCurrency
  /** 到期日（UTC 日期） */
  readonly expiryIso: string
  /** 到期时刻毫秒时间戳（UTC 08:00） */
  readonly expiryMs: number
  /** 行权价（USD） */
  readonly strike: number
  /** 方向 */
  readonly optionType: OptionType
  /** 未平仓合约数（张，每张 1 个标的） */
  readonly openInterest: number
  /** 隐含波动率，百分数（44.4 表示 44.4%） */
  readonly markIvPercent: number
  /** 标记价格，币计价（反向合约） */
  readonly markPrice: number
  /** 该到期日的期货价（USD），是期权的真实标的，不是现货指数 */
  readonly underlyingPrice: number
  /** Deribit 快照生成时刻（毫秒），与 HTTP 响应约有 1.3 秒延迟 */
  readonly creationTimestamp: number
}

/** 单个行权价的持仓聚合。 */
export interface OptionStrikeExposure {
  /** 行权价 */
  readonly strike: number
  /** 该行权价上的未平仓合约数（call 与 put 分开统计时即该方向的值） */
  readonly openInterest: number
}

/** Gamma 加权的墙位：OI×Γ 合计最大的行权价。 */
export interface OptionGammaWall {
  /** 行权价 */
  readonly strike: number
  /** 该行权价的 OI×Γ 合计，单位 1/USD */
  readonly gammaWeight: number
}

/** 一套关键位，近月与全链各算一份。 */
export interface OptionLevelSet {
  /**
   * Gamma 翻转位：按行权价累计净 GEX 由负转正的价位；无穿越时为 null。
   * 近月口径样本少，常见 null，主图用全链兜底。
   */
  readonly gammaFlipUsd: number | null
  /** Call 墙：call 未平仓量最大的行权价；该视图没有 call 持仓时为 null */
  readonly callWall: OptionStrikeExposure | null
  /** Put 墙：put 未平仓量最大的行权价；该视图没有 put 持仓时为 null */
  readonly putWall: OptionStrikeExposure | null
  /**
   * Gamma 加权 Call 墙：OI×Γ 合计最大的行权价，代表日内对冲火力最密集处。
   * 这是主口径；`callWall` 保留为 OI 口径的仓位聚集位。
   */
  readonly callGammaWall: OptionGammaWall | null
  /** Gamma 加权 Put 墙；口径同 `callGammaWall` */
  readonly putGammaWall: OptionGammaWall | null
  /** 最大痛点：到期赔付总额最小的行权价 */
  readonly maxPainUsd: number
  /** 净 GEX：单位「USD / 1% 波动」，call 记正、put 记负 */
  readonly netGexUsdPerPercent: number
  /** 认沽与认购未平仓量之比；call 持仓为 0 时为 null */
  readonly putCallOiRatio: number | null
  /** 该视图内的总未平仓量 */
  readonly totalOpenInterest: number
  /** 该视图参与计算的合约数 */
  readonly contractCount: number
}

/** 近月视图：比全链多出到期、平值 IV 与波动区间。 */
export interface OptionNearTermLevels extends OptionLevelSet {
  /** 近月到期日（UTC 日期） */
  readonly expiryIso: string
  /** 近月剩余天数 */
  readonly dteDays: number
  /** 近月平值隐含波动率，百分数 */
  readonly atmIvPercent: number
  /** 由平值 IV 推算出的一倍标准差预期波动（USD） */
  readonly expectedMoveOneSigmaUsd: number
  /** 由平值 IV 推算出的两倍标准差预期波动（USD） */
  readonly expectedMoveTwoSigmaUsd: number
  /** 一倍标准差下界 */
  readonly sigmaLowerUsd: number
  /** 一倍标准差上界 */
  readonly sigmaUpperUsd: number
  /** 两倍标准差下界 */
  readonly sigma2LowerUsd: number
  /** 两倍标准差上界 */
  readonly sigma2UpperUsd: number
}

/**
 * 主图采用的翻转位与来源。
 *
 * 近月算出翻转位就用近月，近月为 null 时用全链兜底，来源字段让界面能标明口径。
 */
export interface OptionGammaFlip {
  /** 实际采用的翻转位 */
  readonly gammaFlipUsd: number | null
  /** 该值来自近月还是全链 */
  readonly source: 'near-term' | 'all-chain'
}

/**
 * 一次期权链快照算出的聚合位。
 *
 * schemaVersion 1 的行只有扁平字段（callWall/putWall/maxPainUsd/gammaFlipUsd 等，
 * 全链口径、无 σ2、无 P/C 比）；版本 2 起改成 nearTerm + allChain 两块；
 * 版本 3 增加逐到期汇总（`expiries`）与 25Δ 偏斜。
 */
export interface OptionAggregateSnapshot {
  /** 记录结构版本，消费方据此判断字段兼容性 */
  readonly schemaVersion: 3
  /** 标的 */
  readonly currency: OptionCurrency
  /** 该行的数据场所：同一品种只登记一个主场所，读方据此说明来源 */
  readonly venue: OptionVenue
  /** 本地采集时刻（毫秒） */
  readonly capturedAt: number
  /** 链的来源时刻：全部合约 `creation_timestamp` 的最大值 */
  readonly sourceTimestamp: number
  /** 现货指数价格（USD） */
  readonly spotIndex: number
  /** 原始链合约数 */
  readonly chainContractCount: number
  /** 过滤 `0 < DTE <= 90` 且持仓为正后参与计算的合约数 */
  readonly filteredContractCount: number
  /** 近月视图：最近一个到期日的关键位与波动区间 */
  readonly nearTerm: OptionNearTermLevels
  /** 全链视图：`0 < DTE <= 90` 全部到期合并 */
  readonly allChain: OptionLevelSet
  /** 主图采用的翻转位 */
  readonly gammaFlip: OptionGammaFlip
  /**
   * 该行覆盖的分钟行数。小时行与日行是时段边界那一刻的快照，这里记时段内
   * 实际有过几条分钟行，用来判断覆盖度；分钟行本身不写该字段。
   */
  readonly aggregatedRows?: number
  /** 逐到期的汇总，按到期升序 */
  readonly expiries: readonly OptionExpirySummary[]
  /** 25Δ 风险逆转（波动点）；没有可用到期或缺翼时为 null */
  readonly skew25dVolPoints: number | null
  /** 25Δ 偏斜使用的到期日；不可用时为 null */
  readonly skew25dExpiryIso: string | null
  /** 偏斜不可用的原因；有值时恒为 null */
  readonly skew25dReason: OptionSkewUnavailableReason | null
}

/** 一个到期上的汇总：期限结构与逐到期持仓。 */
export interface OptionExpirySummary {
  /** 到期日（UTC 日期） */
  readonly expiryIso: string
  /** 剩余天数 */
  readonly dteDays: number
  /** 该到期的平值 IV（百分数）；该到期期货价不可用时为 null */
  readonly atmIvPercent: number | null
  /** 认沽与认购未平仓量之比；call 持仓为 0 时为 null */
  readonly putCallOiRatio: number | null
  /** 该到期的总未平仓量（张） */
  readonly totalOpenInterest: number
}

/** 25Δ 风险逆转不可用的原因。 */
export type OptionSkewUnavailableReason =
  | 'no-eligible-expiry'
  | 'invalid-forward'
  | 'missing-call-wing'
  | 'missing-put-wing'
  | 'missing-wings'

/** 统计的样本来源层：优先日行，缺失时回退小时行。 */
export type OptionStatsSource = 'daily' | 'hourly' | 'none'

/** 一个窗口内的波动分位统计。 */
export interface OptionWindowStats {
  /** 窗口天数（UTC 日历天） */
  readonly windowDays: number
  /** 窗口内真实存在的样本天数；不补齐缺失日 */
  readonly sampleDays: number
  /** 窗口天数，等于要满窗需要的样本天数 */
  readonly expectedDays: number
  /** 窗口内最新一个平值 IV 样本（百分数） */
  readonly ivLatest: number | null
  /** 窗口内最高平值 IV */
  readonly ivHigh: number | null
  /** 窗口内最低平值 IV */
  readonly ivLow: number | null
  /** IV Rank：`(最新 − 最低) / (最高 − 最低) × 100`；样本不足或高低相同为 null */
  readonly ivRank: number | null
  /** IV Percentile：窗口内严格低于最新值的样本占比；样本不足为 null */
  readonly ivPercentile: number | null
}

/** 期限结构上的一个到期点。 */
export interface OptionTermPoint {
  /** 到期日（UTC 日期） */
  readonly expiryIso: string
  /** 剩余天数 */
  readonly dteDays: number
  /** 该到期的平值 IV，百分数 */
  readonly atmIvPercent: number
}

/** 一次波动统计的结果。 */
export interface OptionVolatilityStats {
  /** 样本来源层 */
  readonly source: OptionStatsSource
  /** 最新样本是否已过期（日行 26 小时、小时行 3 小时） */
  readonly stale: boolean
  /** 最新样本的采集时刻；没有样本时为 null */
  readonly latestCapturedAt: number | null
  /** 20 日年化已实现波动率（百分数）；收盘样本不足 21 个为 null */
  readonly rv20: number | null
  /** 方差风险溢价：最新平值 IV − rv20，百分点 */
  readonly vrp: number | null
  /** 期限结构；最新样本行没有逐到期 IV 时为 null */
  readonly termStructure: readonly OptionTermPoint[] | null
  /** 25Δ 风险逆转（波动点）；没有 7–90 天的到期或缺翼时为 null */
  readonly skew25dVolPoints: number | null
  /** 25Δ 偏斜使用的到期日；不可用时为 null */
  readonly skew25dExpiryIso: string | null
  /** 各请求窗口的统计，顺序与请求一致 */
  readonly windows: readonly OptionWindowStats[]
}

/** 原始期权链的一行（层 3），用于按天积累历史。 */
export interface OptionChainRecord {
  /** 记录结构版本 */
  readonly schemaVersion: 1
  /** 标的 */
  readonly currency: OptionCurrency
  /** 该行所属快照的本地采集时刻，用于把同一批合约分组 */
  readonly capturedAt: number
  /** 合约名 */
  readonly instrumentName: string
  /** 到期日（UTC 日期） */
  readonly expiryIso: string
  /** 行权价 */
  readonly strike: number
  /** 方向 */
  readonly optionType: OptionType
  /** 未平仓合约数 */
  readonly openInterest: number
  /** 隐含波动率，百分数 */
  readonly markIvPercent: number
  /** 标记价格，币计价 */
  readonly markPrice: number
  /** 该到期日的期货价 */
  readonly underlyingPrice: number
}

/** 一次全链拉取的结果。 */
export interface OptionChainSnapshot {
  /** 合约列表（未过滤，保持数据源原样） */
  readonly contracts: readonly OptionContract[]
  /** 请求耗时（毫秒） */
  readonly elapsedMs: number
}

/** 现货指数拉取结果。 */
export interface SpotIndexSnapshot {
  /** 指数价 */
  readonly indexPrice: number
  /** 请求耗时（毫秒） */
  readonly elapsedMs: number
}

/**
 * 一个场所的期权数据源。
 *
 * 输入统一的标的代码，输出统一的合约结构：聚合、滚上、保留期与面板都不关心场所差异，
 * 场所差异只存在于各适配器的解析里（Deribit 反向合约、Binance 的字符串数字与指数近似）。
 */
export interface OptionVenueSource {
  /**
   * 拉取某标的的全部期权合约。
   *
   * @param currency 统一标的代码
   * @returns 合约列表与耗时
   */
  readonly getOptionChain: (currency: OptionCurrency) => Promise<OptionChainSnapshot>

  /**
   * 拉取某标的的现货指数。
   *
   * @param currency 统一标的代码
   * @returns 指数价与耗时
   */
  readonly getIndexPrice: (currency: OptionCurrency) => Promise<SpotIndexSnapshot>
}
