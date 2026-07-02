import { describe, it, expect } from 'vitest'

import {
  calcMAData,
  calcBOLLData,
  calcEXPMAData,
  calcENEData,
  calcRSIData,
  DEFAULT_MA_PERIODS,
} from '../calculators'
import { DEFAULT_BOLL_PERIOD, DEFAULT_BOLL_MULTIPLIER } from '../state/bollState'
import { DEFAULT_ENE_PERIOD, DEFAULT_ENE_DEVIATION } from '../state/eneState'
import { DEFAULT_EXPMA_FAST_PERIOD, DEFAULT_EXPMA_SLOW_PERIOD } from '../state/expmaState'
import { DEFAULT_RSI_PERIOD1, DEFAULT_RSI_PERIOD2, DEFAULT_RSI_PERIOD3 } from '../state/rsiState'

import type { KLineData } from '@/types/price'

/**
 * 创建测试用的 K 线数据
 * 收盘价序列: 10, 11, 12, 13, 14, 15, 16, 17, 18, 19
 */
function createTestData(prices: number[]): KLineData[] {
  return prices.map((close, index) => ({
    timestamp: 1000000000000 + index * 60000,
    open: close - 0.5,
    high: close + 0.5,
    low: close - 0.5,
    close,
    volume: 1000 + index * 100,
  }))
}

describe('calcMAData', () => {
  const prices = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19]
  const data = createTestData(prices)

  it('should return array of same length as input', () => {
    const result = calcMAData(data, 5)
    expect(result).toHaveLength(data.length)
  })

  it('should return undefined for indices before period-1', () => {
    const result = calcMAData(data, 5)
    expect(result[0]).toBeUndefined()
    expect(result[1]).toBeUndefined()
    expect(result[2]).toBeUndefined()
    expect(result[3]).toBeUndefined()
  })

  it('should calculate correct MA5 values using sliding window', () => {
    const result = calcMAData(data, 5)

    // MA5 at index 4: (10+11+12+13+14)/5 = 60/5 = 12
    expect(result[4]).toBeCloseTo(12, 2)

    // MA5 at index 5: (11+12+13+14+15)/5 = 65/5 = 13
    expect(result[5]).toBeCloseTo(13, 2)

    // MA5 at index 9: (15+16+17+18+19)/5 = 85/5 = 17
    expect(result[9]).toBeCloseTo(17, 2)
  })

  it('should calculate correct MA3 values', () => {
    const result = calcMAData(data, 3)

    // MA3 at index 2: (10+11+12)/3 = 11
    expect(result[2]).toBeCloseTo(11, 2)

    // MA3 at index 3: (11+12+13)/3 = 12
    expect(result[3]).toBeCloseTo(12, 2)

    // MA3 at index 4: (12+13+14)/3 = 13
    expect(result[4]).toBeCloseTo(13, 2)
  })

  it('should handle period=1 (return close price)', () => {
    const result = calcMAData(data, 1)

    for (let i = 0; i < data.length; i++) {
      expect(result[i]).toBeCloseTo(data[i].close, 2)
    }
  })

  it('should return all undefined when data length < period', () => {
    const shortData = createTestData([10, 11, 12])
    const result = calcMAData(shortData, 5)

    expect(result).toHaveLength(3)
    expect(result[0]).toBeUndefined()
    expect(result[1]).toBeUndefined()
    expect(result[2]).toBeUndefined()
  })

  it('should handle empty data', () => {
    const result = calcMAData([], 5)
    expect(result).toHaveLength(0)
  })

  it('should produce consistent results with manual calculation', () => {
    const result = calcMAData(data, 5)

    // Manual verification of sliding window
    for (let i = 4; i < data.length; i++) {
      let sum = 0
      for (let j = 0; j < 5; j++) {
        sum += data[i - j].close
      }
      const expected = sum / 5
      expect(result[i]).toBeCloseTo(expected, 2)
    }
  })

  it('should handle large datasets efficiently', () => {
    const largePrices = Array.from({ length: 10000 }, (_, i) => 100 + i)
    const largeData = createTestData(largePrices)

    const start = performance.now()
    const result = calcMAData(largeData, 60)
    const end = performance.now()

    // Should complete in reasonable time (< 100ms for 10k items)
    expect(end - start).toBeLessThan(100)

    // Verify last value is correct
    // Last 60 values are indices 9940-9999, prices are 100+9940=10040 to 100+9999=10099
    // sum = (10040 + 10099) * 60 / 2 = 604170, avg = 10069.5
    const lastIdx = largeData.length - 1
    expect(result[lastIdx]).toBeCloseTo(10069.5, 1)
  })
})

describe('DEFAULT_MA_PERIODS', () => {
  it('should contain standard MA periods', () => {
    expect(DEFAULT_MA_PERIODS).toEqual([5, 10, 20, 30, 60])
  })

  it('should be readonly array', () => {
    // Type check - this is more of a compile-time check
    // but we verify the values are as expected
    expect(DEFAULT_MA_PERIODS).toHaveLength(5)
    expect(DEFAULT_MA_PERIODS[0]).toBe(5)
    expect(DEFAULT_MA_PERIODS[4]).toBe(60)
  })
})

describe('calcBOLLData', () => {
  const prices = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19]
  const data = createTestData(prices)

  it('should return array of same length as input', () => {
    const result = calcBOLLData(data, 5, 2)
    expect(result).toHaveLength(data.length)
  })

  it('should return undefined for indices before period-1', () => {
    const result = calcBOLLData(data, 5, 2)
    expect(result[0]).toBeUndefined()
    expect(result[1]).toBeUndefined()
    expect(result[2]).toBeUndefined()
    expect(result[3]).toBeUndefined()
  })

  it('should calculate correct BOLL5 values with known data', () => {
    const result = calcBOLLData(data, 5, 2)

    // Index 4: closes [10,11,12,13,14], MA=12, variance=2, stdDev=√2
    const point4 = result[4]!
    expect(point4.middle).toBeCloseTo(12, 2)
    expect(point4.upper).toBeCloseTo(12 + 2 * Math.sqrt(2), 2)
    expect(point4.lower).toBeCloseTo(12 - 2 * Math.sqrt(2), 2)

    // Index 5: closes [11,12,13,14,15], MA=13, variance=2, stdDev=√2
    const point5 = result[5]!
    expect(point5.middle).toBeCloseTo(13, 2)
    expect(point5.upper).toBeCloseTo(13 + 2 * Math.sqrt(2), 2)
    expect(point5.lower).toBeCloseTo(13 - 2 * Math.sqrt(2), 2)
  })

  it('should have upper = middle + multiplier * stdDev', () => {
    const result = calcBOLLData(data, 5, 2)
    for (let i = 4; i < data.length; i++) {
      const p = result[i]!
      const stdDev = (p.upper - p.middle) / 2
      expect(p.lower).toBeCloseTo(p.middle - 2 * stdDev, 2)
    }
  })

  it('should have lower = middle - multiplier * stdDev', () => {
    const result = calcBOLLData(data, 5, 2)
    for (let i = 4; i < data.length; i++) {
      const p = result[i]!
      expect(p.lower).toBeCloseTo(p.middle - (p.upper - p.middle), 2)
    }
  })

  it('should return all undefined when data length < period', () => {
    const shortData = createTestData([10, 11, 12])
    const result = calcBOLLData(shortData, 5, 2)

    expect(result).toHaveLength(3)
    expect(result[0]).toBeUndefined()
    expect(result[1]).toBeUndefined()
    expect(result[2]).toBeUndefined()
  })

  it('should handle empty data', () => {
    const result = calcBOLLData([], 5, 2)
    expect(result).toHaveLength(0)
  })

  it('should produce consistent results with manual sliding window', () => {
    const result = calcBOLLData(data, 5, 2)

    for (let i = 4; i < data.length; i++) {
      let sum = 0
      for (let j = 0; j < 5; j++) {
        sum += data[i - j].close
      }
      const ma = sum / 5

      let variance = 0
      for (let j = 0; j < 5; j++) {
        variance += Math.pow(data[i - j].close - ma, 2)
      }
      const stdDev = Math.sqrt(variance / 5)

      expect(result[i]!.middle).toBeCloseTo(ma, 2)
      expect(result[i]!.upper).toBeCloseTo(ma + 2 * stdDev, 2)
      expect(result[i]!.lower).toBeCloseTo(ma - 2 * stdDev, 2)
    }
  })

  it('should handle large datasets efficiently', () => {
    const largePrices = Array.from({ length: 10000 }, (_, i) => 100 + i)
    const largeData = createTestData(largePrices)

    const start = performance.now()
    const result = calcBOLLData(largeData, 20, 2)
    const end = performance.now()

    expect(end - start).toBeLessThan(100)
    expect(result[19]).toBeDefined()
    expect(result[19]!.middle).toBeCloseTo(109.5, 1)
  })
})

describe('calcEXPMAData', () => {
  const prices = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19]
  const data = createTestData(prices)

  it('should return array of same length as input', () => {
    const result = calcEXPMAData(data, 12, 50)
    expect(result).toHaveLength(data.length)
  })

  it('should have values from index 0 (dense array)', () => {
    const result = calcEXPMAData(data, 12, 50)
    expect(result[0]).toBeDefined()
    expect(result[0]!.fast).toBeDefined()
    expect(result[0]!.slow).toBeDefined()
  })

  it('should use first close as initial EMA', () => {
    const result = calcEXPMAData(data, 12, 50)
    expect(result[0]!.fast).toBeCloseTo(10, 2)
    expect(result[0]!.slow).toBeCloseTo(10, 2)
  })

  it('should calculate correct EMA with K=2/(N+1)', () => {
    const result = calcEXPMAData(data, 12, 50)
    const fastK = 2 / (12 + 1)
    const slowK = 2 / (50 + 1)

    // Index 1: EMA(1) = C(1)*K + EMA(0)*(1-K)
    const expectedFast1 = 11 * fastK + 10 * (1 - fastK)
    const expectedSlow1 = 11 * slowK + 10 * (1 - slowK)
    expect(result[1]!.fast).toBeCloseTo(expectedFast1, 4)
    expect(result[1]!.slow).toBeCloseTo(expectedSlow1, 4)

    // Index 2: continue recursion
    const expectedFast2 = 12 * fastK + expectedFast1 * (1 - fastK)
    const expectedSlow2 = 12 * slowK + expectedSlow1 * (1 - slowK)
    expect(result[2]!.fast).toBeCloseTo(expectedFast2, 4)
    expect(result[2]!.slow).toBeCloseTo(expectedSlow2, 4)
  })

  it('should have fast line more responsive than slow line', () => {
    const result = calcEXPMAData(data, 12, 50)

    for (let i = 1; i < data.length; i++) {
      // Rising prices: fast EMA should be greater than slow EMA
      expect(result[i]!.fast).toBeGreaterThanOrEqual(result[i]!.slow)
    }
  })

  it('should handle empty data', () => {
    const result = calcEXPMAData([], 12, 50)
    expect(result).toHaveLength(0)
  })

  it('should handle single data point', () => {
    const singleData = createTestData([42])
    const result = calcEXPMAData(singleData, 12, 50)

    expect(result).toHaveLength(1)
    expect(result[0]!.fast).toBeCloseTo(42, 2)
    expect(result[0]!.slow).toBeCloseTo(42, 2)
  })

  it('should produce consistent results with manual EMA recursion', () => {
    const result = calcEXPMAData(data, 12, 50)
    const fastK = 2 / (12 + 1)
    const slowK = 2 / (50 + 1)

    let fastEMA = data[0].close
    let slowEMA = data[0].close

    for (let i = 0; i < data.length; i++) {
      expect(result[i]!.fast).toBeCloseTo(fastEMA, 6)
      expect(result[i]!.slow).toBeCloseTo(slowEMA, 6)

      if (i + 1 < data.length) {
        fastEMA = data[i + 1].close * fastK + fastEMA * (1 - fastK)
        slowEMA = data[i + 1].close * slowK + slowEMA * (1 - slowK)
      }
    }
  })

  it('should handle large datasets efficiently', () => {
    const largePrices = Array.from({ length: 10000 }, (_, i) => 100 + i)
    const largeData = createTestData(largePrices)

    const start = performance.now()
    const result = calcEXPMAData(largeData, 12, 50)
    const end = performance.now()

    expect(end - start).toBeLessThan(100)
    expect(result[0]).toBeDefined()
    expect(result[9999]).toBeDefined()
  })
})

describe('calcENEData', () => {
  const prices = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19]
  const data = createTestData(prices)

  it('should return array of same length as input', () => {
    const result = calcENEData(data, 5, 10)
    expect(result).toHaveLength(data.length)
  })

  it('should return undefined for indices before period-1', () => {
    const result = calcENEData(data, 5, 10)
    expect(result[0]).toBeUndefined()
    expect(result[1]).toBeUndefined()
    expect(result[2]).toBeUndefined()
    expect(result[3]).toBeUndefined()
  })

  it('should calculate correct ENE5 values with deviation=10', () => {
    const result = calcENEData(data, 5, 10)

    // Index 4: MA5=12, upper=12*1.1=13.2, lower=12*0.9=10.8
    const point4 = result[4]!
    expect(point4.middle).toBeCloseTo(12, 2)
    expect(point4.upper).toBeCloseTo(13.2, 2)
    expect(point4.lower).toBeCloseTo(10.8, 2)

    // Index 5: MA5=13, upper=13*1.1=14.3, lower=13*0.9=11.7
    const point5 = result[5]!
    expect(point5.middle).toBeCloseTo(13, 2)
    expect(point5.upper).toBeCloseTo(14.3, 2)
    expect(point5.lower).toBeCloseTo(11.7, 2)
  })

  it('should have upper = middle * (1 + deviation/100)', () => {
    const result = calcENEData(data, 5, 11)
    for (let i = 4; i < data.length; i++) {
      const p = result[i]!
      expect(p.upper).toBeCloseTo(p.middle * (1 + 11 / 100), 2)
    }
  })

  it('should have lower = middle * (1 - deviation/100)', () => {
    const result = calcENEData(data, 5, 11)
    for (let i = 4; i < data.length; i++) {
      const p = result[i]!
      expect(p.lower).toBeCloseTo(p.middle * (1 - 11 / 100), 2)
    }
  })

  it('should return all undefined when data length < period', () => {
    const shortData = createTestData([10, 11, 12])
    const result = calcENEData(shortData, 5, 10)

    expect(result).toHaveLength(3)
    expect(result[0]).toBeUndefined()
    expect(result[1]).toBeUndefined()
    expect(result[2]).toBeUndefined()
  })

  it('should handle empty data', () => {
    const result = calcENEData([], 5, 10)
    expect(result).toHaveLength(0)
  })

  it('should produce consistent results with manual calculation', () => {
    const result = calcENEData(data, 5, 10)

    for (let i = 4; i < data.length; i++) {
      let sum = 0
      for (let j = 0; j < 5; j++) {
        sum += data[i - j].close
      }
      const ma = sum / 5

      expect(result[i]!.middle).toBeCloseTo(ma, 2)
      expect(result[i]!.upper).toBeCloseTo(ma * (1 + 10 / 100), 2)
      expect(result[i]!.lower).toBeCloseTo(ma * (1 - 10 / 100), 2)
    }
  })

  it('should handle large datasets efficiently', () => {
    const largePrices = Array.from({ length: 10000 }, (_, i) => 100 + i)
    const largeData = createTestData(largePrices)

    const start = performance.now()
    const result = calcENEData(largeData, 10, 11)
    const end = performance.now()

    expect(end - start).toBeLessThan(100)
    expect(result[9]).toBeDefined()
    expect(result[9]!.middle).toBeCloseTo(104.5, 1)
  })
})

describe('BOLL default constants', () => {
  it('DEFAULT_BOLL_PERIOD should be 20', () => {
    expect(DEFAULT_BOLL_PERIOD).toBe(20)
  })

  it('DEFAULT_BOLL_MULTIPLIER should be 2', () => {
    expect(DEFAULT_BOLL_MULTIPLIER).toBe(2)
  })
})

describe('EXPMA default constants', () => {
  it('DEFAULT_EXPMA_FAST_PERIOD should be 12', () => {
    expect(DEFAULT_EXPMA_FAST_PERIOD).toBe(12)
  })

  it('DEFAULT_EXPMA_SLOW_PERIOD should be 50', () => {
    expect(DEFAULT_EXPMA_SLOW_PERIOD).toBe(50)
  })
})

describe('ENE default constants', () => {
  it('DEFAULT_ENE_PERIOD should be 10', () => {
    expect(DEFAULT_ENE_PERIOD).toBe(10)
  })

  it('DEFAULT_ENE_DEVIATION should be 11', () => {
    expect(DEFAULT_ENE_DEVIATION).toBe(11)
  })
})

describe('calcRSIData', () => {
  // 创建测试数据：价格连续上涨序列
  function createRisingPrices(count: number, start = 10): number[] {
    return Array.from({ length: count }, (_, i) => start + i)
  }

  // 创建测试数据：价格连续下跌序列
  function createFallingPrices(count: number, start = 20): number[] {
    return Array.from({ length: count }, (_, i) => start - i)
  }

  // 创建测试数据：价格震荡序列
  function createOscillatingPrices(count: number): number[] {
    return Array.from({ length: count }, (_, i) => 10 + (i % 2 === 0 ? 1 : -1))
  }

  it('should return array of same length as input', () => {
    const prices = createRisingPrices(20)
    const data = createTestData(prices)
    const result = calcRSIData(data, 6)
    expect(result).toHaveLength(data.length)
  })

  it('should return undefined for first period indices', () => {
    const prices = createRisingPrices(20)
    const data = createTestData(prices)
    const period = 6
    const result = calcRSIData(data, period)

    // 前 period 个值应为 undefined (index 0-5)
    for (let i = 0; i < period; i++) {
      expect(result[i]).toBeUndefined()
    }
    // 第 period 个值是第一个有效值 (index 6)
    expect(result[period]).toBeDefined()
  })

  it('should return 100 when all gains (no losses)', () => {
    const prices = createRisingPrices(20)
    const data = createTestData(prices)
    const period = 6
    const result = calcRSIData(data, period)

    // 第一个有效 RSI 值应为 100（全是上涨，没有下跌）
    expect(result[period + 1]).toBe(100)
  })

  it('should return 0 when all losses (no gains)', () => {
    const prices = createFallingPrices(20)
    const data = createTestData(prices)
    const period = 6
    const result = calcRSIData(data, period)

    // 第一个有效 RSI 值应为 0（全是下跌，没有上涨）
    expect(result[period + 1]).toBe(0)
  })

  it('should return all undefined when data length < period+1', () => {
    const prices = [10, 11, 12, 13, 14]
    const data = createTestData(prices)
    const period = 6
    const result = calcRSIData(data, period)

    // 数据不足时，所有值都应为 undefined
    expect(result).toHaveLength(5)
    result.forEach((v) => {
      expect(v).toBeUndefined()
    })
  })

  it('should handle empty data', () => {
    const result = calcRSIData([], 6)
    expect(result).toHaveLength(0)
  })

  it('should calculate correct RSI with known oscillating data', () => {
    // 震荡价格：10, 11, 10, 11, 10, 11, 10, 11, ...
    const prices = [10, 11, 10, 11, 10, 11, 10, 11, 10, 11, 10, 11]
    const data = createTestData(prices)
    const period = 6
    const result = calcRSIData(data, period)

    // 第6个索引（period=6）是第一个有效值
    // 前6个变化：+1, -1, +1, -1, +1, -1
    // sumGain = 3, sumLoss = 3
    // avgGain = 0.5, avgLoss = 0.5
    // RS = 1, RSI = 100 - 100/(1+1) = 50
    expect(result[6]).toBeCloseTo(50, 0)
  })

  it('should handle period=1', () => {
    // period=1 只需要 2 条数据
    const prices = [10, 12]
    const data = createTestData(prices)
    const result = calcRSIData(data, 1)

    // 第一个变化是 +2，所以 avgGain = 2, avgLoss = 0
    // RSI = 100
    // result[0] = undefined, result[1] = 100
    expect(result[0]).toBeUndefined()
    expect(result[1]).toBe(100)
  })

  it('should produce consistent results with manual Wilder smoothing', () => {
    const prices = [10, 11, 12, 11, 12, 13, 12, 11, 12, 13]
    const data = createTestData(prices)
    const period = 3
    const result = calcRSIData(data, period)

    // 手动计算验证第一个有效值（index = period = 3）
    // 变化：+1, +1, -1, +1, +1, -1, -1, +1, +1
    // 前3个变化：+1, +1, -1
    // sumGain = 2, sumLoss = 1
    // avgGain = 2/3, avgLoss = 1/3
    // RS = 2, RSI = 100 - 100/(1+2) = 66.67
    expect(result[3]).toBeCloseTo(66.67, 1)
  })

  it('should handle large datasets efficiently', () => {
    const prices = Array.from({ length: 10000 }, (_, i) => 100 + Math.sin(i / 10) * 10)
    const data = createTestData(prices)

    const start = performance.now()
    const result = calcRSIData(data, 14)
    const end = performance.now()

    // 应在 100ms 内完成
    expect(end - start).toBeLessThan(100)
    expect(result[15]).toBeDefined()
  })
})

describe('RSI default constants', () => {
  it('DEFAULT_RSI_PERIOD1 should be 6', () => {
    expect(DEFAULT_RSI_PERIOD1).toBe(6)
  })

  it('DEFAULT_RSI_PERIOD2 should be 12', () => {
    expect(DEFAULT_RSI_PERIOD2).toBe(12)
  })

  it('DEFAULT_RSI_PERIOD3 should be 24', () => {
    expect(DEFAULT_RSI_PERIOD3).toBe(24)
  })
})
