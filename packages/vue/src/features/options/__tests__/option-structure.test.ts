// 结构判断的单元测试：基调、走廊、注意事项三行都要说对，且不能越界成买卖建议。
//
// 用当前真实场景做基准：现价 65,327、翻转位 68,563（负 gamma）、
// Put Γ 墙 65,000、Call Γ 墙 73,000、Put OI 墙 70,000。

import { describe, expect, it } from 'vitest'
import { describeOptionStructure } from '../impl/option-structure.js'
import type { OptionPanelView } from '../types.js'
import { sampleView } from './fixtures.js'

/**
 * 造一份贴近真实快照的视图。
 *
 * @param overrides 覆盖项
 * @returns 面板视图
 */
function realView(overrides: Partial<OptionPanelView> = {}) {
  return sampleView({
    spotIndex: 65_180,
    gammaFlipUsd: 68_563,
    nearTerm: {
      ...sampleView().nearTerm,
      gammaFlipUsd: 68_563,
      putGammaWall: { strike: 65_000, gammaWeight: 0.1071 },
      callGammaWall: { strike: 73_000, gammaWeight: 0.0651 },
      putWall: { strike: 70_000, openInterest: 1_843 },
      callWall: { strike: 76_000, openInterest: 3_154 },
      maxPainUsd: 73_000,
      netGexUsdPerPercent: -10_910_000,
      dteDays: 5.5,
      putCallOiRatio: 0.54,
    },
    ...overrides,
  })
}

describe('describeOptionStructure', () => {
  it('负 gamma 时报出基调、走廊与两个口径的错位', () => {
    const reading = describeOptionStructure(realView())

    expect(reading.bias).toContain('在翻转位 68,563 下方')
    expect(reading.bias).toContain('负 gamma · 顺势放大')
    expect(reading.bias).toContain('净 GEX -10.9M')
    expect(reading.bias).toContain('DTE 5.5 天')
    expect(reading.zones).toContain('下方紧贴 Put 对冲带 65,000')
    expect(reading.zones).toContain('上方 反转界 68,563')
    expect(reading.zones).toContain('远端 Call 对冲带 73,000')
    expect(reading.watch.join('|')).toContain('Put 两条墙相差')
  })

  it('现价在翻转位上方时报正 gamma 与均值回归', () => {
    const reading = describeOptionStructure(
      realView({ spotIndex: 70_000, gammaFlipUsd: 68_563 }),
    )

    expect(reading.bias).toContain('上方 2.05%')
    expect(reading.bias).toContain('正 gamma · 均值回归')
    expect(reading.zones).toContain('下方 反转界 68,563')
    expect(reading.zones).toContain('Call 对冲带 73,000')
  })

  it('现价贴着对冲带时提示破位风险', () => {
    const reading = describeOptionStructure(realView({ spotIndex: 65_030 }))

    expect(reading.watch.join('|')).toContain('对冲流最集中')
    expect(reading.watch.join('|')).toContain('破位后波动容易加速')
  })

  it('临近到期时提示结算磁吸', () => {
    const reading = describeOptionStructure(
      sampleView({
        nearTerm: { ...sampleView().nearTerm, dteDays: 0.4 },
      }),
    )

    expect(reading.watch.join('|')).toContain('临近到期')
    expect(reading.watch.join('|')).toContain('结算磁吸增强')
  })

  it('持仓与敞口方向相反时点出两个口径在打架', () => {
    const reading = describeOptionStructure(
      sampleView({
        nearTerm: {
          ...sampleView().nearTerm,
          putCallOiRatio: 1.2,
          netGexUsdPerPercent: 5_000_000,
        },
      }),
    )

    expect(reading.watch.join('|')).toContain('方向不一致')
    expect(reading.watch.join('|')).toContain('两个口径在打架')
  })

  it('没有翻转位时退回墙位口径', () => {
    const reading = describeOptionStructure(sampleView({ gammaFlipUsd: null }))

    expect(reading.bias).toContain('没有可用的翻转位')
    expect(reading.bias).toContain('只能按墙位看结构')
    expect(reading.zones).not.toContain('反转界')
  })

  it('没有现价时给出不可用提示', () => {
    const reading = describeOptionStructure(sampleView({ spotIndex: null }))

    expect(reading.bias).toBe('期权数据暂不可用。')
    expect(reading.zones).toBe('')
    expect(reading.watch).toEqual([])
  })

  it('注意事项最多三条', () => {
    const reading = describeOptionStructure(realView({ spotIndex: 65_030 }))

    expect(reading.watch.length).toBeLessThanOrEqual(3)
  })
})
