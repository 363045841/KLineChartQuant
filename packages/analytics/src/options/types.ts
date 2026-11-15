/**
 * 期权分析数据契约。
 *
 * 数据源固定为 Deribit 公开 REST：一次 `get_book_summary_by_currency` 拿全链，
 * 一次 `get_index_price` 拿现货指数。本模块只描述「拿到什么」与「算出什么」，
 * 不关心传输方式与落盘位置。
 */

/** 支持的期权标的。 */
export const OPTION_CURRENCIES = ['BTC', 'ETH'] as const

/** 期权标的类型。 */
export type OptionCurrency = (typeof OPTION_CURRENCIES)[number]

/** 期权方向。 */
export type OptionType = 'call' | 'put'

/** 参与 GEX 聚合的最大剩余天数：超过 90 天的合约流动性差，会污染净 GEX。 */
export const OPTION_CHAIN_MAX_DTE_DAYS = 90

/** 原始期权链按天分片的滚动保留天数。 */
export const OPTION_CHAIN_RETENTION_DAYS = 90

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
 * 全链口径、无 σ2、无 P/C 比）；版本 2 起改成 nearTerm + allChain 两块。
 */
export interface OptionAggregateSnapshot {
  /** 记录结构版本，消费方据此判断字段兼容性 */
  readonly schemaVersion: 2
  /** 标的 */
  readonly currency: OptionCurrency
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

/** 期权链拉取结果。 */
export interface DeribitOptionChain {
  /** 合约列表（未过滤，保持数据源原样） */
  readonly contracts: readonly OptionContract[]
  /** 请求耗时（毫秒） */
  readonly elapsedMs: number
}

/** 现货指数拉取结果。 */
export interface DeribitIndexPrice {
  /** 指数价 */
  readonly indexPrice: number
  /** 估算交割价 */
  readonly estimatedDeliveryPrice: number
  /** 请求耗时（毫秒） */
  readonly elapsedMs: number
}

/** Deribit 客户端契约。 */
export interface DeribitClient {
  /**
   * 拉取某标的的全部期权合约。
   *
   * @param currency 标的
   * @returns 合约列表与耗时
   */
  readonly getOptionChain: (currency: OptionCurrency) => Promise<DeribitOptionChain>

  /**
   * 拉取某标的的现货指数。
   *
   * @param currency 标的
   * @returns 指数价与估算交割价
   */
  readonly getIndexPrice: (currency: OptionCurrency) => Promise<DeribitIndexPrice>
}
