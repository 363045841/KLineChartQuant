/** 警报输出：只有实时 bar 产生事件，指标脚本不能调用 alert()。 */
import { describe, expect, it } from 'vitest'
import { BACKENDS } from '../../__tests__/backends.js'
import { barsFromCloses } from '../../__tests__/marketData.js'

describe('脚本 alert 输出', () => {
  it.each(BACKENDS)('$name 只在实时 bar 产生事件', ({ prepare }) => {
    const script = prepare(`
      defineAlert({
        version: 2,
        name: 'AlertOutput',
        frequency: 'all',
        onBar() {
          if (close[0] >= 10) alert('reach ' + close[0])
        },
      })
    `)
    const bars = barsFromCloses([9, 10, 11])

    // 历史运行：整段都不是实时 bar，事件必须为空。
    expect(script.output(bars, {}, undefined, undefined, false).alerts).toEqual([])

    // 实时运行：只有最后一根 bar 允许产生事件。
    const live = script.output(bars, {}, undefined, undefined, true)
    expect(live.alerts).toHaveLength(1)
    expect(live.alerts[0]).toEqual({
      message: 'reach 11',
      barTime: bars[2]!.time,
      price: 11,
    })
  })

  it.each(BACKENDS)('$name 同一根 bar 可以产生多条事件', ({ prepare }) => {
    const script = prepare(`
      defineAlert({
        version: 2,
        name: 'AlertMany',
        frequency: 'all',
        onBar() {
          alert('first')
          alert('second')
        },
      })
    `)
    const result = script.output(barsFromCloses([10]), {}, undefined, undefined, true)
    expect(result.alerts.map((event) => event.message)).toEqual(['first', 'second'])
  })

  it.each(BACKENDS)('$name 指标脚本调用 alert() 直接报错', ({ prepare }) => {
    const script = prepare(`
      defineIndicator({
        version: 2,
        name: 'AlertInIndicator',
        position: Position.main,
        onBar() {
          alert('nope')
        },
      })
    `)
    expect(() => script.output(barsFromCloses([10]), {}, undefined, undefined, true)).toThrow(
      /defineAlert/,
    )
  })

  describe.each(BACKENDS)('$name 警报声明校验', ({ prepare }) => {
    it.each([
      ["frequency: 'all', onBar() {}", /alert\(\)/],
      ["onBar() { alert('event') }", /frequency/],
      ["frequency: 'tick', onBar() { alert('event') }", /frequency/],
      ["frequency: 'all', maxBoxesCount: 5, onBar() { alert('event') }", /maxBoxesCount/],
    ])('拒绝非法声明 %s', (fields, error) => {
      expect(() => prepare(`defineAlert({ version: 2, name: 'Example', ${fields} })`)).toThrow(error)
    })
  })
})

