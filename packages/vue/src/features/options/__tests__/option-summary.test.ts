// 期权解读句子的单元测试：数字要出现在句子里，缺数据时降级而不是拼出 undefined。

import { describe, expect, it } from 'vitest'
import { describeOptionLevels } from '../impl/option-summary.js'
import { EMPTY_NEAR_TERM, sampleView } from './fixtures.js'

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
