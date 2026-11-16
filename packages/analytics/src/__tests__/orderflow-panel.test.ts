/**
 * 面板装配与矛盾识别的单元测试。
 *
 * 重点覆盖三类「算错也不报错」的逻辑：
 * 1. 大单分档的边界归属（$10K 到底进哪一档）；
 * 2. 跨所合计的加权方式（主动买占比必须按金额加权，不能简单平均）；
 * 3. 矛盾检出的方向判定（账户数比与大户持仓比符号相反才算矛盾）。
 */
import { describe, expect, it } from 'vitest'
import { buildLargeOrderProfile } from '../orderflow/impl/flowVenues'
import { buildTotals, detectContradictions } from '../orderflow/impl/panel'
import type {
  DepthSnapshot,
  FlowStats,
  OrderflowVenue,
  PositioningStats,
  VenueSnapshot,
} from '../orderflow/types'

/**
 * 构造一笔成交。
 *
 * @param notional 名义金额
 * @param takerBuy 是否主动买
 * @param time 时刻
 * @returns 成交
 */
function trade(
  notional: number,
  takerBuy: boolean,
  time: number,
): {
  notional: number
  takerBuy: boolean
  time: number
} {
  return { notional, takerBuy, time }
}

/**
 * 构造一个深度快照（只填矛盾判定用得到的字段）。
 *
 * @param venue 交易所
 * @param bandImbalance 区间失衡
 * @param nearImbalance 近端失衡
 * @returns 深度快照
 */
function depthOf(
  venue: OrderflowVenue,
  bandImbalance: number,
  nearImbalance: number,
): DepthSnapshot {
  const bid = (1 + bandImbalance) * 1_000_000
  const ask = (1 - bandImbalance) * 1_000_000
  return {
    venue,
    symbol: 'BTCUSDT',
    timestamp: 1,
    midPrice: 70_000,
    bestBid: 69_999,
    bestAsk: 70_001,
    spreadRatio: 0.00002,
    bidLevels: 100,
    askLevels: 100,
    bidCoveragePct: 0.2,
    askCoveragePct: 0.2,
    bands: [
      {
        band: 0.5,
        bidNotional: bid,
        askNotional: ask,
        imbalance: bandImbalance,
        complete: false,
      },
    ],
    nearImbalance,
    nearBidNotional: 0,
    nearAskNotional: 0,
    walls: [],
  }
}

/**
 * 构造一个 1 小时成交统计。
 *
 * @param venue 交易所
 * @param net 净流
 * @param coverageSeconds 实际覆盖秒数，缺省为完整小时
 * @returns 统计
 */
function hourFlow(venue: OrderflowVenue, net: number, coverageSeconds = 3600): FlowStats {
  const buy = net > 0 ? 1_000_000 + net / 2 : 1_000_000 + net / 2
  const sell = buy - net
  return {
    venue,
    symbol: 'BTCUSDT',
    windowSeconds: 3600,
    timestamp: 1,
    takerBuyNotional: buy,
    takerSellNotional: sell,
    takerBuyRatio: buy / (buy + sell),
    netNotional: net,
    coverageSeconds,
    granularity: 'aggregated',
  }
}

/**
 * 构造一个持仓结构。
 *
 * @param venue 交易所
 * @param accountRatio 账户数多空比
 * @param topPositionRatio 大户持仓多空比
 * @returns 持仓结构
 */
function positioningOf(
  venue: OrderflowVenue,
  accountRatio: number | null,
  topPositionRatio: number | null,
): PositioningStats {
  return {
    venue,
    symbol: 'BTCUSDT',
    timestamp: 1,
    openInterestBase: 1000,
    openInterestNotional: 70_000_000,
    accountRatio,
    topPositionRatio,
  }
}

/**
 * 构造一个空的单所快照。
 *
 * @param venue 交易所
 * @returns 快照
 */
function emptyVenue(venue: OrderflowVenue): VenueSnapshot {
  return {
    venue,
    symbol: 'BTCUSDT',
    depth: null,
    flows: [],
    cvd: [],
    largeOrders: null,
    positioning: null,
    errors: [],
  }
}

describe('buildLargeOrderProfile', () => {
  it('按名义金额分档，边界值归入上界档', () => {
    const profile = buildLargeOrderProfile(
      [
        trade(5_000, true, 0), // <$10K
        trade(10_000, true, 0), // 边界：进 $10K–$100K
        trade(99_999, false, 0), // $10K–$100K
        trade(100_000, false, 0), // 边界：进 $100K–$500K
        trade(500_000, true, 0), // ≥$500K
      ],
      'binance',
      'BTCUSDT',
      1,
      1000,
    )
    expect(profile.buckets[0].notional).toBe(5_000)
    expect(profile.buckets[1].notional).toBe(10_000 + 99_999)
    expect(profile.buckets[2].notional).toBe(100_000)
    expect(profile.buckets[3].notional).toBe(500_000)
  })

  it('份额按成交额加权，不是按笔数', () => {
    const profile = buildLargeOrderProfile(
      [trade(1_000, true, 0), trade(9_000, true, 0), trade(990_000, false, 0)],
      'binance',
      'BTCUSDT',
      1,
      1000,
    )
    // 三笔里两笔小额，但金额只占 1%
    expect(profile.buckets[0].share).toBeCloseTo(10_000 / 1_000_000, 10)
    expect(profile.buckets[3].share).toBeCloseTo(990_000 / 1_000_000, 10)
  })

  it('空档的主动买占比记为 0.5（占位），不产生 NaN', () => {
    const profile = buildLargeOrderProfile([trade(1_000, true, 0)], 'binance', 'BTCUSDT', 1, 1000)
    expect(profile.buckets[3].notional).toBe(0)
    expect(profile.buckets[3].takerBuyRatio).toBe(0.5)
  })
})

describe('buildTotals', () => {
  it('主动买占比按金额加权，不是各所比例的平均', () => {
    const venues: VenueSnapshot[] = [
      {
        ...emptyVenue('binance'),
        flows: [hourFlow('binance', 900_000)],
      },
      {
        ...emptyVenue('okx'),
        flows: [hourFlow('okx', -900_000)],
      },
    ]
    const totals = buildTotals(venues)
    // 两所净流相互抵消，加权后应接近 50%，而不是 (95% + 5%) / 2 之外的其它值
    expect(totals.takerBuyRatio1h).toBeCloseTo(0.5, 2)
    expect(totals.netFlow1h).toBeCloseTo(0, 6)
  })

  it('覆盖不足 1 小时的样本不进跨所合计', () => {
    const venues: VenueSnapshot[] = [
      { ...emptyVenue('binance'), flows: [hourFlow('binance', 900_000)] },
      // bybit 只覆盖了 20 分钟：净流再大也不能算进「1 小时合计」
      { ...emptyVenue('bybit'), flows: [hourFlow('bybit', -5_000_000, 1200)] },
    ]
    const totals = buildTotals(venues)
    expect(totals.netFlow1h).toBeCloseTo(900_000, 6)
    // 只剩 binance 一家：买 145 万 / 总 200 万
    expect(totals.takerBuyRatio1h).toBeCloseTo(0.725, 6)
  })

  it('OI 与深度各自累加', () => {
    const venues: VenueSnapshot[] = [
      { ...emptyVenue('binance'), positioning: positioningOf('binance', 2, 2) },
      { ...emptyVenue('okx'), positioning: positioningOf('okx', 3, null) },
    ]
    const totals = buildTotals(venues)
    expect(totals.openInterestBase).toBe(2000)
    expect(totals.openInterestNotional).toBe(140_000_000)
    // 账户比只对有两家的取均值；大户口径只有一家
    expect(totals.accountRatioMean).toBeCloseTo(2.5, 10)
    expect(totals.topPositionRatioMean).toBeCloseTo(2, 10)
  })

  it('无数据时返回 null 而不是 0', () => {
    const totals = buildTotals([emptyVenue('binance')])
    expect(totals.takerBuyRatio1h).toBeNull()
    expect(totals.accountRatioMean).toBeNull()
    expect(totals.topPositionRatioMean).toBeNull()
  })
})

describe('detectContradictions', () => {
  it('区间与近端方向相反时检出深度背离', () => {
    const venues: VenueSnapshot[] = [
      { ...emptyVenue('binance'), depth: depthOf('binance', 0.2, -0.4) },
    ]
    const contradictions = detectContradictions(venues, buildTotals(venues))
    expect(contradictions.map((item) => item.kind)).toContain('depth-divergence')
  })

  it('同向时不报背离', () => {
    const venues: VenueSnapshot[] = [
      { ...emptyVenue('binance'), depth: depthOf('binance', 0.2, 0.3) },
    ]
    const contradictions = detectContradictions(venues, buildTotals(venues))
    expect(contradictions.map((item) => item.kind)).not.toContain('depth-divergence')
  })

  it('账户数比与大户持仓比方向相反时检出 ratio-split', () => {
    const venues: VenueSnapshot[] = [
      { ...emptyVenue('binance'), positioning: positioningOf('binance', 2.75, 0.8) },
    ]
    const contradictions = detectContradictions(venues, buildTotals(venues))
    expect(contradictions.map((item) => item.kind)).toContain('ratio-split')
  })

  it('两类多空比同向时不报 ratio-split', () => {
    const venues: VenueSnapshot[] = [
      { ...emptyVenue('binance'), positioning: positioningOf('binance', 2.75, 2.2) },
    ]
    const contradictions = detectContradictions(venues, buildTotals(venues))
    expect(contradictions.map((item) => item.kind)).not.toContain('ratio-split')
  })

  it('各所净流方向不一致时检出 venue-flow-split', () => {
    const venues: VenueSnapshot[] = [
      { ...emptyVenue('binance'), flows: [hourFlow('binance', 50_000_000)] },
      { ...emptyVenue('okx'), flows: [hourFlow('okx', -20_000_000)] },
    ]
    const contradictions = detectContradictions(venues, buildTotals(venues))
    expect(contradictions.map((item) => item.kind)).toContain('venue-flow-split')
  })

  it('只有一家有 1h 数据时不判 venue-flow-split', () => {
    const venues: VenueSnapshot[] = [
      { ...emptyVenue('binance'), flows: [hourFlow('binance', 50_000_000)] },
      emptyVenue('okx'),
    ]
    const contradictions = detectContradictions(venues, buildTotals(venues))
    expect(contradictions.map((item) => item.kind)).not.toContain('venue-flow-split')
  })
})
