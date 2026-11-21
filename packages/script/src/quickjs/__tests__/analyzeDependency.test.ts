/** 依赖推断：验证无状态、有状态、验证依赖与默认有状态。 */
import { describe, expect, it } from 'vitest'
import { analyzeScriptDependency } from '../impl/analyzeDependency.js'

/** 生成一个最小指标脚本，只包含 onBar 内的计算。 */
function script(onBar: string, topLevel = ''): string {
  return `${topLevel}\ndefineIndicator({ version: 2, name:'T', position:Position.main, onBar(){${onBar}}})`
}

describe('analyzeScriptDependency', () => {
  it.each([
    {
      name: '简单指标按已知回看窗口收敛',
      source: script(`plot.Line(ta.sma(close, 20)[0], 'sma')`),
      expected: { kind: 'stateless', lookback: 19 },
    },
    {
      name: '递归指标按有状态处理',
      source: script(`plot.Line(ta.ema(close, 20)[0], 'ema')`),
      expected: { kind: 'stateful' },
    },
    {
      name: '顶层可变绑定按有状态处理',
      source: script(`sum += close[0]`, `let sum = 0`),
      expected: { kind: 'stateful' },
    },
    {
      name: '绘图 API 按有状态处理',
      source: script(`line.new({ x1: barIndex, y1: close[0], x2: barIndex + 1, y2: close[0] })`),
      expected: { kind: 'stateful' },
    },
    {
      name: '非常量历史偏移按无界回看',
      source: script(`plot.Line(close[i], 'close')`),
      expected: { kind: 'stateless', lookback: 'unbounded' },
    },
    {
      name: 'barIndex 属无界回看',
      source: script(`plot.Line(barIndex, 'index')`),
      expected: { kind: 'stateless', lookback: 'unbounded' },
    },
    {
      name: '计算辅助函数内部的递归同样有状态',
      source: `function average(source, length) { return ta.ema(source, length) }
defineIndicator({ version: 2, name:'T', position:Position.main, onBar(){ plot.Line(average(close, 20)[0], 'ema') } })`,
      expected: { kind: 'stateful' },
    },
    {
      name: 'pivot 左右窗口合并回看',
      source: script(`plot.Line(ta.pivothigh(high, 2, 3)[0], 'p')`),
      expected: { kind: 'stateless', lookback: 5 },
    },
    {
      name: '依赖库有状态时按有状态处理',
      source: script(`importLibrary('statefulLib').render()`),
      libraries: [{ name: 'statefulLib', source: 'let profileBars = []' }],
      expected: { kind: 'stateful' },
    },
  ])('$name', ({ source, libraries, expected }) => {
    expect(analyzeScriptDependency(source, libraries)).toEqual(expected)
  })
})
