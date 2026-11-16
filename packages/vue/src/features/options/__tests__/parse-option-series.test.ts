// 期权序列解析的单元测试：结构不对要返回 null，字段缺失要降级成 null 而不是崩掉。

import { describe, expect, it } from 'vitest'
import { parseOptionSeries, parseOptionStats } from '../impl/parse-option-series.js'

/** 序列一行里与波动上下文相关的覆盖项。 */
interface RowOverrides {
  readonly capturedAt?: number
  readonly atmIv?: number
  readonly putCall?: number
}

/**
 * 造一行结构完整的快照。
 *
 * @param overrides 覆盖采集时刻与近月波动字段
 * @returns 服务端原始值
 */
function sampleRow(overrides: RowOverrides = {}): Record<string, unknown> {
  return {
    schemaVersion: 2,
    currency: 'BTC',
    capturedAt: overrides.capturedAt ?? 1_764_000_000_000,
    spotIndex: 67_144.55,
    nearTerm: {
      gammaFlipUsd: 68_138.87,
      callWall: { strike: 69_500, openInterest: 299.7 },
      putWall: { strike: 66_500, openInterest: 328.3 },
      callGammaWall: { strike: 69_000, gammaWeight: 1.2e-5 },
      putGammaWall: { strike: 67_000, gammaWeight: 1.4e-5 },
      maxPainUsd: 69_000,
      netGexUsdPerPercent: -9_332_737.7,
      putCallOiRatio: overrides.putCall ?? 0.918,
      totalOpenInterest: 3650.8,
      contractCount: 30,
      expiryIso: '2026-11-15',
      dteDays: 0.91,
      atmIvPercent: overrides.atmIv ?? 32.01,
      sigmaLowerUsd: 66_133.48,
      sigmaUpperUsd: 68_349.85,
      sigma2LowerUsd: 65_025.3,
      sigma2UpperUsd: 69_458.03,
    },
    allChain: {
      gammaFlipUsd: 71_805.09,
      callWall: { strike: 80_000, openInterest: 11_293 },
      putWall: { strike: 60_000, openInterest: 9_874 },
      callGammaWall: { strike: 73_000, gammaWeight: 2.1e-4 },
      putGammaWall: { strike: 68_000, gammaWeight: 1.9e-4 },
      maxPainUsd: 75_000,
      netGexUsdPerPercent: -106_802_263.6,
      putCallOiRatio: 0.749,
      totalOpenInterest: 277_820.3,
      contractCount: 87,
    },
    gammaFlip: { gammaFlipUsd: 68_138.87, source: 'near-term' },
  }
}

describe('parseOptionSeries', () => {
  it('取最后一行并解析出两套视图与主图翻转位', () => {
    const view = parseOptionSeries({ currency: 'BTC', days: ['2026-11-14'], rows: [sampleRow()] })

    expect(view?.currency).toBe('BTC')
    expect(view?.spotIndex).toBe(67_144.55)
    expect(view?.nearTerm.gammaFlipUsd).toBe(68_138.87)
    expect(view?.nearTerm.callWall?.strike).toBe(69_500)
    expect(view?.nearTerm.putWall?.openInterest).toBe(328.3)
    expect(view?.nearTerm.callGammaWall?.strike).toBe(69_000)
    expect(view?.nearTerm.putGammaWall?.gammaWeight).toBe(1.4e-5)
    expect(view?.nearTerm.atmIvPercent).toBe(32.01)
    expect(view?.allChain.putCallOiRatio).toBe(0.749)
    expect(view?.gammaFlipUsd).toBe(68_138.87)
    expect(view?.gammaFlipSource).toBe('near-term')
  })

  it('多行时只取最后一行的快照', () => {
    const early = { ...sampleRow(), capturedAt: 1_764_000_000_000, spotIndex: 1 }
    const late = { ...sampleRow(), capturedAt: 1_764_000_060_000, spotIndex: 2 }

    const view = parseOptionSeries({ rows: [early, late] })

    expect(view?.capturedAt).toBe(1_764_000_060_000)
    expect(view?.spotIndex).toBe(2)
  })

  it('只有一行时波动上下文的区间为空', () => {
    const view = parseOptionSeries({ rows: [sampleRow()] })

    expect(view?.trend).toMatchObject({
      samples: 1,
      windowMs: 0,
      atmIv: null,
      putCall: null,
      atmIvPercentile: null,
      atmIvChange24h: null,
      putCallChange24h: null,
    })
  })

  it('多行时用整段序列算出波动上下文', () => {
    const latest = 1_764_000_000_000
    const day = 86_400_000
    const rows = [
      sampleRow({ capturedAt: latest - 2 * day, atmIv: 28, putCall: 1.4 }),
      sampleRow({ capturedAt: latest - day, atmIv: 30, putCall: 1.2 }),
      sampleRow({ capturedAt: latest, atmIv: 34, putCall: 0.8 }),
    ]

    const view = parseOptionSeries({ rows })
    const trend = view?.trend

    expect(trend?.samples).toBe(3)
    expect(trend?.windowMs).toBe(2 * day)
    expect(trend?.atmIv).toMatchObject({ min: 28, max: 34, latest: 34 })
    expect(trend?.atmIv?.change).toBeCloseTo(6, 6)
    expect(trend?.putCall).toMatchObject({ min: 0.8, max: 1.4, latest: 0.8 })
    expect(trend?.putCall?.change).toBeCloseTo(-0.6, 6)
    expect(trend?.atmIvPercentile).toBe(100)
    expect(trend?.atmIvChange24h).toBeCloseTo(4, 6)
    expect(trend?.putCallChange24h).toBeCloseTo(-0.4, 6)
  })

  it('结构不符时返回 null', () => {
    expect(parseOptionSeries(null)).toBeNull()
    expect(parseOptionSeries({ rows: [] })).toBeNull()
    expect(parseOptionSeries({ rows: [{}] })).toBeNull()
    expect(parseOptionSeries({ rows: ['x'] })).toBeNull()
  })

  it('嵌套字段缺失时降级成 null，不抛错', () => {
    const view = parseOptionSeries({
      rows: [{ currency: 'ETH', capturedAt: 1_764_000_000_000, gammaFlipUsd: 1_900 }],
    })

    expect(view).not.toBeNull()
    expect(view?.spotIndex).toBeNull()
    expect(view?.nearTerm.callWall).toBeNull()
    expect(view?.nearTerm.atmIvPercent).toBeNull()
    expect(view?.allChain.contractCount).toBeNull()
    // 顶层扁平字段是老结构，作为兜底读取
    expect(view?.gammaFlipUsd).toBe(1_900)
    expect(view?.gammaFlipSource).toBeNull()
  })

  it('墙位缺行权价或持仓时整条作废', () => {
    const row = sampleRow()
    row.nearTerm = { ...(row.nearTerm as Record<string, unknown>), callWall: { strike: 69_000 } }

    const view = parseOptionSeries({ rows: [row] })

    expect(view?.nearTerm.callWall).toBeNull()
    expect(view?.nearTerm.putWall?.strike).toBe(66_500)
  })
})

describe('parseOptionStats', () => {
  /** 一份结构完整的统计响应。 */
  const statsPayload = () => ({
    currency: 'BTC',
    source: 'daily',
    stale: false,
    latestCapturedAt: 1_763_913_600_000,
    rv20: 43.2,
    vrp: 3.4,
    termStructure: null,
    skew25dVolPoints: null,
    windows: [
      {
        windowDays: 30,
        sampleDays: 6,
        expectedDays: 30,
        ivLatest: 51.6,
        ivHigh: 55.1,
        ivLow: 44,
        ivRank: 68.47,
        ivPercentile: 83.33,
      },
    ],
  })

  it('解析窗口、样本天数与 RV/VRP', () => {
    const stats = parseOptionStats(statsPayload())

    expect(stats?.source).toBe('daily')
    expect(stats?.stale).toBe(false)
    expect(stats?.rv20).toBe(43.2)
    expect(stats?.vrp).toBe(3.4)
    expect(stats?.windows[0]?.sampleDays).toBe(6)
    expect(stats?.windows[0]?.ivRank).toBe(68.47)
    expect(stats?.termStructure).toBeNull()
  })

  it('分位字段可以是 null，不当作结构错误', () => {
    const payload = {
      ...statsPayload(),
      windows: [{ ...statsPayload().windows[0], ivRank: null, ivPercentile: null }],
    }

    const stats = parseOptionStats(payload)

    expect(stats?.windows[0]?.ivRank).toBeNull()
    expect(stats?.windows[0]?.sampleDays).toBe(6)
  })

  it('期限结构按到期点解析', () => {
    const payload = {
      ...statsPayload(),
      termStructure: [{ expiryIso: '2026-11-20', dteDays: 4, atmIvPercent: 46.2 }],
    }

    const stats = parseOptionStats(payload)

    expect(stats?.termStructure).toEqual([
      { expiryIso: '2026-11-20', dteDays: 4, atmIvPercent: 46.2 },
    ])
  })

  it('25Δ 偏斜带到期日，缺失时为 null', () => {
    const withSkew = parseOptionStats({
      ...statsPayload(),
      skew25dVolPoints: -5.07,
      skew25dExpiryIso: '2026-12-25',
    })

    expect(withSkew?.skew25dVolPoints).toBe(-5.07)
    expect(withSkew?.skew25dExpiryIso).toBe('2026-12-25')
    expect(parseOptionStats(statsPayload())?.skew25dExpiryIso).toBeNull()
  })

  it('结构不对时返回 null', () => {
    expect(parseOptionStats(null)).toBeNull()
    expect(parseOptionStats({})).toBeNull()
    expect(parseOptionStats({ source: 'monthly', stale: false, windows: [] })).toBeNull()
    expect(parseOptionStats({ source: 'daily', windows: [] })).toBeNull()
    expect(
      parseOptionStats({ source: 'daily', stale: false, windows: [{ windowDays: 30 }] }),
    ).toBeNull()
  })
})
