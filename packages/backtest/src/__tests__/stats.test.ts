/**
 * 绩效指标与基准单元测试。
 */
import { describe, expect, it } from 'vitest'
import { computeBuyHold, computeRandomBenchmark, computeStats, groupByGrade } from '../impl/stats'
import { createStopResolver } from '../impl/stop'
import type { IchimokuSeries } from '../types'
import { BASE_TIME, EMPTY_STATS, HOUR_MS, makeCandle, makeConfig, makeTrade } from './testUtils'

describe('computeStats', () => {
  it('期望值、PF、胜率与最大回撤', () => {
    const trades = [
      makeTrade({ id: 1, rMultiple: 2, entryTime: BASE_TIME }),
      makeTrade({ id: 2, rMultiple: -1, entryTime: BASE_TIME + HOUR_MS }),
      makeTrade({ id: 3, rMultiple: 2, entryTime: BASE_TIME + 2 * HOUR_MS }),
      makeTrade({ id: 4, rMultiple: -1, entryTime: BASE_TIME + 3 * HOUR_MS }),
      makeTrade({ id: 5, rMultiple: 3, entryTime: BASE_TIME + 4 * HOUR_MS }),
    ]
    const stats = computeStats(trades)

    expect(stats.trades).toBe(5)
    expect(stats.expectancyR).toBeCloseTo(1, 10)
    expect(stats.totalR).toBeCloseTo(5, 10)
    expect(stats.profitFactor).toBeCloseTo(7 / 2, 10)
    expect(stats.winRate).toBeCloseTo(3 / 5, 10)
    // 累计 R：2, 1, 3, 2, 5 → 峰值 3，第 4 笔回撤 1
    expect(stats.maxDrawdownR).toBeCloseTo(1, 10)
    expect(stats.wins).toBe(3)
    expect(stats.losses).toBe(2)
    expect(stats.avgWinR).toBeCloseTo(7 / 3, 10)
    expect(stats.avgLossR).toBeCloseTo(1, 10)
  })

  it('没有亏损时 PF 为 null', () => {
    const stats = computeStats([
      makeTrade({ id: 1, rMultiple: 2, entryTime: BASE_TIME }),
      makeTrade({ id: 2, rMultiple: 1, entryTime: BASE_TIME + HOUR_MS }),
    ])
    expect(stats.profitFactor).toBeNull()
  })

  it('空交易返回稳定空统计', () => {
    expect(computeStats([])).toEqual(EMPTY_STATS)
  })

  it('按持仓 bar 数计算均值与中位数', () => {
    const stats = computeStats([
      makeTrade({ id: 1, rMultiple: 1, entryTime: BASE_TIME, barsHeld: 1 }),
      makeTrade({ id: 2, rMultiple: 1, entryTime: BASE_TIME + HOUR_MS, barsHeld: 3 }),
      makeTrade({ id: 3, rMultiple: 1, entryTime: BASE_TIME + 2 * HOUR_MS, barsHeld: 8 }),
    ])
    expect(stats.avgBarsHeld).toBeCloseTo(4, 10)
    expect(stats.medianBarsHeld).toBe(3)
  })
})

describe('groupByGrade', () => {
  it('A/B 分组且忽略无分级交易', () => {
    const grouped = groupByGrade([
      makeTrade({ id: 1, rMultiple: 2, entryTime: BASE_TIME, grade: 'A' }),
      makeTrade({ id: 2, rMultiple: -1, entryTime: BASE_TIME + HOUR_MS, grade: 'A' }),
      makeTrade({ id: 3, rMultiple: -1, entryTime: BASE_TIME + 2 * HOUR_MS, grade: 'B' }),
      makeTrade({ id: 4, rMultiple: 2, entryTime: BASE_TIME + 3 * HOUR_MS, grade: null }),
    ])
    expect(grouped.A.trades).toBe(2)
    expect(grouped.B.trades).toBe(1)
    expect(grouped.A.expectancyR).toBeCloseTo(0.5, 10)
  })
})

describe('computeBuyHold', () => {
  it('计算总收益与年化', () => {
    const start = BASE_TIME
    const candles = [
      makeCandle(start, { open: 100, high: 100, low: 100, close: 100 }),
      makeCandle(start + HOUR_MS, { open: 200, high: 200, low: 200, close: 200 }),
    ]
    const hold = computeBuyHold('BTCUSDT', candles)
    expect(hold.startPrice).toBe(100)
    expect(hold.endPrice).toBe(200)
    expect(hold.totalReturn).toBeCloseTo(1, 10)
    // days = (最后一根收盘时刻 - 第一根开盘时刻) / 一天 = (2h - 1ms) / 24h ≈ 1/12
    expect(hold.days).toBeCloseTo(1 / 12, 2)
    expect(hold.cagr).toBeGreaterThan(1)
  })
})

describe('computeRandomBenchmark', () => {
  it('采样数与配置一致，方向比例可复现', () => {
    const length = 60
    const candles = Array.from({ length }, (_, index) =>
      makeCandle(BASE_TIME + index * HOUR_MS, {
        open: index % 2 === 0 ? 105 : 95,
        high: index % 2 === 0 ? 106 : 96,
        low: index % 2 === 0 ? 104 : 94,
        close: index % 2 === 0 ? 105 : 95,
      }),
    )
    const close = candles.map((candle) => candle.close)
    const series: IchimokuSeries = {
      length,
      close,
      // 云与 regime 直接给定：spanA/spanB 恒定 100/98，regime 差值恒正
      spanA: new Array<number | null>(length).fill(100),
      spanB: new Array<number | null>(length).fill(98),
      tenkan: new Array<number | null>(length).fill(100),
      kijun: new Array<number | null>(length).fill(100),
      atr: new Array<number | null>(length).fill(1),
      regimeDiff: new Array<number | null>(length).fill(5),
    }
    const config = makeConfig({ randomSamples: 20, seed: 7 })
    const stopResolver = createStopResolver(candles, config.stopSource, config.pivotLookback)
    const benchmark = computeRandomBenchmark({
      symbol: 'BTCUSDT',
      candles,
      series,
      signalDirections: new Array(length).fill(null),
      longRatio: 0.5,
      stopResolver,
      biasSeries: null,
      config,
    })
    expect(benchmark.samples).toBe(20)
    expect(benchmark.stats.trades).toBe(20)
    // 可复现：同种子再跑一次得到同样的期望值
    const again = computeRandomBenchmark({
      symbol: 'BTCUSDT',
      candles,
      series,
      signalDirections: new Array(length).fill(null),
      longRatio: 0.5,
      stopResolver,
      biasSeries: null,
      config,
    })
    expect(again.stats.expectancyR).toBeCloseTo(benchmark.stats.expectancyR, 12)
  })
})
