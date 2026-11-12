/**
 * 订单流面板契约：跨交易所的深度、成交、持仓三类事实。
 *
 * 设计要点（这些是面板能不能用的关键，改动前先读 docs/design/data/orderflow-panel.md）：
 *
 * 1. **数量单位一律先归一化成基础币**。各所下发的数量单位不同——OKX 永续给的是
 *    张数（BTC 一张 = 0.01 BTC），其余三家给币数。混用会让某一家凭空放大 100 倍，
 *    而分场所净流正是靠横向比较得出的，单位错等于结论全错。
 *
 * 2. **深度按价格区间统计，不按档数**。各所返回的档数不同（Binance 5000 档覆盖 ±1.3%，
 *    Bybit 200 档覆盖 ±0.5%），按「前 N 档」相加是不可比的。统一用「距中间价 ±X% 内的
 *    名义金额」，覆盖率不足的区间标 null，让调用方知道这个数字不可信。
 *
 * 3. **同时记录「全深度」与「近端深度」**。文章识别背离的方式是：全深度买盘多，
 *    但近端挂单卖盘多 → 买单挂在远处。因此每一侧都要给两个口径，缺一则无法判断背离。
 *
 * 4. **价格墙只报「超出本所自身档位分布」的挂单**，不用固定金额阈值。
 *    固定阈值会让大所永远有墙、小所永远没有，失去可比性。
 */

/** 支持的交易所。 */
export const ORDERFLOW_VENUES = ['binance', 'okx', 'bybit', 'bitget', 'hyperliquid'] as const

/** 交易所标识。 */
export type OrderflowVenue = (typeof ORDERFLOW_VENUES)[number]

/** 面板统计的深度区间（距中间价的百分比）。 */
export const DEPTH_BANDS = [0.5, 1, 2] as const

/** 深度区间类型。 */
export type DepthBand = (typeof DEPTH_BANDS)[number]

/** 近端档位数：这个范围内的挂单是「活跃」的，对应文章说的「近端实际在卖」。 */
export const NEAR_LEVELS = 10

/** 价格墙判定：单档名义金额超过本所档位分布的这个倍数即视为墙。 */
export const WALL_MULTIPLE = 8

/** 单一档位（数量已归一化为基础币）。 */
export interface DepthLevel {
  /** 价格 */
  readonly price: number
  /** 数量（基础币） */
  readonly size: number
  /** 名义金额（计价币） */
  readonly notional: number
}

/** 一个深度区间的统计。 */
export interface DepthBandStats {
  /** 区间（百分比，正数） */
  readonly band: DepthBand
  /** 买盘名义金额 */
  readonly bidNotional: number
  /** 卖盘名义金额 */
  readonly askNotional: number
  /**
   * 失衡度 = (买 − 卖) / (买 + 卖)，范围 [-1, 1]。
   * 正值表示买盘更厚，负值表示卖盘更厚。
   */
  readonly imbalance: number
  /** 该区间两侧是否都被完整覆盖；false 表示数据不足，上面的数字偏小 */
  readonly complete: boolean
}

/** 价格墙。 */
export interface PriceWall {
  /** 方向 */
  readonly side: 'bid' | 'ask'
  /** 价格 */
  readonly price: number
  /** 名义金额 */
  readonly notional: number
  /** 距中间价的百分比 */
  readonly distancePct: number
}

/** 单所某一时刻的深度快照。 */
export interface DepthSnapshot {
  /** 交易所 */
  readonly venue: OrderflowVenue
  /** 统一交易对标识，例如 `BTCUSDT` */
  readonly symbol: string
  /** 采集时刻（毫秒） */
  readonly timestamp: number
  /** 中间价 = (最优买 + 最优卖) / 2 */
  readonly midPrice: number
  /** 最优买价 */
  readonly bestBid: number
  /** 最优卖价 */
  readonly bestAsk: number
  /** 买卖价差占中间价的比例 */
  readonly spreadRatio: number
  /** 收到的买盘档数 */
  readonly bidLevels: number
  /** 收到的卖盘档数 */
  readonly askLevels: number
  /** 买盘实际覆盖的百分比深度（最远档距中间价） */
  readonly bidCoveragePct: number
  /** 卖盘实际覆盖的百分比深度 */
  readonly askCoveragePct: number
  /** 各区间统计 */
  readonly bands: readonly DepthBandStats[]
  /**
   * 近端失衡：只看最优 NEAR_LEVELS 档的 (买 − 卖) / (买 + 卖)。
   * 与 `bands[最宽]` 的 imbalance 符号相反即构成文章所说的「深度背离」。
   */
  readonly nearImbalance: number
  /** 近端买盘名义金额 */
  readonly nearBidNotional: number
  /** 近端卖盘名义金额 */
  readonly nearAskNotional: number
  /** 价格墙（按名义金额降序，最多 5 个） */
  readonly walls: readonly PriceWall[]
}

/** 主动买卖统计（单所单周期）。 */
export interface FlowStats {
  /** 交易所 */
  readonly venue: OrderflowVenue
  /** 交易对 */
  readonly symbol: string
  /** 周期（秒）；短窗口成交快照用实际跨度 */
  readonly windowSeconds: number
  /** 周期结束时刻（毫秒） */
  readonly timestamp: number
  /** 主动买入名义金额 */
  readonly takerBuyNotional: number
  /** 主动卖出名义金额 */
  readonly takerSellNotional: number
  /** 主动买入占比 = 买 / (买 + 卖) */
  readonly takerBuyRatio: number
  /** 净流 = 买 − 卖（计价币，正值为净流入） */
  readonly netNotional: number
  /**
   * 数据粒度。
   * - `aggregated`：交易所官方按周期聚合（Binance klines、OKX RUBIK），覆盖完整周期。
   * - `recent-trades`：用最近若干笔成交现算，只代表短窗口，不能与 aggregated 直接比较绝对值。
   */
  readonly granularity: 'aggregated' | 'recent-trades'
}

/** 大单分层的一档。 */
export interface LargeOrderBucket {
  /** 该档名义金额下限（含） */
  readonly minNotional: number
  /** 该档名义金额上限（不含）；最后一档为 null 表示无上限 */
  readonly maxNotional: number | null
  /** 该档成交额 */
  readonly notional: number
  /** 占全样本成交额的比例 */
  readonly share: number
  /** 该档内的主动买入占比 */
  readonly takerBuyRatio: number
}

/**
 * 大单分层结果。
 *
 * 窗口是**最近若干笔成交**，不是完整周期——Binance 的 aggTrades 单次最多 1000 笔，
 * BTC 永续约 3 分钟就消耗完。因此这里的占比反映的是「眼下这几分钟谁在成交」，
 * 不能当成小时级统计。
 */
export interface LargeOrderProfile {
  /** 交易所 */
  readonly venue: OrderflowVenue
  /** 交易对 */
  readonly symbol: string
  /** 采集时刻（毫秒） */
  readonly timestamp: number
  /** 实际覆盖的成交笔数 */
  readonly trades: number
  /** 实际覆盖的时间跨度（毫秒） */
  readonly spanMs: number
  /** 分档明细，按金额升序 */
  readonly buckets: readonly LargeOrderBucket[]
  /** 全样本主动买入占比 */
  readonly takerBuyRatio: number
}

/** 持仓结构（单所某一时刻）。 */
export interface PositioningStats {
  /** 交易所 */
  readonly venue: OrderflowVenue
  /** 交易对 */
  readonly symbol: string
  /** 采集时刻（毫秒） */
  readonly timestamp: number
  /** 未平仓名义金额（计价币） */
  readonly openInterestNotional: number
  /** 未平仓数量（基础币） */
  readonly openInterestBase: number
  /**
   * 全局账户多空比（账户数口径，>1 表示多头账户更多）。
   *
   * **与 `topPositionRatio` 是两件事**：阶段 0 实测二者方向可以相反
   * （散户账户偏多时未来略跌、大户持仓偏多时未来略涨），合并成一个「多空比」
   * 会让信号互相抵消。面板必须分开显示。
   */
  readonly accountRatio: number | null
  /** 大户持仓多空比（持仓量口径）；无此数据的交易所为 null */
  readonly topPositionRatio: number | null
}

/**
 * 一个交易所的采集结果。
 *
 * 各类数据互相独立：某一家深度可取但持仓接口失败时，深度仍然有效。
 * 因此每类各自可空，不做「一个失败全失败」的耦合。
 */
export interface VenueSnapshot {
  /** 交易所 */
  readonly venue: OrderflowVenue
  /** 交易对 */
  readonly symbol: string
  /** 深度；失败为 null */
  readonly depth: DepthSnapshot | null
  /** 多周期主动买卖；失败为空数组 */
  readonly flows: readonly FlowStats[]
  /** 大单分层；只有支持逐笔成交流的交易所才有 */
  readonly largeOrders: LargeOrderProfile | null
  /** 持仓结构；失败为 null */
  readonly positioning: PositioningStats | null
  /** 本次采集的错误说明（按类别），成功为空数组 */
  readonly errors: readonly {
    readonly kind: 'depth' | 'flow' | 'large-orders' | 'positioning'
    readonly message: string
  }[]
}

/** 矛盾类型。面板的核心价值是**指出互相打架的证据**，而不是给结论。 */
export type ContradictionKind =
  /** 全深度与近端失衡方向相反：买单挂在远处 */
  | 'depth-divergence'
  /** 账户数多空比与大户持仓多空比方向相反：两类钱的立场不同 */
  | 'ratio-split'
  /** 净流方向与持仓量变化方向不一致：有成交但没开新仓 */
  | 'flow-vs-open-interest'
  /** 各交易所净流方向不一致：局部行为而非全市场 */
  | 'venue-flow-split'
  /** 大单档的主动方向与全样本相反：机构在反着做 */
  | 'large-order-split'

/** 一条矛盾。 */
export interface Contradiction {
  /** 类型 */
  readonly kind: ContradictionKind
  /** 涉及的交易所 */
  readonly venues: readonly OrderflowVenue[]
  /** 一句话说明，面向人读 */
  readonly detail: string
}

/** 跨所合计。 */
export interface PanelTotals {
  /** 未平仓数量合计（基础币） */
  readonly openInterestBase: number
  /** 未平仓名义金额合计（计价币） */
  readonly openInterestNotional: number
  /** 1 小时净流合计（计价币，正值为净流入） */
  readonly netFlow1h: number
  /** 1 小时主动买入占比（按金额加权）；无数据为 null */
  readonly takerBuyRatio1h: number | null
  /** ±0.5% 深度合计 */
  readonly depthHalfPercent: {
    readonly bidNotional: number
    readonly askNotional: number
    readonly imbalance: number
  }
  /** 账户数多空比均值（只统计有该口径的交易所）；无数据为 null */
  readonly accountRatioMean: number | null
  /** 大户持仓多空比均值；无数据为 null */
  readonly topPositionRatioMean: number | null
}

/** 一次面板快照。 */
export interface OrderflowPanel {
  /** 交易对 */
  readonly symbol: string
  /** 生成时刻（毫秒） */
  readonly timestamp: number
  /** 各所明细 */
  readonly venues: readonly VenueSnapshot[]
  /** 跨所合计 */
  readonly totals: PanelTotals
  /** 检出的矛盾，按严重程度排序 */
  readonly contradictions: readonly Contradiction[]
}

/**
 * 落盘记录：深度。
 *
 * 只存聚合后的快照，不存原始档位——Binance 一次 5000 档约 200 KB，
 * 存原始数据一天就要几十 GB，而面板与后续研究用到的都是区间金额与失衡度。
 */
export interface DepthRecord extends DepthSnapshot {
  /** 记录结构版本 */
  readonly schemaVersion: 1
}

/** 落盘记录：成交。 */
export interface FlowRecord extends FlowStats {
  /** 记录结构版本 */
  readonly schemaVersion: 1
}

/** 落盘记录：持仓。 */
export interface PositioningRecord extends PositioningStats {
  /** 记录结构版本 */
  readonly schemaVersion: 1
}

/** 落盘记录：钟级大单分层。 */
export interface LargeOrderRecord extends LargeOrderProfile {
  /** 记录结构版本 */
  readonly schemaVersion: 1
  /** 所属小时桶的起始时刻（毫秒，整点） */
  readonly hourStart: number
}
