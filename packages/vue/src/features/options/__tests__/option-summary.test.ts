// 期权解读句子的单元测试：数字要出现在句子里，缺数据时降级而不是拼出 undefined。

import { describe, expect, it } from 'vitest'
import {
  describeOptionLevels,
  describeVolatility,
  describeVolatilityStats,
} from '../impl/option-summary.js'
import { EMPTY_NEAR_TERM, sampleView } from './fixtures.js'

describe('describeVolatility', () => {
  it('拼出 IV 分位、24 小时变化与 P/C 变化', () => {
    const line = describeVolatility(
      sampleView({
        trend: {
          samples: 120,
          windowMs: 86_400_000,
          atmIv: { min: 28, max: 40, latest: 32.01, change: 2 },
          putCall: { min: 0.7, max: 1.2, latest: 0.918, change: -0.1 },
          atmIvPercentile: 41,
          atmIvChange24h: -1.25,
          putCallChange24h: 0.116,
        },
      }),
    )

    expect(line).toBe(
      '波动：ATM IV 32.0%（分位 41%，24h -1.25pp） | DTE 0.91 天 ' +
        '| ±1σ 66,133.48–68,349.85 | P/C 0.92（24h +0.116）',
    )
  })

  it('没有趋势时省略分位与变化，不补 0', () => {
    expect(describeVolatility(sampleView())).toBe(
      '波动：ATM IV 32.0% | DTE 0.91 天 | ±1σ 66,133.48–68,349.85 | P/C 0.92',
    )
  })

  it('没有波动数据时返回空串', () => {
    expect(describeVolatility(sampleView({ nearTerm: EMPTY_NEAR_TERM }))).toBe('')
  })
})

describe('describeOptionLevels', () => {
  it('拼出关键位、波动与 P/C 的关键数字', () => {
    const sentence = describeOptionLevels(sampleView())

    expect(sentence).toContain('BTC 现价 67,144.55')
    expect(sentence).toContain('Gamma 翻转 68,138.87')
    expect(sentence).toContain('下方')
    expect(sentence).toContain('负 gamma')
    expect(sentence).toContain('Put 墙 67,000')
    expect(sentence).toContain('Call 墙 69,000')
    // 主口径是 Γ 加权墙；OI 口径的 66,500 / 69,500 不应出现在这句里。
    expect(sentence).not.toContain('66,500')
    expect(sentence).not.toContain('69,500')
    expect(sentence).toContain('最大痛点 69,000')
    expect(sentence).toContain('ATM IV 32.0%')
    expect(sentence).toContain('DTE 0.91 天')
    expect(sentence).toContain('±1σ 66,133.48–68,349.85')
    expect(sentence).toContain('P/C 0.92')
  })

  it('现价在翻转位上方时读成正 gamma', () => {
    const sentence = describeOptionLevels(sampleView({ spotIndex: 70_000 }))

    expect(sentence).toContain('正 gamma')
    // 现价高于翻转位时，翻转位在现价「下方」，两个方向不能写成同一句。
    expect(sentence).toContain('Gamma 翻转 68,138.87 在下方')
  })

  it('没有现价时给出不可用提示', () => {
    expect(describeOptionLevels(sampleView({ spotIndex: null }))).toBe('期权数据暂不可用。')
  })

  it('缺翻转位与墙位时句子仍然完整，不出现 undefined', () => {
    const sentence = describeOptionLevels(
      sampleView({ gammaFlipUsd: null, nearTerm: { ...EMPTY_NEAR_TERM, atmIvPercent: 31 } }),
    )

    expect(sentence).toContain('本轮没有可用的 Gamma 翻转位')
    expect(sentence).toContain('ATM IV 31.0%')
    expect(sentence).not.toContain('undefined')
    expect(sentence).not.toContain('NaN')
  })
})

describe('describeVolatilityStats', () => {
  it('统计不可用与样本不足都明确说出来', () => {
    expect(describeVolatilityStats(null)).toBe('历史分位：统计不可用。')

    const weak = describeVolatilityStats({
      source: 'daily',
      stale: false,
      latestCapturedAt: 1_764_000_000_000,
      rv20: null,
      vrp: null,
      termStructure: null,
      skew25dVolPoints: null,
      skew25dExpiryIso: null,
      windows: [
        {
          windowDays: 30,
          sampleDays: 3,
          expectedDays: 30,
          ivLatest: 50,
          ivHigh: 60,
          ivLow: 40,
          ivRank: null,
          ivPercentile: null,
        },
      ],
    })
    expect(weak).toContain('30 天 分位不可用（样本 3/30 天）')
  })

  it('分位与 RV/VRP 同时给出，样本天数跟在窗口后面', () => {
    const line = describeVolatilityStats({
      source: 'daily',
      stale: true,
      latestCapturedAt: 1_764_000_000_000,
      rv20: 43.2,
      vrp: 3.4,
      termStructure: null,
      skew25dVolPoints: -5.07,
      skew25dExpiryIso: '2026-12-25',
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

    expect(line).toContain('30 天 IVR 68 / IVP 83（样本 6/30 天）')
    expect(line).toContain('RV20 43.2%')
    expect(line).toContain('VRP +3.4pp')
    expect(line).toContain('25Δ RR -5.1pp@2026-12-25')
    expect(line).toContain('样本已过期')
  })
})
