/** 生成器不变量：确定性、区段首尾相接、价格有界、任意切片可独立重算。 */
import { describe, expect, it } from 'vitest'
import {
  generateMockBars,
  MOCK_ANCHOR_SPAN,
  MOCK_DAY_MS,
  mockAnchorPrice,
  mockBarTimestamp,
  mockDayIndex,
  mockSeedFor,
} from '../impl/sources/mockData.js'

const seed = mockSeedFor('MOCK')

describe('mock bar generator', () => {
  it('produces the same series for the same seed and differs across seeds', () => {
    expect(generateMockBars(seed, 0, 200)).toEqual(generateMockBars(seed, 0, 200))
    expect(generateMockBars(seed, 0, 200)).not.toEqual(
      generateMockBars(mockSeedFor('MOCK-OTHER'), 0, 200),
    )
  })

  it('joins every adjacent bar, including across anchor boundaries', () => {
    const bars = generateMockBars(seed, MOCK_ANCHOR_SPAN * 3, MOCK_ANCHOR_SPAN * 2 + 50)
    for (let index = 1; index < bars.length; index++) {
      expect(bars[index]!.timestamp - bars[index - 1]!.timestamp).toBe(MOCK_DAY_MS)
      expect(bars[index]!.open).toBe(bars[index - 1]!.close)
    }
    // 锚点边界（日索引 0）两侧由不同区段计算，收盘与开盘仍必须相等。
    const before = generateMockBars(seed, -1, 1)[0]!
    const after = generateMockBars(seed, 0, 1)[0]!
    expect(after.open).toBe(before.close)
    expect(after.timestamp).toBe(mockBarTimestamp(0))
  })

  it('generates any slice independently, including negative day indexes', () => {
    const full = generateMockBars(seed, 120, 300)
    expect(generateMockBars(seed, 120, 10)).toEqual(full.slice(-10))
    expect(generateMockBars(seed, 0, 10)).toEqual(full.slice(-130, -120))
    for (const bar of generateMockBars(seed, -1_000, 5)) {
      expect(bar.timestamp).toBeLessThan(0)
      expect(bar.close).toBeGreaterThan(0)
    }
  })

  it('keeps OHLCV inside valid bounds', () => {
    for (const bar of generateMockBars(seed, 500, 700)) {
      expect(Number.isSafeInteger(bar.timestamp)).toBe(true)
      for (const price of [bar.open, bar.high, bar.low, bar.close])
        expect(Number.isFinite(price) && price > 0).toBe(true)
      expect(bar.high).toBeGreaterThanOrEqual(Math.max(bar.open, bar.close))
      expect(bar.low).toBeLessThanOrEqual(Math.min(bar.open, bar.close))
      expect(bar.volume).toBeGreaterThan(0)
      expect(bar.turnover).toBeGreaterThan(0)
    }
  })

  it('keeps anchor prices bounded and derived from the UTC day index', () => {
    for (const anchor of [-10_000, -1, 0, 1, 10_000]) {
      const price = mockAnchorPrice(seed, anchor)
      expect(price).toBeGreaterThan(0)
      expect(price).toBeLessThan(25)
    }
    expect(mockDayIndex(mockBarTimestamp(42))).toBe(42)
  })
})
