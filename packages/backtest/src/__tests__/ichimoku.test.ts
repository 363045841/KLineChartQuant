/**
 * 一目均衡表指标单元测试。
 *
 * 用等差价格序列（close[i] = 100 + i）手算期望值：滚动最高/最低有解析解，便于锁定口径。
 */
import { describe, expect, it } from 'vitest'
import { cloudAt, computeIchimoku } from '../impl/ichimoku'
import { BASE_TIME, HOUR_MS, makeCandle } from './testUtils'

/** 100 根等差 K 线：high = close + 0.5，low = close - 0.5，close = 100 + i。 */
const candles = Array.from({ length: 100 }, (_, index) =>
  makeCandle(BASE_TIME + index * HOUR_MS, {
    open: 100 + index,
    high: 100 + index + 0.5,
    low: 100 + index - 0.5,
    close: 100 + index,
  }),
)

describe('computeIchimoku', () => {
  const series = computeIchimoku(candles)

  it('转换线 = 9 周期高低均值', () => {
    // i=8：max high = 108.5，min low = 99.5
    expect(series.tenkan[8]).toBeCloseTo(104, 10)
    expect(series.tenkan[7]).toBeNull()
  })

  it('基准线 = 26 周期高低均值', () => {
    // i=30：max high = 130.5，min low = 104.5
    expect(series.kijun[30]).toBeCloseTo(117.5, 10)
    expect(series.kijun[24]).toBeNull()
  })

  it('云提前 26 根绘制', () => {
    // spanA[52] = (tenkan[26] + kijun[26]) / 2 = (122 + 113.5) / 2
    expect(series.spanA[52]).toBeCloseTo(117.75, 10)
    expect(series.spanA[25]).toBeNull()
    // spanB[77] = spanB 原始值[51] = (max high[0..51] + min low[0..51]) / 2 = (151.5 + 99.5) / 2
    expect(series.spanB[77]).toBeCloseTo(125.5, 10)
    expect(series.spanB[76]).toBeNull()
  })

  it('Regime 差值 = close[i] - close[i-26]', () => {
    expect(series.regimeDiff[30]).toBeCloseTo(26, 10)
    expect(series.regimeDiff[25]).toBeNull()
  })

  it('ATR(14) 用 Wilder 平滑', () => {
    // tr[0] = 1；i>0 时 tr = max(1, |high - prevClose| = 1.5, |low - prevClose| = 0.5) = 1.5
    const expected = (1 + 13 * 1.5) / 14
    expect(series.atr[13]).toBeCloseTo(expected, 10)
    expect(series.atr[12]).toBeNull()
  })

  it('cloudAt 返回上沿、下沿与厚度', () => {
    const cloud = cloudAt(series, 80)
    expect(cloud).not.toBeNull()
    if (cloud !== null) {
      expect(cloud.top).toBeGreaterThan(cloud.bottom)
      expect(cloud.thickness).toBeCloseTo(cloud.top - cloud.bottom, 10)
    }
    expect(cloudAt(series, 10)).toBeNull()
  })
})
