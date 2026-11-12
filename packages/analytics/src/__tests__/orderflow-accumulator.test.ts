/**
 * 钟级大单累加器单元测试。
 *
 * 这里最贵的错误是「跨小时混桶」和「份额算错」——两者都不会报错，
 * 只会让面板上的「1 小时成交构成」悄悄失真。
 */
import { describe, expect, it } from 'vitest'
import {
  type AccumulatedTrade,
  addTrades,
  closedMinutesOf,
  createAccumulator,
  HOUR_MS,
  type HourAccumulator,
  hourStartOf,
  sealAccumulator,
  shouldSeal,
  withoutMinutes,
} from '../orderflow/impl/largeOrderAccumulator'

/**
 * 构造一笔成交。
 *
 * @param notional 名义金额
 * @param takerBuy 是否主动买
 * @param time 成交时刻
 * @returns 成交
 */
function trade(notional: number, takerBuy: boolean, time: number): AccumulatedTrade {
  return { notional, takerBuy, time }
}

/** 一个整点时刻（由常量取整得到，避免手写数字不是整点导致 addTrades 报错）。 */
const HOUR = Math.floor(1_794_410_400_000 / HOUR_MS) * HOUR_MS

describe('hourStartOf', () => {
  it('对齐到整点', () => {
    expect(hourStartOf(HOUR + 1)).toBe(HOUR)
    expect(hourStartOf(HOUR + HOUR_MS - 1)).toBe(HOUR)
    expect(hourStartOf(HOUR + HOUR_MS)).toBe(HOUR + HOUR_MS)
  })
})

describe('addTrades', () => {
  it('按金额分档累加', () => {
    const base = createAccumulator('binance', 'BTCUSDT', HOUR, 'exact')
    const next = addTrades(base, [
      trade(5_000, true, HOUR + 1), // <$10K
      trade(10_000, false, HOUR + 2), // $10K–$100K（边界进上界档）
      trade(100_000, true, HOUR + 3), // $100K–$500K
      trade(500_000, false, HOUR + 4), // ≥$500K
    ])
    expect(next.bucketNotional).toEqual([5_000, 10_000, 100_000, 500_000])
    expect(next.bucketBuy).toEqual([5_000, 0, 100_000, 0])
    expect(next.totalNotional).toBe(615_000)
    expect(next.totalBuy).toBe(105_000)
    expect(next.trades).toBe(4)
  })

  it('不修改入参', () => {
    const base = createAccumulator('binance', 'BTCUSDT', HOUR, 'exact')
    addTrades(base, [trade(1_000, true, HOUR + 1)])
    expect(base.trades).toBe(0)
    expect(base.totalNotional).toBe(0)
  })

  it('成交落在别的整点时报错', () => {
    const base = createAccumulator('binance', 'BTCUSDT', HOUR, 'exact')
    expect(() => addTrades(base, [trade(1_000, true, HOUR + HOUR_MS)])).toThrowError(/不属于小时桶/)
  })

  it('忽略非正金额', () => {
    const base = createAccumulator('binance', 'BTCUSDT', HOUR, 'exact')
    const next = addTrades(base, [trade(0, true, HOUR + 1), trade(-5, true, HOUR + 2)])
    expect(next.trades).toBe(0)
    expect(next.totalNotional).toBe(0)
  })
})

describe('shouldSeal', () => {
  it('同一小时内不封存', () => {
    const base = createAccumulator('binance', 'BTCUSDT', HOUR, 'exact')
    expect(shouldSeal(base, HOUR + HOUR_MS - 1)).toBe(false)
  })

  it('跨过整点后封存', () => {
    const base = createAccumulator('binance', 'BTCUSDT', HOUR, 'exact')
    expect(shouldSeal(base, HOUR + HOUR_MS)).toBe(true)
  })
})

describe('sealAccumulator', () => {
  it('份额按成交额加权，合计为 1', () => {
    const base: HourAccumulator = addTrades(
      createAccumulator('binance', 'BTCUSDT', HOUR, 'exact'),
      [trade(1_000, true, HOUR + 1), trade(999_000, false, HOUR + 2)],
    )
    const { buckets, takerBuyRatio } = sealAccumulator(base)
    const sum = buckets.reduce((total, bucket) => total + bucket.share, 0)
    expect(sum).toBeCloseTo(1, 10)
    expect(buckets[0].share).toBeCloseTo(0.001, 10)
    expect(buckets[3].share).toBeCloseTo(0.999, 10)
    expect(takerBuyRatio).toBeCloseTo(0.001, 10)
  })

  it('空档的主动买占比记为 0.5，不产生 NaN', () => {
    const base = createAccumulator('binance', 'BTCUSDT', HOUR, 'exact')
    const { buckets, takerBuyRatio } = sealAccumulator(base)
    expect(buckets.every((bucket) => bucket.notional === 0)).toBe(true)
    expect(buckets.every((bucket) => bucket.takerBuyRatio === 0.5)).toBe(true)
    expect(takerBuyRatio).toBe(0.5)
  })

  it('分档边界与契约一致', () => {
    const base = createAccumulator('binance', 'BTCUSDT', HOUR, 'exact')
    const { buckets } = sealAccumulator(base)
    expect(buckets.map((bucket) => bucket.minNotional)).toEqual([0, 10_000, 100_000, 500_000])
    expect(buckets.map((bucket) => bucket.maxNotional)).toEqual([10_000, 100_000, 500_000, null])
  })
})

describe('分钟格', () => {
  it('按分钟累计主动买卖，跨分钟分格', () => {
    const base = createAccumulator('bybit', 'BTCUSDT', HOUR, 'sampled')
    const next = addTrades(base, [
      trade(1_000, true, HOUR + 5_000),
      trade(2_000, false, HOUR + 10_000),
      trade(3_000, true, HOUR + 65_000),
    ])
    expect(next.minutes).toEqual([
      { minuteStart: HOUR, buy: 1_000, sell: 2_000, trades: 2 },
      { minuteStart: HOUR + 60_000, buy: 3_000, sell: 0, trades: 1 },
    ])
  })

  it('只返回已经结束的分钟', () => {
    const base = createAccumulator('bybit', 'BTCUSDT', HOUR, 'sampled')
    const next = addTrades(base, [
      trade(1_000, true, HOUR + 5_000),
      trade(1_000, true, HOUR + 65_000),
    ])
    // 当前处在第二分钟中途：第一分钟已结束，第二分钟还在进行
    expect(closedMinutesOf(next, HOUR + 70_000).map((minute) => minute.minuteStart)).toEqual([HOUR])
  })

  it('落盘后剔除已写分钟，小时累计不受影响', () => {
    const base = createAccumulator('bybit', 'BTCUSDT', HOUR, 'sampled')
    const next = addTrades(base, [trade(1_000, true, HOUR + 5_000)])
    const trimmed = withoutMinutes(next, closedMinutesOf(next, HOUR + 120_000))
    expect(trimmed.minutes).toEqual([])
    expect(trimmed.totalNotional).toBe(1_000)
  })
})
