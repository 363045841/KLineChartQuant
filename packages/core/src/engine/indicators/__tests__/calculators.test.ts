import { describe, expect, it } from 'vitest'
import { calcENEData, calcEXPMAData, calcMAData, DEFAULT_MA_PERIODS } from '../calculators'
import { type FromClosesOptions, fromCloses } from './__fixtures__/synthetic'

/** 测试直接声明计算参数，不依赖渲染器默认状态。 */
const DEFAULT_ENE_PERIOD = 10
const DEFAULT_ENE_DEVIATION = 11
const DEFAULT_EXPMA_FAST_PERIOD = 12
const DEFAULT_EXPMA_SLOW_PERIOD = 50

/** 计算器测试统一的 K 线选项：固定时间基准与递增成交量。 */
const CALCULATOR_KLINE_OPTIONS: FromClosesOptions = {
  timestamp: 1_000_000_000_000,
  volume: (index) => 1000 + index * 100,
}

/**
 * 生成测试用的线性上涨价格序列。
 * @param count 序列长度。
 * @param start 首项，默认 10。
 * @returns 等差数列。
 */
function createRisingPrices(count: number, start = 10): number[] {
  return Array.from({ length: count }, (_, i) => start + i)
}

describe('calcMAData', () => {
  const prices = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19]
  const data = fromCloses(prices, CALCULATOR_KLINE_OPTIONS)

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
    const shortData = fromCloses([10, 11, 12], CALCULATOR_KLINE_OPTIONS)
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
    const largePrices = createRisingPrices(10000, 100)
    const largeData = fromCloses(largePrices, CALCULATOR_KLINE_OPTIONS)

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

describe('calcEXPMAData', () => {
  const prices = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19]
  const data = fromCloses(prices, CALCULATOR_KLINE_OPTIONS)

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
    const singleData = fromCloses([42], CALCULATOR_KLINE_OPTIONS)
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
    const largePrices = createRisingPrices(10000, 100)
    const largeData = fromCloses(largePrices, CALCULATOR_KLINE_OPTIONS)

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
  const data = fromCloses(prices, CALCULATOR_KLINE_OPTIONS)

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
    const shortData = fromCloses([10, 11, 12], CALCULATOR_KLINE_OPTIONS)
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
    const largePrices = createRisingPrices(10000, 100)
    const largeData = fromCloses(largePrices, CALCULATOR_KLINE_OPTIONS)

    const start = performance.now()
    const result = calcENEData(largeData, 10, 11)
    const end = performance.now()

    expect(end - start).toBeLessThan(100)
    expect(result[9]).toBeDefined()
    expect(result[9]!.middle).toBeCloseTo(104.5, 1)
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
