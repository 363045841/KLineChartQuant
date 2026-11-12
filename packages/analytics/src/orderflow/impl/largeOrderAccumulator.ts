/**
 * 钟级大单分层：把逐笔成交按小时桶累加，整点封存。
 *
 * 为什么必须这样：Binance 的 aggTrades 单次最多 1000 笔，BTC 永续大约 25 秒就填满。
 * 想得到「1 小时里 $100K–$500K 占多少」这样的结论，只有两条路——
 * 要么持续收集并累加，要么买第三方聚合数据。这里走第一条。
 *
 * 增量口径分两种情况，必须如实标注（`coverage`）：
 * - `exact`：交易所支持按成交 ID 续拉（Binance 的 `fromId`），不漏笔。
 * - `sampled`：只能反复拉「最近 N 笔」并按 ID 去重（Bybit / Bitget / Hyperliquid），
 *   两次拉取之间若超过 N 笔就会漏。漏多少无法事后追溯，因此不能与 exact 混为一谈。
 *
 * 累加器本身是纯函数：给定「上一小时桶 + 新到成交」，返回新桶。状态如何持久化
 * 交给调用方，方便单测与重放。
 */
import { type LargeOrderBucket, type OrderflowVenue } from '../types'

/** 大单分档边界（计价币），与文章口径一致。 */
const LARGE_ORDER_EDGES = [0, 10_000, 100_000, 500_000] as const

/** 一小时的毫秒数。 */
export const HOUR_MS = 3_600_000

/** 增量覆盖口径。 */
export type TradeCoverage = 'exact' | 'sampled'

/** 一笔已归集的成交。 */
export interface AccumulatedTrade {
  /** 成交名义金额 */
  readonly notional: number
  /** 是否主动买 */
  readonly takerBuy: boolean
  /** 成交时刻（毫秒） */
  readonly time: number
}

/** 累加中的小时桶。 */
export interface HourAccumulator {
  /** 交易所 */
  readonly venue: OrderflowVenue
  /** 交易对 */
  readonly symbol: string
  /** 本小时的起始时刻（整点毫秒） */
  readonly hourStart: number
  /** 覆盖口径 */
  readonly coverage: TradeCoverage
  /** 累计笔数 */
  readonly trades: number
  /** 各档累计金额，顺序与 `LARGE_ORDER_EDGES` 对应 */
  readonly bucketNotional: readonly number[]
  /** 各档累计主动买入金额 */
  readonly bucketBuy: readonly number[]
  /** 全样本累计金额 */
  readonly totalNotional: number
  /** 全样本累计主动买入金额 */
  readonly totalBuy: number
}

/**
 * 把时刻对齐到所在小时的整点。
 *
 * @param timestamp 毫秒时间戳
 * @returns 整点毫秒
 */
export function hourStartOf(timestamp: number): number {
  return Math.floor(timestamp / HOUR_MS) * HOUR_MS
}

/**
 * 新建一个空的小时桶。
 *
 * @param venue 交易所
 * @param symbol 交易对
 * @param hourStart 整点毫秒
 * @param coverage 覆盖口径
 * @returns 空桶
 */
export function createAccumulator(
  venue: OrderflowVenue,
  symbol: string,
  hourStart: number,
  coverage: TradeCoverage,
): HourAccumulator {
  return {
    venue,
    symbol,
    hourStart,
    coverage,
    trades: 0,
    bucketNotional: LARGE_ORDER_EDGES.map(() => 0),
    bucketBuy: LARGE_ORDER_EDGES.map(() => 0),
    totalNotional: 0,
    totalBuy: 0,
  }
}

/**
 * 判断一笔成交落在哪一档。
 *
 * @param notional 名义金额
 * @returns 档位下标
 */
function bucketIndexOf(notional: number): number {
  let index = 0
  for (let cursor = 0; cursor < LARGE_ORDER_EDGES.length; cursor += 1) {
    if (notional >= LARGE_ORDER_EDGES[cursor]) index = cursor
  }
  return index
}

/**
 * 把一批成交并入小时桶。
 *
 * 只接受落在该小时内的成交：跨小时的成交由调用方先封存再新建，
 * 避免把两小时的成交混进同一个桶。
 *
 * @param accumulator 原桶
 * @param trades 新成交
 * @returns 新桶（不修改入参）
 * @throws RangeError 成交时间不在该小小时内
 */
export function addTrades(
  accumulator: HourAccumulator,
  trades: readonly AccumulatedTrade[],
): HourAccumulator {
  const bucketNotional = [...accumulator.bucketNotional]
  const bucketBuy = [...accumulator.bucketBuy]
  let totalNotional = accumulator.totalNotional
  let totalBuy = accumulator.totalBuy
  let count = accumulator.trades

  for (const trade of trades) {
    if (hourStartOf(trade.time) !== accumulator.hourStart) {
      throw new RangeError(
        `${accumulator.venue} 成交时刻 ${trade.time} 不属于小时桶 ${accumulator.hourStart}`,
      )
    }
    if (!Number.isFinite(trade.notional) || trade.notional <= 0) continue
    const index = bucketIndexOf(trade.notional)
    bucketNotional[index] += trade.notional
    if (trade.takerBuy) bucketBuy[index] += trade.notional
    totalNotional += trade.notional
    if (trade.takerBuy) totalBuy += trade.notional
    count += 1
  }

  return {
    ...accumulator,
    trades: count,
    bucketNotional,
    bucketBuy,
    totalNotional,
    totalBuy,
  }
}

/**
 * 判断小时桶是否该封存。
 *
 * @param accumulator 当前桶
 * @param now 当前时刻
 * @returns 已经跨过整点时为 true
 */
export function shouldSeal(accumulator: HourAccumulator, now: number): boolean {
  return hourStartOf(now) > accumulator.hourStart
}

/**
 * 把小时桶转成分档结果。
 *
 * @param accumulator 小时桶
 * @returns 分档明细与整体主动买占比
 */
export function sealAccumulator(accumulator: HourAccumulator): {
  readonly buckets: readonly LargeOrderBucket[]
  readonly takerBuyRatio: number
} {
  const buckets: LargeOrderBucket[] = LARGE_ORDER_EDGES.map((min, index) => {
    const max = index + 1 < LARGE_ORDER_EDGES.length ? LARGE_ORDER_EDGES[index + 1] : null
    const notional = accumulator.bucketNotional[index]
    const buy = accumulator.bucketBuy[index]
    return {
      minNotional: min,
      maxNotional: max,
      notional,
      share: accumulator.totalNotional > 0 ? notional / accumulator.totalNotional : 0,
      takerBuyRatio: notional > 0 ? buy / notional : 0.5,
    }
  })
  return {
    buckets,
    takerBuyRatio:
      accumulator.totalNotional > 0 ? accumulator.totalBuy / accumulator.totalNotional : 0.5,
  }
}
