/**
 * 期权波动统计单元测试：IV Rank / IV Percentile 定义、样本阈值、RV20 与 VRP。
 */
import { describe, expect, it } from 'vitest'
import {
  computeOptionStats,
  ivPercentileOf,
  ivRankOf,
  OPTION_RV_WINDOW,
  type OptionStatSample,
  realizedVolatilityOf,
} from '../options/impl/stats'

/** 一天的毫秒数。 */
const DAY_MS = 86_400_000

/** 基准日：2026-11-01T00:00:00Z。 */
const BASE = Date.UTC(2026, 10, 1)

/**
 * 构造按天升序的样本。
 *
 * @param values 每天的平值 IV
 * @param spotStart 起始现货价
 * @param spotStep 每天的现货涨幅（比例）
 * @returns 样本列表
 */
function samplesOf(values: readonly number[], spotStart = 100, spotStep = 0): OptionStatSample[] {
  return values.map((atmIvPercent, index) => ({
    day: new Date(BASE + index * DAY_MS).toISOString().slice(0, 10),
    capturedAt: BASE + index * DAY_MS + 23 * 3_600_000,
    atmIvPercent,
    spotIndex: spotStart * (1 + spotStep) ** index,
  }))
}

describe('IV Rank 与 IV Percentile', () => {
  it('IV Rank 按窗口高低归一', () => {
    expect(ivRankOf(51.6, 55.1, 44)).toBeCloseTo(68.47, 2)
    expect(ivRankOf(65, 65, 40)).toBe(100)
    expect(ivRankOf(40, 65, 40)).toBe(0)
  })

  it('高低相同或缺失时 IV Rank 为 null', () => {
    expect(ivRankOf(50, 50, 50)).toBeNull()
    expect(ivRankOf(null, 50, 40)).toBeNull()
    expect(ivRankOf(50, null, 40)).toBeNull()
  })

  it('IV Percentile 用严格小于，样本全相同时为 0 而不是 50', () => {
    expect(ivPercentileOf([10, 20, 30], 20)).toBeCloseTo(33.33, 2)
    expect(ivPercentileOf([50, 50, 50], 50)).toBe(0)
    expect(ivPercentileOf([], 50)).toBeNull()
    expect(ivPercentileOf([10], null)).toBeNull()
  })
})

describe('RV20', () => {
  it('横盘序列的已实现波动为 0', () => {
    const closes = Array.from({ length: OPTION_RV_WINDOW + 1 }, () => 100)
    expect(realizedVolatilityOf(closes)).toBe(0)
  })

  it('样本不足时为 null', () => {
    expect(realizedVolatilityOf([100, 101])).toBeNull()
  })

  it('固定涨幅序列的收益方差为 0', () => {
    const closes = Array.from({ length: OPTION_RV_WINDOW + 1 }, (_, index) => 100 * 1.01 ** index)
    expect(realizedVolatilityOf(closes)).toBeCloseTo(0, 10)
  })
})

describe('computeOptionStats', () => {
  it('窗口内样本、IV Rank 与样本天数', () => {
    const samples = samplesOf([40, 45, 50, 55, 60, 65])
    const stats = computeOptionStats({
      samples,
      windows: [30, 90],
      source: 'daily',
      now: BASE + 6 * DAY_MS,
    })
    expect(stats.source).toBe('daily')
    expect(stats.windows).toHaveLength(2)
    const [month, quarter] = stats.windows
    expect(month?.windowDays).toBe(30)
    expect(month?.expectedDays).toBe(30)
    expect(month?.sampleDays).toBe(6)
    expect(month?.ivLatest).toBe(65)
    expect(month?.ivHigh).toBe(65)
    expect(month?.ivLow).toBe(40)
    expect(month?.ivRank).toBe(100)
    expect(month?.ivPercentile).toBeCloseTo(83.33, 2)
    expect(quarter?.windowDays).toBe(90)
    expect(quarter?.expectedDays).toBe(90)
    expect(quarter?.sampleDays).toBe(6)
    expect(quarter?.ivRank).toBe(100)
  })

  it('样本不足 5 天时不给分位，仍给出窗口高低', () => {
    const stats = computeOptionStats({
      samples: samplesOf([40, 50, 60]),
      windows: [30],
      source: 'daily',
      now: BASE + 3 * DAY_MS,
    })
    const [month] = stats.windows
    expect(month?.sampleDays).toBe(3)
    expect(month?.ivLow).toBe(40)
    expect(month?.ivHigh).toBe(60)
    expect(month?.ivRank).toBeNull()
    expect(month?.ivPercentile).toBeNull()
  })

  it('窗口只统计窗口期内的样本', () => {
    const samples = samplesOf([10, 10, 10, 90, 92])
    const stats = computeOptionStats({
      samples,
      windows: [2],
      source: 'daily',
      now: BASE + 5 * DAY_MS,
    })
    expect(stats.windows[0]?.sampleDays).toBe(2)
    expect(stats.windows[0]?.ivHigh).toBe(92)
    expect(stats.windows[0]?.ivLow).toBe(90)
  })

  it('VRP 等于最新平值 IV 减 RV20；样本不足时为 null', () => {
    const flat = computeOptionStats({
      samples: samplesOf([60, 61, 62]),
      windows: [30],
      source: 'daily',
      now: BASE + 3 * DAY_MS,
    })
    expect(flat.rv20).toBeNull()
    expect(flat.vrp).toBeNull()

    const daily = Array.from({ length: OPTION_RV_WINDOW + 1 }, () => 50)
    const enough = computeOptionStats({
      samples: samplesOf(daily),
      windows: [30],
      source: 'daily',
      now: BASE + daily.length * DAY_MS,
    })
    expect(enough.rv20).toBe(0)
    expect(enough.vrp).toBe(50)
  })

  it('最新样本超过 26 小时标记为 stale', () => {
    const samples = samplesOf([40, 45, 50, 55, 60, 65])
    const latestCapturedAt = samples[samples.length - 1]?.capturedAt ?? 0
    const fresh = computeOptionStats({
      samples,
      windows: [30],
      source: 'daily',
      now: latestCapturedAt + 12 * 3_600_000,
    })
    expect(fresh.stale).toBe(false)
    expect(fresh.latestCapturedAt).toBe(latestCapturedAt)
    const old = computeOptionStats({
      samples,
      windows: [30],
      source: 'daily',
      now: latestCapturedAt + 30 * 3_600_000,
    })
    expect(old.stale).toBe(true)
  })

  it('期限结构与偏斜跟着最新样本行走，缺失时为 null', () => {
    const samples = samplesOf([40, 45, 50, 55, 60, 65])
    const stats = computeOptionStats({
      samples,
      windows: [30],
      source: 'daily',
      now: BASE + 6 * DAY_MS,
      structure: {
        expiries: [{ expiryIso: '2026-12-25', dteDays: 38.8, atmIvPercent: 38.25 }],
        skew25dVolPoints: -5.07,
        skew25dExpiryIso: '2026-12-25',
      },
    })
    expect(stats.termStructure).toEqual([
      { expiryIso: '2026-12-25', dteDays: 38.8, atmIvPercent: 38.25 },
    ])
    expect(stats.skew25dVolPoints).toBe(-5.07)
    expect(stats.skew25dExpiryIso).toBe('2026-12-25')

    const legacy = computeOptionStats({ samples, windows: [30], source: 'daily', now: BASE })
    expect(legacy.termStructure).toBeNull()
    expect(legacy.skew25dVolPoints).toBeNull()
    expect(legacy.skew25dExpiryIso).toBeNull()
  })

  it('没有样本时各字段为 null，来源原样带回', () => {
    const stats = computeOptionStats({ samples: [], windows: [30], source: 'none', now: BASE })
    expect(stats.source).toBe('none')
    expect(stats.stale).toBe(true)
    expect(stats.latestCapturedAt).toBeNull()
    expect(stats.rv20).toBeNull()
    expect(stats.vrp).toBeNull()
    expect(stats.termStructure).toBeNull()
    expect(stats.skew25dVolPoints).toBeNull()
    expect(stats.windows[0]?.sampleDays).toBe(0)
    expect(stats.windows[0]?.ivRank).toBeNull()
  })
})
