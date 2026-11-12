/**
 * 理论结局结算单元测试。
 *
 * 覆盖：止损优先、目标触及、同根 bar 双触、反向信号失效、超时过期、数据结束、
 * MFE/MAE 与第二目标标记，以及 R 无法定义时的显式报错。
 */
import { describe, expect, it } from 'vitest'
import { settleTheoreticalTrade } from '../impl/settle'
import type { Candle, Direction, SignalEvent } from '../types'
import { BASE_TIME, HOUR_MS, makeCandle, makeConfig } from './testUtils'

/**
 * 构造多头信号：入场 100、止损 95（R=5）、云上沿 99、云下沿 95。
 *
 * @param overrides 差异项
 * @returns 信号
 */
function makeSignal(overrides: Partial<SignalEvent> = {}): SignalEvent {
  return {
    barIndex: 0,
    time: BASE_TIME + HOUR_MS - 1,
    direction: 'long',
    entryPrice: 100,
    stopPrice: 95,
    cloudTop: 99,
    cloudBottom: 95,
    cloudThickness: 4,
    optionLevels: null,
    grade: null,
    ...overrides,
  }
}

/**
 * 构造信号方向数组（用于反向失效判定）。
 *
 * @param length 长度
 * @param overrides 指定索引的方向
 * @returns 方向数组
 */
function makeDirections(
  length: number,
  overrides: Record<number, Direction> = {},
): (Direction | null)[] {
  const result = new Array<Direction | null>(length).fill(null)
  for (const [key, value] of Object.entries(overrides)) {
    result[Number(key)] = value
  }
  return result
}

/**
 * 构造 N 根 K 线，第 0 根是信号 bar。
 *
 * @param bars 后续 bar 的价格
 * @returns K 线
 */
function makeCandles(bars: readonly { high: number; low: number; close: number }[]): Candle[] {
  return [
    makeCandle(BASE_TIME, { open: 100, high: 100, low: 100, close: 100 }),
    ...bars.map((bar, index) =>
      makeCandle(BASE_TIME + (index + 1) * HOUR_MS, {
        open: bar.close,
        high: bar.high,
        low: bar.low,
        close: bar.close,
      }),
    ),
  ]
}

describe('settleTheoreticalTrade', () => {
  it('触及第一目标：+2R', () => {
    const candles = makeCandles([{ high: 110, low: 99, close: 105 }])
    const trade = settleTheoreticalTrade({
      symbol: 'BTCUSDT',
      id: 1,
      candles,
      signal: makeSignal(),
      signalDirections: makeDirections(candles.length),
      config: makeConfig(),
    })
    expect(trade.outcome).toBe('hit_target')
    expect(trade.exitPrice).toBe(110)
    expect(trade.rMultiple).toBe(2)
    expect(trade.barsHeld).toBe(1)
  })

  it('触及止损：-1R', () => {
    const candles = makeCandles([{ high: 101, low: 94, close: 96 }])
    const trade = settleTheoreticalTrade({
      symbol: 'BTCUSDT',
      id: 1,
      candles,
      signal: makeSignal(),
      signalDirections: makeDirections(candles.length),
      config: makeConfig(),
    })
    expect(trade.outcome).toBe('hit_stop')
    expect(trade.rMultiple).toBe(-1)
  })

  it('同一根 bar 同时触及止损与目标时按止损处理（保守）', () => {
    const candles = makeCandles([{ high: 111, low: 94, close: 100 }])
    const trade = settleTheoreticalTrade({
      symbol: 'BTCUSDT',
      id: 1,
      candles,
      signal: makeSignal(),
      signalDirections: makeDirections(candles.length),
      config: makeConfig(),
    })
    expect(trade.outcome).toBe('hit_stop')
    expect(trade.rMultiple).toBe(-1)
  })

  it('反向信号出现时按收盘价失效出场', () => {
    const candles = makeCandles([
      { high: 104, low: 97, close: 101 },
      { high: 104, low: 97, close: 102 },
    ])
    const trade = settleTheoreticalTrade({
      symbol: 'BTCUSDT',
      id: 1,
      candles,
      signal: makeSignal(),
      signalDirections: makeDirections(candles.length, { 2: 'short' }),
      config: makeConfig(),
    })
    expect(trade.outcome).toBe('invalidated')
    expect(trade.exitPrice).toBe(102)
    expect(trade.rMultiple).toBeCloseTo(0.4, 10)
  })

  it('超过 maxBars 未触发止损/目标时过期出场', () => {
    const candles = makeCandles([
      { high: 104, low: 97, close: 101 },
      { high: 104, low: 97, close: 102 },
    ])
    const trade = settleTheoreticalTrade({
      symbol: 'BTCUSDT',
      id: 1,
      candles,
      signal: makeSignal(),
      signalDirections: makeDirections(candles.length),
      config: makeConfig({ maxBars: 1 }),
    })
    expect(trade.outcome).toBe('expired')
    expect(trade.exitPrice).toBe(101)
  })

  it('数据结束仍未了结时按最后一根收盘价记为过期', () => {
    const candles = makeCandles([{ high: 104, low: 97, close: 101 }])
    const trade = settleTheoreticalTrade({
      symbol: 'BTCUSDT',
      id: 1,
      candles,
      signal: makeSignal(),
      signalDirections: makeDirections(candles.length),
      config: makeConfig(),
    })
    expect(trade.outcome).toBe('expired')
    expect(trade.exitPrice).toBe(101)
  })

  it('记录 MFE / MAE 与第二目标是否到达', () => {
    const candles = makeCandles([
      { high: 104, low: 97, close: 102 },
      { high: 110, low: 99, close: 108 },
    ])
    const trade = settleTheoreticalTrade({
      symbol: 'BTCUSDT',
      id: 1,
      candles,
      signal: makeSignal(),
      signalDirections: makeDirections(candles.length),
      config: makeConfig(),
    })
    expect(trade.maxFavorableR).toBe(2)
    // 第一根 bar 最低 97：不利偏移 (100-97)/5 = 0.6
    expect(trade.maxAdverseR).toBeCloseTo(0.6, 10)
    expect(trade.reachedTarget2).toBe(false)
  })

  it('空头方向：目标在下方，止损在上方', () => {
    const candles = makeCandles([{ high: 103, low: 90, close: 92 }])
    const trade = settleTheoreticalTrade({
      symbol: 'BTCUSDT',
      id: 1,
      candles,
      signal: makeSignal({
        direction: 'short',
        entryPrice: 100,
        stopPrice: 105,
        cloudTop: 105,
        cloudBottom: 101,
      }),
      signalDirections: makeDirections(candles.length),
      config: makeConfig(),
    })
    expect(trade.outcome).toBe('hit_target')
    expect(trade.exitPrice).toBe(90)
    expect(trade.rMultiple).toBe(2)
  })

  it('第一目标倍数可配置：target1R=3 时在 +3R 结算', () => {
    const candles = makeCandles([{ high: 116, low: 99, close: 114 }])
    const trade = settleTheoreticalTrade({
      symbol: 'BTCUSDT',
      id: 1,
      candles,
      signal: makeSignal(),
      signalDirections: makeDirections(candles.length),
      config: makeConfig({ target1R: 3, target2R: 4 }),
    })
    expect(trade.outcome).toBe('hit_target')
    expect(trade.exitPrice).toBe(115)
    expect(trade.grossR).toBe(3)
  })

  it('入场价等于止损价时显式报错', () => {
    const candles = makeCandles([{ high: 101, low: 99, close: 100 }])
    expect(() =>
      settleTheoreticalTrade({
        symbol: 'BTCUSDT',
        id: 1,
        candles,
        signal: makeSignal({ stopPrice: 100 }),
        signalDirections: makeDirections(candles.length),
        config: makeConfig(),
      }),
    ).toThrowError(/入场价与止损价重合/)
  })

  it('成本按单边名义计入净 R，毛 R 不受影响', () => {
    const candles = makeCandles([{ high: 110, low: 99, close: 105 }])
    const trade = settleTheoreticalTrade({
      symbol: 'BTCUSDT',
      id: 1,
      candles,
      signal: makeSignal(),
      signalDirections: makeDirections(candles.length),
      config: makeConfig({ costBpsPerSide: 10 }),
    })
    expect(trade.outcome).toBe('hit_target')
    expect(trade.grossR).toBe(2)
    // (100 + 110) * 0.001 / 5 = 0.042
    expect(trade.costR).toBeCloseTo(0.042, 12)
    expect(trade.rMultiple).toBeCloseTo(1.958, 12)
  })

  it('零成本配置下净 R 等于毛 R', () => {
    const candles = makeCandles([{ high: 110, low: 99, close: 105 }])
    const trade = settleTheoreticalTrade({
      symbol: 'BTCUSDT',
      id: 1,
      candles,
      signal: makeSignal(),
      signalDirections: makeDirections(candles.length),
      config: makeConfig(),
    })
    expect(trade.costR).toBe(0)
    expect(trade.rMultiple).toBe(trade.grossR)
  })

  it('空头方向的成本与多头同口径（方向无关）', () => {
    const candles = makeCandles([{ high: 103, low: 90, close: 92 }])
    const trade = settleTheoreticalTrade({
      symbol: 'BTCUSDT',
      id: 1,
      candles,
      signal: makeSignal({
        direction: 'short',
        entryPrice: 100,
        stopPrice: 105,
        cloudTop: 105,
        cloudBottom: 101,
      }),
      signalDirections: makeDirections(candles.length),
      config: makeConfig({ costBpsPerSide: 10 }),
    })
    expect(trade.outcome).toBe('hit_target')
    expect(trade.grossR).toBe(2)
    // (100 + 90) * 0.001 / 5 = 0.038
    expect(trade.costR).toBeCloseTo(0.038, 12)
    expect(trade.rMultiple).toBeCloseTo(1.962, 12)
  })
})
