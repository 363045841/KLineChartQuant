/** 使用真实语义会话验证源码版本缓存与参数类型生命周期。 */
import { describe, expect, it } from 'vitest'
import { createScriptLanguageSession } from '../impl/createScriptLanguageSession.js'
import { SCRIPT_SOURCE_FILE } from '../impl/scriptFiles.js'

/** 会话当前文档的语义诊断错误码，用于锁定具体错误而不是「有错误」。 */
function diagnosticCodes(session: ReturnType<typeof createScriptLanguageSession>): number[] {
  return session.environment.languageService
    .getSemanticDiagnostics(SCRIPT_SOURCE_FILE)
    .map((diagnostic) => diagnostic.code)
}

describe('共享脚本语义会话', () => {
  it('OHLC 接口支持派生序列，编辑器拒绝美国线影线参数和 fill 句柄误用', () => {
    const session = createScriptLanguageSession()
    session.updateSource(`defineIndicator({ name: 'OHLC', position: Position.Main, onBar() {
      const average = ta.sma(close, 2)
      plot.Candle(open, high, low, average, 'candles', { color: null, wickColor: Color.Gray, borderColor: Color.Blue })
      plot.Bar(open, high, low, close, 'bars', { showLast: 10, offset: 1 })
    } })`)
    expect(diagnosticCodes(session)).toEqual([])
    session.updateSource(`defineIndicator({ name: 'InvalidOHLC', position: Position.Main, onBar() {
      plot.Bar(open, high, low, close, 'bars', { wickColor: Color.Red })
      const candle = plot.Candle(open, high, low, close, 'candles')
      fill(candle, plot.Line(close, 'line'), Color.Blue)
    } })`)
    expect(diagnosticCodes(session)).toEqual(expect.arrayContaining([2353, 2345]))
  })

  it('同版本复用转换结果，修改 inputs 后清除旧参数并采用新类型', () => {
    const session = createScriptLanguageSession()
    const source = `defineIndicator({
      name: 'ParameterContext', position: Position.Sub,
      onBar() { const level = input.int(2); plot.Line(close * level, 'value') }
    })`
    const conversion = session.updateSource(source)
    expect(session.updateSource(source)).toBe(conversion)
    expect(diagnosticCodes(session)).toEqual([])

    session.updateSource(`defineIndicator({
      name: 'Changed', position: Position.Sub,
      onBar() { const enabled = input.bool(true); const removed = level; const active: number = enabled }
    })`)
    // 2339 = 不存在旧参数，2322 = 新参数类型为 boolean 不能赋给 number。
    expect(diagnosticCodes(session)).toEqual(expect.arrayContaining([2304, 2322]))

    session.updateSource('')
    session.updateSource(source)
    expect(diagnosticCodes(session)).toEqual([])
  })
})
