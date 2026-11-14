// 期权序列解析的单元测试：结构不对要返回 null，字段缺失要降级成 null 而不是崩掉。

import { describe, expect, it } from 'vitest'
import { parseOptionSeries } from '../impl/parse-option-series.js'

/**
 * 造一行结构完整的快照。
 *
 * @returns 服务端原始值
 */
function sampleRow(): Record<string, unknown> {
  return {
    schemaVersion: 2,
    currency: 'BTC',
    capturedAt: 1_764_000_000_000,
    spotIndex: 67_144.55,
    nearTerm: {
      gammaFlipUsd: 68_138.87,
      callWall: { strike: 69_500, openInterest: 299.7 },
      putWall: { strike: 66_500, openInterest: 328.3 },
      callGammaWall: { strike: 69_000, gammaWeight: 1.2e-5 },
      putGammaWall: { strike: 67_000, gammaWeight: 1.4e-5 },
      maxPainUsd: 69_000,
      netGexUsdPerPercent: -9_332_737.7,
      putCallOiRatio: 0.918,
      totalOpenInterest: 3650.8,
      contractCount: 30,
      expiryIso: '2026-11-15',
      dteDays: 0.91,
      atmIvPercent: 32.01,
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
