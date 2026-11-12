/**
 * 深度聚合单元测试。
 *
 * 重点覆盖三件容易出错、且出错后不会报错只会算错的事：
 * 1. 区间统计的「覆盖完整」判定——覆盖不足时数字偏小，必须标记出来；
 * 2. 近端与全深度的失衡方向可能相反，这是文章判据的核心；
 * 3. 价格墙用相对阈值，不能因为绝对金额小就不算墙。
 */
import { describe, expect, it } from 'vitest'
import { buildDepthSnapshot, detectDepthDivergence, imbalanceAt } from '../orderflow/impl/depth'
import type { DepthLevel } from '../orderflow/types'

/**
 * 构造档位。
 *
 * @param price 价格
 * @param size 数量（基础币）
 * @returns 档位
 */
function level(price: number, size: number): DepthLevel {
  return { price, size, notional: price * size }
}

/**
 * 构造一组合乎现实中价 100 的盘口。
 *
 * @param bidSizes 买盘每档数量（价格 99.9、99.8…）
 * @param askSizes 卖盘每档数量（价格 100.1、100.2…）
 * @returns 买盘与卖盘
 */
function book(
  bidSizes: readonly number[],
  askSizes: readonly number[],
): {
  bids: DepthLevel[]
  asks: DepthLevel[]
} {
  return {
    bids: bidSizes.map((size, index) => level(100 - (index + 1) * 0.1, size)),
    asks: askSizes.map((size, index) => level(100 + (index + 1) * 0.1, size)),
  }
}

describe('buildDepthSnapshot', () => {
  it('计算中间价、价差与档数', () => {
    const { bids, asks } = book([1, 1, 1], [1, 1, 1])
    const snapshot = buildDepthSnapshot({
      venue: 'binance',
      symbol: 'BTCUSDT',
      timestamp: 1_700_000_000_000,
      bids,
      asks,
    })
    expect(snapshot.midPrice).toBeCloseTo(100, 10)
    expect(snapshot.bestBid).toBeCloseTo(99.9, 10)
    expect(snapshot.bestAsk).toBeCloseTo(100.1, 10)
    expect(snapshot.spreadRatio).toBeCloseTo(0.2 / 100, 10)
    expect(snapshot.bidLevels).toBe(3)
    expect(snapshot.askLevels).toBe(3)
  })

  it('买盘更厚时失衡为正，卖盘更厚时为负', () => {
    const heavyBid = buildDepthSnapshot({
      venue: 'binance',
      symbol: 'BTCUSDT',
      timestamp: 1,
      ...book([10, 10, 10], [1, 1, 1]),
    })
    expect(heavyBid.nearImbalance).toBeGreaterThan(0.8)

    const heavyAsk = buildDepthSnapshot({
      venue: 'binance',
      symbol: 'BTCUSDT',
      timestamp: 1,
      ...book([1, 1, 1], [10, 10, 10]),
    })
    expect(heavyAsk.nearImbalance).toBeLessThan(-0.8)
  })

  it('档位没有越过区间边界时标记 complete=false', () => {
    // 三档都在 ±0.5% 内：买 99.9/99.8/99.7，卖 100.1/100.2/100.3
    const { bids, asks } = book([1, 1, 1], [1, 1, 1])
    const snapshot = buildDepthSnapshot({
      venue: 'bybit',
      symbol: 'BTCUSDT',
      timestamp: 1,
      bids,
      asks,
    })
    const narrow = snapshot.bands.find((item) => item.band === 0.5)
    expect(narrow?.complete).toBe(false)
  })

  it('档位越过区间边界后标记 complete=true，且区间外金额不计入', () => {
    // 中价 100，±0.5% 即 [99.5, 100.5]；99.4 与 95 都在区间外
    const bids = [level(99.9, 1), level(99.4, 1), level(95, 100)]
    const asks = [level(100.1, 1), level(100.6, 1), level(105, 100)]
    const snapshot = buildDepthSnapshot({
      venue: 'binance',
      symbol: 'BTCUSDT',
      timestamp: 1,
      bids,
      asks,
    })
    const narrow = snapshot.bands.find((item) => item.band === 0.5)
    expect(narrow?.complete).toBe(true)
    // 区间内只有第一档（99.9 × 1 = 99.9），99.4 与 95 都在 ±0.5% 之外
    expect(narrow?.bidNotional).toBeCloseTo(99.9, 6)
  })

  it('价格墙按本侧中位数倍数判定，不用绝对金额', () => {
    // 中位数 1（两档各 1），墙 100 超过中位数 8 倍
    const bids = [level(99.9, 1), level(99.8, 1), level(99.7, 100), level(99.6, 1)]
    const asks = [level(100.1, 1), level(100.2, 1), level(100.3, 1)]
    const snapshot = buildDepthSnapshot({
      venue: 'bitget',
      symbol: 'BTCUSDT',
      timestamp: 1,
      bids,
      asks,
    })
    expect(snapshot.walls.length).toBe(1)
    expect(snapshot.walls[0].side).toBe('bid')
    expect(snapshot.walls[0].price).toBeCloseTo(99.7, 10)
    expect(snapshot.walls[0].distancePct).toBeLessThan(0)
  })

  it('中小所的墙只要能超过自身分布就被识别', () => {
    // 全部档位都只有 2 倍，不该出现墙
    const quiet = buildDepthSnapshot({
      venue: 'bitget',
      symbol: 'BTCUSDT',
      timestamp: 1,
      ...book([1, 1, 2, 1, 1, 1, 1, 1, 1, 1], [1, 1, 1, 1, 1, 1, 1, 1, 1, 1]),
    })
    expect(quiet.walls.length).toBe(0)

    // 同样的绝对金额，一档达到 8 倍中位数就该是墙
    const loud = buildDepthSnapshot({
      venue: 'bitget',
      symbol: 'BTCUSDT',
      timestamp: 1,
      ...book([1, 1, 1, 1, 1, 1, 1, 1, 1, 40], [1, 1, 1, 1, 1, 1, 1, 1, 1, 1]),
    })
    expect(loud.walls.length).toBe(1)
  })

  it('买盘或卖盘为空时抛出明确错误', () => {
    expect(() =>
      buildDepthSnapshot({
        venue: 'binance',
        symbol: 'BTCUSDT',
        timestamp: 1,
        bids: [],
        asks: [level(101, 1)],
      }),
    ).toThrowError(/深度为空/)
  })
})

describe('detectDepthDivergence', () => {
  it('全深度买盘厚、近端卖盘厚时识别为「买单挂远处」', () => {
    // 远处挂大买单（价 98 那一档金额极大），近端 10 档卖盘更厚
    const bids = [
      level(99.9, 1),
      level(99.8, 1),
      level(99.7, 1),
      // 远处厚买盘：位于 ±2% 内但在近端 10 档之外
      ...Array.from({ length: 10 }, (_, index) => level(99.0 - index * 0.1, 1)),
      level(98.0, 500),
    ]
    const asks = Array.from({ length: 12 }, (_, index) => level(100.1 + index * 0.1, 5))
    const snapshot = buildDepthSnapshot({
      venue: 'binance',
      symbol: 'BTCUSDT',
      timestamp: 1,
      bids,
      asks,
    })
    expect(imbalanceAt(snapshot, 2)).toBeGreaterThan(0)
    expect(snapshot.nearImbalance).toBeLessThan(0)
    expect(detectDepthDivergence(snapshot, 2)).toBe('bid-far-ask-near')
  })

  it('同向时不算背离', () => {
    const snapshot = buildDepthSnapshot({
      venue: 'binance',
      symbol: 'BTCUSDT',
      timestamp: 1,
      ...book([10, 10, 10], [1, 1, 1]),
    })
    expect(detectDepthDivergence(snapshot, 2)).toBeNull()
  })

  it('两侧完全平衡时不算背离', () => {
    const snapshot = buildDepthSnapshot({
      venue: 'binance',
      symbol: 'BTCUSDT',
      timestamp: 1,
      ...book([2, 2, 2], [2, 2, 2]),
    })
    // 买卖档位价格天然不对称（买在下、卖在上），金额会有约千分之二的差异；
    // 这里验证它足够小，不构成背离
    expect(Math.abs(snapshot.nearImbalance)).toBeLessThan(0.01)
    expect(detectDepthDivergence(snapshot, 2)).toBeNull()
  })
})
