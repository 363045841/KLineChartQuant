/**
 * 因果枢轴检测单元测试。
 *
 * 重点不是「能找出极值」，而是三条因果性约束：
 * 确认窗口、平顶不产枢轴、以及「用前缀数据算出的历史枢轴，与用全量数据算出的同一批枢轴完全一致」（不重绘）。
 */
import { describe, expect, it } from 'vitest'
import { detectPivots, type StructureBar } from '../impl/pivots'

/** 1 小时的毫秒数。 */
const HOUR_MS = 3_600_000

/** 基准时刻：2026-11-01T00:00:00Z。 */
const BASE_TIME = Date.UTC(2026, 10, 1, 0, 0, 0)

/**
 * 由价格行构造 bar。
 *
 * @param rows 每根 bar 的 high / low / close
 * @returns bar 序列
 */
function makeBars(rows: readonly { high: number; low: number; close: number }[]): StructureBar[] {
  return rows.map((row, index) => ({
    openTime: BASE_TIME + index * HOUR_MS,
    closeTime: BASE_TIME + (index + 1) * HOUR_MS - 1,
    high: row.high,
    low: row.low,
    close: row.close,
  }))
}

/** 一段确定性的锯齿行情：高低点位置可预期。 */
function zigzag(count: number): StructureBar[] {
  const rows = []
  for (let index = 0; index < count; index += 1) {
    const wave = Math.sin(index / 3) * 10
    const close = 100 + wave
    rows.push({ high: close + 2, low: close - 2, close })
  }
  return makeBars(rows)
}

describe('detectPivots', () => {
  it('严格极值才产枢轴，且确认时刻是 barIndex + lookback', () => {
    const bars = makeBars([
      { high: 11, low: 9, close: 10 },
      { high: 12, low: 10, close: 11 },
      { high: 15, low: 12, close: 14 },
      { high: 12, low: 10, close: 11 },
      { high: 11, low: 9, close: 10 },
    ])
    const pivots = detectPivots(bars, 1, 'swing')
    const high = pivots.find((pivot) => pivot.kind === 'high')
    expect(high).toBeDefined()
    expect(high?.barIndex).toBe(2)
    expect(high?.price).toBe(15)
    expect(high?.confirmedBarIndex).toBe(3)
    expect(high?.time).toBe(bars[2].openTime)
    expect(high?.confirmedTime).toBe(bars[3].closeTime)
  })

  it('平顶不产枢轴（严格不等号）', () => {
    const bars = makeBars([
      { high: 10, low: 9, close: 9.5 },
      { high: 15, low: 9, close: 14 },
      { high: 15, low: 9, close: 14 },
      { high: 10, low: 9, close: 9.5 },
    ])
    expect(detectPivots(bars, 1, 'swing').filter((pivot) => pivot.kind === 'high')).toHaveLength(0)
  })

  it('末尾不足一个窗口的 bar 不产枢轴', () => {
    const bars = zigzag(20)
    const pivots = detectPivots(bars, 3, 'swing')
    expect(pivots.some((pivot) => pivot.barIndex > bars.length - 1 - 3)).toBe(false)
  })

  it('窗口非法时显式报错', () => {
    expect(() => detectPivots(zigzag(10), 0, 'swing')).toThrowError(/枢轴窗口/)
    expect(() => detectPivots(zigzag(10), 1.5, 'swing')).toThrowError(/枢轴窗口/)
  })

  it('不重绘：前缀数据算出的枢轴与全量数据中同时可知的枢轴完全一致', () => {
    const bars = zigzag(60)
    const lookback = 2
    const full = detectPivots(bars, lookback, 'swing')
    for (let prefix = lookback * 2 + 1; prefix <= bars.length; prefix += 1) {
      const known = full.filter((pivot) => pivot.confirmedBarIndex <= prefix - 1)
      const fromPrefix = detectPivots(bars.slice(0, prefix), lookback, 'swing')
      expect(fromPrefix).toEqual(known)
    }
  })
})
