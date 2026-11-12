/**
 * 多周期对齐单元测试。
 *
 * 核心防的是**用未收盘的 HTF bar**：1h 图上当天的日线还没走完就拿它的高低收，
 * 会直接把未来数据灌进判断。这里用「日内偏向恒定、只在日线收盘那一刻才可能变化」来钉住这一点。
 */
import { describe, expect, it } from 'vitest'
import { buildHtfBiasSeries } from '../impl/bias'
import { aggregateCandles } from '../impl/resample'
import { BASE_TIME, HOUR_MS, makeCandle } from './testUtils'

const DAY_MS = 86_400_000

/**
 * 生成 n 根 1h K 线，收盘价走一个慢速正弦（跨日会产生方向变化）。
 *
 * @param hours 小时数
 * @returns K 线
 */
function makeHourly(hours: number) {
  return Array.from({ length: hours }, (_, index) => {
    const close = 100 + Math.sin(index / 12) * 10
    return makeCandle(BASE_TIME + index * HOUR_MS, {
      open: close,
      high: close + 1,
      low: close - 1,
      close,
    })
  })
}

describe('aggregateCandles', () => {
  it('按 4 小时分桶聚合 OHLC', () => {
    const candles = makeHourly(8)
    const bars = aggregateCandles(candles, '4h')
    expect(bars).toHaveLength(2)
    expect(bars[0].openTime).toBe(BASE_TIME)
    expect(bars[0].closeTime).toBe(BASE_TIME + 4 * HOUR_MS - 1)
    expect(bars[0].open).toBe(candles[0].open)
    expect(bars[0].close).toBe(candles[3].close)
    expect(bars[0].high).toBe(Math.max(...candles.slice(0, 4).map((item) => item.high)))
    expect(bars[0].low).toBe(Math.min(...candles.slice(0, 4).map((item) => item.low)))
    expect(bars[1].openTime).toBe(BASE_TIME + 4 * HOUR_MS)
  })

  it('日线按 UTC 零点对齐', () => {
    const bars = aggregateCandles(makeHourly(48), '1d')
    expect(bars).toHaveLength(2)
    expect(bars[0].openTime % DAY_MS).toBe(0)
    expect(bars[1].openTime - bars[0].openTime).toBe(DAY_MS)
  })
})

describe('buildHtfBiasSeries', () => {
  const candles = makeHourly(24 * 6)
  const series = buildHtfBiasSeries(candles, '1d', 1)

  it('长度与 LTF 一致', () => {
    expect(series).toHaveLength(candles.length)
  })

  it('同一交易日内的 LTF bar 看到的日线偏向不变（未收盘的日线不参与）', () => {
    for (let index = 0; index + 1 < candles.length; index += 1) {
      const sameDay =
        Math.floor(candles[index].openTime / DAY_MS) ===
        Math.floor(candles[index + 1].openTime / DAY_MS)
      const isLastBarOfDay =
        Math.floor(candles[index].openTime / DAY_MS) !==
        Math.floor((candles[index].openTime + HOUR_MS) / DAY_MS)
      if (!sameDay || isLastBarOfDay) {
        continue
      }
      expect(series[index + 1]).toBe(series[index])
    }
  })

  it('第 1 天收盘之前看不到第 1 天的日线（只用更早的已收盘日线）', () => {
    // 第 1 天最后一根之前的任何一根，看到的都是「第 0 天及更早」的日线，
    // 而第 1 天还没收盘时数组里只有第 0 天这一根日线，因此整段应为 null。
    for (let index = 0; index < 23; index += 1) {
      expect(series[index]).toBeNull()
    }
  })
})
