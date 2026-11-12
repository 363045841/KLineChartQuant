/**
 * BOS / CHoCH 检测单元测试。
 *
 * 重点：破位必须是**收盘**越过枢轴价（影线穿越不算）、未确认的枢轴不得参与判定、
 * BOS 与 CHoCH 按当前趋势归类。
 */
import { describe, expect, it } from 'vitest'
import { detectBreaks } from '../impl/breaks'
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

describe('detectBreaks', () => {
  it('收盘越过高点枢轴时产生向上破位，确认时刻等于破位 bar', () => {
    // 高点 15 在 index 2，lookback 1 → index 3 确认；index 4 收盘 16 越过。
    const bars = makeBars([
      { high: 11, low: 9, close: 10 },
      { high: 12, low: 10, close: 11 },
      { high: 15, low: 12, close: 14 },
      { high: 13, low: 11, close: 12 },
      { high: 17, low: 11, close: 16 },
    ])
    const pivots = detectPivots(bars, 1, 'swing')
    const breaks = detectBreaks(bars, pivots, 'swing')
    expect(breaks).toHaveLength(1)
    expect(breaks[0].direction).toBe('up')
    expect(breaks[0].barIndex).toBe(4)
    expect(breaks[0].confirmedBarIndex).toBe(4)
    expect(breaks[0].brokenPivot.price).toBe(15)
    expect(breaks[0].margin).toBe(1)
    expect(breaks[0].kind).toBe('choch')
  })

  it('影线穿越但收盘未越时不产生破位', () => {
    const bars = makeBars([
      { high: 11, low: 9, close: 10 },
      { high: 12, low: 10, close: 11 },
      { high: 15, low: 12, close: 14 },
      { high: 13, low: 11, close: 12 },
      { high: 18, low: 11, close: 14 },
    ])
    const pivots = detectPivots(bars, 1, 'swing')
    expect(detectBreaks(bars, pivots, 'swing')).toHaveLength(0)
  })

  it('枢轴未确认前不参与判定', () => {
    // 高点在 index 2，必须等到 index 3 才能确认；index 2 收盘就已越过也不算。
    const bars = makeBars([
      { high: 11, low: 9, close: 10 },
      { high: 12, low: 10, close: 11 },
      { high: 15, low: 12, close: 16 },
      { high: 17, low: 11, close: 12 },
    ])
    const pivots = detectPivots(bars, 1, 'swing')
    expect(detectBreaks(bars, pivots, 'swing')).toHaveLength(0)
  })

  it('首次破位记 CHoCH，其后同向记 BOS、反向记 CHoCH', () => {
    const bars = makeBars([
      { high: 11, low: 9, close: 10 },
      { high: 12, low: 10, close: 11 },
      { high: 15, low: 12, close: 14 }, // index 2：高点枢轴 15
      { high: 13, low: 11, close: 12 }, // index 3：确认
      { high: 17, low: 11, close: 16 }, // index 4：向上破位（首次 → CHoCH）
      { high: 18, low: 14, close: 17 }, // index 5：高点枢轴 18
      { high: 17, low: 13, close: 14 }, // index 6：确认
      { high: 16, low: 10, close: 11 }, // index 7：低点枢轴 10
      { high: 15, low: 9, close: 10 }, // index 8：确认
      { high: 14, low: 11, close: 12 }, // index 9
      { high: 13, low: 7, close: 8 }, // index 10：收盘 8 跌破低点枢轴 9（趋势向上 → CHoCH）
    ])
    const pivots = detectPivots(bars, 1, 'swing')
    const breaks = detectBreaks(bars, pivots, 'swing')
    expect(breaks.length).toBeGreaterThanOrEqual(2)
    expect(breaks[0].direction).toBe('up')
    expect(breaks[0].kind).toBe('choch')
    expect(breaks[1].direction).toBe('down')
    expect(breaks[1].kind).toBe('choch')
  })

  it('同向连续破位归类为 BOS', () => {
    const bars = makeBars([
      { high: 11, low: 9, close: 10 },
      { high: 12, low: 10, close: 11 },
      { high: 15, low: 12, close: 14 }, // 高点枢轴 15
      { high: 13, low: 11, close: 12 },
      { high: 17, low: 11, close: 16 }, // 向上破位（首次 CHoCH）
      { high: 18, low: 14, close: 17 }, // 高点枢轴 18，但 16 < 18 未破
      { high: 17, low: 15, close: 16 },
      { high: 16, low: 14, close: 15 },
      { high: 20, low: 15, close: 19 }, // 收盘 19 越过 18 → 同向 BOS
      { high: 21, low: 17, close: 18 },
      { high: 19, low: 16, close: 17 },
    ])
    const pivots = detectPivots(bars, 1, 'swing')
    const breaks = detectBreaks(bars, pivots, 'swing')
    const ups = breaks.filter((item) => item.direction === 'up')
    expect(ups.length).toBeGreaterThanOrEqual(2)
    expect(ups[0].kind).toBe('choch')
    expect(ups[1].kind).toBe('bos')
  })
})
