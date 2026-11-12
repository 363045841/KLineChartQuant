/**
 * 止损解析单元测试。
 *
 * 覆盖两种口径：云边（同步给出）与结构位（只允许用已确认枢轴，且必须在入场价正确一侧）。
 */
import { describe, expect, it } from 'vitest'
import { createStopResolver } from '../impl/stop'
import type { Candle } from '../types'

/** 1 小时的毫秒数。 */
const HOUR_MS = 3_600_000

/** 基准时刻：2026-11-01T00:00:00Z。 */
const BASE_TIME = Date.UTC(2026, 10, 1, 0, 0, 0)

/**
 * 由 low 序列构造 bar（high 恒为 low + 10，close 取 low + 5）。
 *
 * @param lows 每根 bar 的最低价
 * @returns K 线
 */
function makeCandles(lows: readonly number[]): Candle[] {
  return lows.map((low, index) => ({
    openTime: BASE_TIME + index * HOUR_MS,
    closeTime: BASE_TIME + (index + 1) * HOUR_MS - 1,
    open: low + 5,
    high: low + 10,
    low,
    close: low + 5,
    volume: 1,
  }))
}

describe('createStopResolver', () => {
  it('云边口径：多头取下沿、空头取上沿', () => {
    const resolver = createStopResolver(makeCandles([100, 100]), 'cloud', 3)
    expect(
      resolver({ barIndex: 1, direction: 'long', entryPrice: 110, cloudTop: 108, cloudBottom: 99 }),
    ).toBe(99)
    expect(
      resolver({ barIndex: 1, direction: 'short', entryPrice: 95, cloudTop: 108, cloudBottom: 99 }),
    ).toBe(108)
  })

  it('结构口径：多头取最近一个已确认且低于入场的摆动低点', () => {
    // 低点 90 落在 index 5，窗口 ±3 → index 8 才确认。
    const candles = makeCandles([100, 100, 100, 100, 100, 90, 100, 100, 100, 100, 100])
    const resolver = createStopResolver(candles, 'structure', 3)
    expect(
      resolver({ barIndex: 8, direction: 'long', entryPrice: 105, cloudTop: 104, cloudBottom: 96 }),
    ).toBe(90)
  })

  it('结构口径：枢轴尚未确认时不可用（不提前使用未来数据）', () => {
    const candles = makeCandles([100, 100, 100, 100, 100, 90, 100, 100, 100, 100, 100])
    const resolver = createStopResolver(candles, 'structure', 3)
    expect(
      resolver({ barIndex: 7, direction: 'long', entryPrice: 105, cloudTop: 104, cloudBottom: 96 }),
    ).toBeNull()
  })

  it('结构口径：枢轴在错误一侧时不可用', () => {
    const candles = makeCandles([100, 100, 100, 100, 100, 90, 100, 100, 100, 100, 100])
    const resolver = createStopResolver(candles, 'structure', 3)
    // 入场价 85 低于摆动低点 90，多头无法把止损放在上方。
    expect(
      resolver({ barIndex: 8, direction: 'long', entryPrice: 85, cloudTop: 84, cloudBottom: 80 }),
    ).toBeNull()
  })
})
