/** 依赖推断：能证明无状态才算无状态，证明不了默认有状态。 */
import { describe, expect, it } from 'vitest'
import { analyzeScriptDependency } from '../impl/analyzeDependency.js'

/** 包一层最小指标声明，只关心 onBar 内的计算。 */
function script(onBar: string, topLevel = ''): string {
  return `${topLevel}\ndefineIndicator({ name:'T', position:Position.Main, onBar(){${onBar}}})`
}

describe('analyzeScriptDependency', () => {
  it('窗口指标按字面量长度折算回看深度', () => {
    expect(analyzeScriptDependency(script(`plot.Line(ta.sma(close, 20)[0], 'sma')`))).toEqual({
      kind: 'stateless',
      lookback: 19,
    })
  })

  it('递归指标按有状态处理', () => {
    expect(analyzeScriptDependency(script(`plot.Line(ta.ema(close, 20)[0], 'ema')`))).toEqual({
      kind: 'stateful',
    })
  })

  it('顶层可变绑定按有状态处理', () => {
    expect(analyzeScriptDependency(script(`sum += close[0]`, `let sum = 0`))).toEqual({
      kind: 'stateful',
    })
  })

  it('绘图 API 按有状态处理', () => {
    expect(
      analyzeScriptDependency(
        script(`line.new({ x1: bar_index, y1: close[0], x2: bar_index + 1, y2: close[0] })`),
      ),
    ).toEqual({ kind: 'stateful' })
  })

  it('非常量历史偏移按无界回看处理', () => {
    expect(analyzeScriptDependency(script(`plot.Line(close[i], 'close')`))).toEqual({
      kind: 'stateless',
      lookback: 'unbounded',
    })
  })

  it('bar_index 是位置坐标，按无界回看处理', () => {
    expect(analyzeScriptDependency(script(`plot.Line(bar_index, 'index')`))).toEqual({
      kind: 'stateless',
      lookback: 'unbounded',
    })
  })

  it('导入有状态库按有状态处理', () => {
    const library = { name: 'statefulLib', source: 'let profileBars = []' }
    expect(
      analyzeScriptDependency(
        script(`importLibrary('statefulLib').render()`),
        [library],
      ),
    ).toEqual({ kind: 'stateful' })
  })
})
