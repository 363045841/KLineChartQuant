/** 时间范围预置的纯函数契约：窗口解析、周期挑选、帧拟合与高亮匹配。 */
import { describe, expect, it } from 'vitest'

import { KLinePeriod } from '../../../data/provider/types.js'
import { LATEST_RIGHT_MARGIN_BARS } from '../../scale/impl/scale_X/scaleXStrategies.js'
import {
  coarsestPeriod,
  indexAtOrAfter,
  indexAtOrBefore,
  matchActiveRangePreset,
  pickRangePeriod,
  resolveRangeWindow,
  resolveWindowFrame,
} from '../rangePreset.js'

const DAY = 86_400_000

/** 最近 `count` 天的日线时间戳。 */
function dailyBars(count: number, end: number): { timestamp: number }[] {
  return Array.from({ length: count }, (_, index) => ({
    timestamp: end - (count - 1 - index) * DAY,
  }))
}

describe('resolveRangeWindow', () => {
  it.each([
    ['1D', DAY],
    ['1M', 30 * DAY],
    ['5Y', 5 * 365 * DAY],
  ] as const)('ends on the newest bar and spans back by the preset length (%s)', (preset, span) => {
    const bars = dailyBars(2000, Date.UTC(2026, 10, 20))
    const last = bars.at(-1)!.timestamp
    expect(resolveRangeWindow(preset, bars, 'UTC')).toEqual({ from: last - span, to: last })
  })

  it('clamps the start to the first loaded bar', () => {
    const bars = dailyBars(10, Date.UTC(2026, 10, 20))
    const window = resolveRangeWindow('1Y', bars, 'UTC')
    expect(window?.from).toBe(bars[0]!.timestamp)
  })

  it('starts YTD at local January 1st of the display timezone', () => {
    const last = Date.UTC(2026, 10, 20, 12)
    const bars = [{ timestamp: last - 400 * DAY }, { timestamp: last }]
    const shanghai = resolveRangeWindow('YTD', bars, 'Asia/Shanghai')
    const utc = resolveRangeWindow('YTD', bars, 'UTC')
    expect(shanghai?.from).toBe(Date.UTC(2025, 11, 31, 16))
    expect(utc?.from).toBe(Date.UTC(2026, 0, 1))
  })

  it('returns the whole loaded range for ALL and null without data', () => {
    const bars = dailyBars(5, Date.UTC(2026, 10, 20))
    expect(resolveRangeWindow('ALL', bars, 'UTC')).toEqual({
      from: bars[0]!.timestamp,
      to: bars.at(-1)!.timestamp,
    })
    expect(resolveRangeWindow('1M', [], 'UTC')).toBeNull()
  })
})

describe('pickRangePeriod', () => {
  const supported = Object.values(KLinePeriod)
  const DAY = 86_400_000

  it.each([
    ['1 day', DAY, KLinePeriod.Min5],
    ['7 days', 7 * DAY, KLinePeriod.Min15],
    ['1 month', 30 * DAY, KLinePeriod.Min60],
    ['3 months', 90 * DAY, KLinePeriod.Hour4],
    ['YTD in November', 326 * DAY, KLinePeriod.Daily],
    ['1 year', 365 * DAY, KLinePeriod.Daily],
    ['5 years', 5 * 365 * DAY, KLinePeriod.Weekly],
  ])('picks the finest readable period for %s', (_label, span, expected) => {
    expect(pickRangePeriod(supported, span)).toBe(expected)
  })

  it('falls back to the coarsest supported period when nothing fits', () => {
    expect(pickRangePeriod([KLinePeriod.Min1, KLinePeriod.Min5], 5 * 365 * DAY)).toBe(
      KLinePeriod.Min5,
    )
  })

  it('rejects a window without a positive span', () => {
    expect(pickRangePeriod(supported, 0)).toBeNull()
  })
})

describe('coarsestPeriod', () => {
  it('returns the coarsest supported period regardless of order', () => {
    expect(coarsestPeriod([KLinePeriod.Daily, KLinePeriod.Min5, KLinePeriod.Weekly])).toBe(
      KLinePeriod.Weekly,
    )
  })

  it('returns null without supported periods', () => {
    expect(coarsestPeriod([])).toBeNull()
  })
})

describe('resolveWindowFrame', () => {
  const config = {
    plotWidth: 1000,
    gapRatio: 0.1,
    minKWidth: 1,
    maxKWidth: 200,
    zoomLevelCount: 80,
  }

  it('fits the window plus the right margin into the plot width', () => {
    const frame = resolveWindowFrame({ ...config, startIndex: 20, barCount: 100 })
    const totalSlots = 100 + LATEST_RIGHT_MARGIN_BARS + 0.5
    const step = config.plotWidth / totalSlots
    const expectedKWidth = step / (1 + config.gapRatio)
    const expectedLevel =
      1 +
      ((expectedKWidth - config.minKWidth) / (config.maxKWidth - config.minKWidth)) *
        (config.zoomLevelCount - 1)
    expect(frame?.level).toBeCloseTo(expectedLevel, 8)
    expect(frame?.anchorSlot).toBe(19.5)
  })

  it('clamps the width to the configured limits', () => {
    const tight = resolveWindowFrame({
      ...config,
      plotWidth: 100_000,
      startIndex: 0,
      barCount: 1,
    })
    expect(tight?.level).toBe(config.zoomLevelCount)
    const wide = resolveWindowFrame({ ...config, startIndex: 0, barCount: 100_000 })
    expect(wide?.level).toBe(1)
  })

  it('rejects invalid geometry and empty windows', () => {
    expect(resolveWindowFrame({ ...config, plotWidth: 0, startIndex: 0, barCount: 10 })).toBeNull()
    expect(resolveWindowFrame({ ...config, startIndex: 0, barCount: 0 })).toBeNull()
  })
})

describe('matchActiveRangePreset', () => {
  const bars = dailyBars(400, Date.UTC(2026, 10, 20))
  const total = bars.length

  it('matches the preset whose start sits on the visible left edge', () => {
    const window = resolveRangeWindow('1M', bars, 'UTC')!
    const from = indexAtOrAfter(bars, window.from)!
    expect(
      matchActiveRangePreset({ bars, visibleFrom: from, visibleTo: total, timeZone: 'UTC' }),
    ).toBe('1M')
    // 渲染区间左右各扩一根，命中判定必须容忍这份扩窗。
    expect(
      matchActiveRangePreset({ bars, visibleFrom: from - 2, visibleTo: total, timeZone: 'UTC' }),
    ).toBe('1M')
  })

  it('does not match once the view leaves the newest bar', () => {
    const window = resolveRangeWindow('1M', bars, 'UTC')!
    const from = indexAtOrAfter(bars, window.from)!
    expect(
      matchActiveRangePreset({ bars, visibleFrom: from, visibleTo: total - 5, timeZone: 'UTC' }),
    ).toBeNull()
  })

  it('matches ALL on the full loaded range', () => {
    expect(
      matchActiveRangePreset({ bars, visibleFrom: 0, visibleTo: total, timeZone: 'UTC' }),
    ).toBe('ALL')
  })

  it('returns null when the window matches no preset', () => {
    expect(
      matchActiveRangePreset({ bars, visibleFrom: 137, visibleTo: total, timeZone: 'UTC' }),
    ).toBeNull()
  })
})

describe('index helpers', () => {
  const bars = dailyBars(3, 10 * DAY)

  it.each([
    ['after', indexAtOrAfter, bars[1]!.timestamp - 1, 1],
    ['after (out of range)', indexAtOrAfter, 100 * DAY, null],
    ['before', indexAtOrBefore, bars[1]!.timestamp + 1, 1],
    ['before (out of range)', indexAtOrBefore, 0, null],
  ] as const)('finds the %s bar', (_label, lookup, timestamp, expected) => {
    expect(lookup(bars, timestamp)).toBe(expected)
  })
})
