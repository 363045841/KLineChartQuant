/**
 * 成交量分布的计算、分段与目录登记用例。
 *
 * 覆盖：成交量摊分守恒、上涨/下跌拆分、POC 与价值区边界、阶段切分（K 线/日/周/月、时区、合并、上限），
 * 以及两个指标在「添加指标」目录中的主图身份与参数暴露。
 */
import { describe, expect, it } from 'vitest'
import type { KLineData } from '../../../../foundation/types/price.js'
import { loadSystemIndicators } from '../../../indicators/registerBuiltins.js'
import { allIndicators } from '../../Indicator/indicatorCatalog.js'
import { buildVolumeProfile } from '../impl/build.js'
import { resolveVolumeProfileSlices } from '../impl/period.js'
import { MAX_PROFILE_SLICES } from '../types.js'

/** 构造一根 K 线。 */
function bar(
  timestamp: number,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number,
): KLineData {
  return { timestamp, open, high, low, close, volume }
}

/** UTC 时间戳。 */
function utc(year: number, month: number, day: number, hour = 0): number {
  return Date.UTC(year, month - 1, day, hour)
}

describe('buildVolumeProfile', () => {
  it('把成交量按价格重叠摊分并在总量上守恒', () => {
    const bars = [bar(1, 10, 12, 10, 12, 100), bar(2, 12, 14, 12, 13, 60)]
    const profile = buildVolumeProfile(bars, 0, 1, 4, 70)
    expect(profile).not.toBeNull()
    const total = profile?.levels.reduce((sum, level) => sum + level.totalVolume, 0) ?? 0
    expect(total).toBeCloseTo(160, 6)
  })

  it('收盘不低于开盘记为上涨量，否则记为下跌量', () => {
    const bars = [bar(1, 10, 11, 10, 11, 80), bar(2, 11, 11, 10, 10, 20)]
    const profile = buildVolumeProfile(bars, 0, 1, 2, 70)
    const up = profile?.levels.reduce((sum, level) => sum + level.upVolume, 0) ?? 0
    const down = profile?.levels.reduce((sum, level) => sum + level.downVolume, 0) ?? 0
    expect(up).toBeCloseTo(80, 6)
    expect(down).toBeCloseTo(20, 6)
  })

  it('POC 落在成交量最大的价位桶，且价值区覆盖目标占比', () => {
    const bars = [
      bar(1, 100, 101, 100, 101, 500),
      bar(2, 101, 110, 101, 110, 50),
      bar(3, 110, 111, 110, 111, 20),
    ]
    const profile = buildVolumeProfile(bars, 0, 2, 10, 70)
    expect(profile).not.toBeNull()
    if (!profile) return
    const pocLevel = profile.levels.find(
      (level) =>
        profile.pointOfControl >= level.priceLow && profile.pointOfControl <= level.priceHigh,
    )
    const maxVolume = Math.max(...profile.levels.map((level) => level.totalVolume))
    expect(pocLevel?.totalVolume).toBeCloseTo(maxVolume, 6)
    const inside = profile.levels
      .filter(
        (level) => level.priceHigh > profile.valueAreaLow && level.priceLow < profile.valueAreaHigh,
      )
      .reduce((sum, level) => sum + level.totalVolume, 0)
    expect(inside / profile.totalVolume).toBeGreaterThanOrEqual(0.7)
  })

  it('价格区间退化或没有成交量时返回 null', () => {
    expect(buildVolumeProfile([bar(1, 10, 10, 10, 10, 5)], 0, 0, 4, 70)).toBeNull()
    expect(buildVolumeProfile([bar(1, 10, 11, 10, 11, 0)], 0, 0, 4, 70)).toBeNull()
    expect(buildVolumeProfile([], 0, 0, 4, 70)).toBeNull()
  })
})

describe('resolveVolumeProfileSlices', () => {
  const bars = [
    bar(utc(2024, 1, 1, 0), 10, 11, 9, 10, 1),
    bar(utc(2024, 1, 1, 1), 10, 11, 9, 10, 1),
    bar(utc(2024, 1, 2, 0), 10, 11, 9, 10, 1),
  ]

  it('按 K 线根数切分', () => {
    expect(resolveVolumeProfileSlices(bars, 'candle', 2, 'UTC')).toEqual([
      { startIndex: 0, endIndex: 1 },
      { startIndex: 2, endIndex: 2 },
    ])
  })

  it('按交易日切分并遵循会话时区', () => {
    expect(resolveVolumeProfileSlices(bars, 'day', 1, 'UTC')).toEqual([
      { startIndex: 0, endIndex: 1 },
      { startIndex: 2, endIndex: 2 },
    ])
    // 2023-12-31T18:00Z 与 20:00Z 在 UTC+8 属同一天（2024-01-01）。
    const shanghai = [
      bar(utc(2023, 12, 31, 18), 10, 11, 9, 10, 1),
      bar(utc(2023, 12, 31, 20), 10, 11, 9, 10, 1),
    ]
    expect(resolveVolumeProfileSlices(shanghai, 'day', 1, 'Asia/Shanghai')).toEqual([
      { startIndex: 0, endIndex: 1 },
    ])
  })

  it('按自然周（周一为界）与自然月切分', () => {
    const weekly = [bar(utc(2024, 1, 5), 10, 11, 9, 10, 1), bar(utc(2024, 1, 8), 10, 11, 9, 10, 1)]
    expect(resolveVolumeProfileSlices(weekly, 'week', 1, 'UTC')).toEqual([
      { startIndex: 0, endIndex: 0 },
      { startIndex: 1, endIndex: 1 },
    ])
    const monthly = [
      bar(utc(2024, 1, 31), 10, 11, 9, 10, 1),
      bar(utc(2024, 2, 1), 10, 11, 9, 10, 1),
    ]
    expect(resolveVolumeProfileSlices(monthly, 'month', 1, 'UTC')).toEqual([
      { startIndex: 0, endIndex: 0 },
      { startIndex: 1, endIndex: 1 },
    ])
  })

  it('阶段数量大于 1 时合并相邻阶段', () => {
    const merged = resolveVolumeProfileSlices(bars, 'day', 2, 'UTC')
    expect(merged).toEqual([{ startIndex: 0, endIndex: 2 }])
  })

  it('段数超过上限时只保留最近的段', () => {
    const many = Array.from({ length: MAX_PROFILE_SLICES + 20 }, (_, index) =>
      bar(utc(2024, 1, 1) + index * 3_600_000, 10, 11, 9, 10, 1),
    )
    const slices = resolveVolumeProfileSlices(many, 'candle', 1, 'UTC')
    expect(slices).toHaveLength(MAX_PROFILE_SLICES)
    expect(slices[slices.length - 1]?.endIndex).toBe(many.length - 1)
  })
})

describe('indicator catalog entry', () => {
  it('SVP 与 PVP 以主图指标身份出现，并暴露阶段与样式参数', async () => {
    await loadSystemIndicators()
    const entries = allIndicators().filter((item) => item.id === 'SVP' || item.id === 'PVP')
    expect(entries.map((item) => item.id).sort()).toEqual(['PVP', 'SVP'])
    expect(entries.every((item) => item.pane === 'main')).toBe(true)

    const pvp = entries.find((item) => item.id === 'PVP')
    const periodUnit = pvp?.params?.find((param) => param.key === 'periodUnit')
    expect(periodUnit?.type).toBe('select')
    expect(periodUnit?.options?.map((option) => option.label)).toEqual(['K线', '天', '周', '月'])
    expect(pvp?.params?.some((param) => param.key === 'boxWidthPercent')).toBe(true)

    const svp = entries.find((item) => item.id === 'SVP')
    expect(svp?.params?.some((param) => param.key === 'periodUnit')).toBe(false)
  })
})
