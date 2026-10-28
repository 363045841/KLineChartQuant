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
  it('Series 在脚本类型补全中可见，并保持只读序列契约', () => {
    const session = createScriptLanguageSession()
    const source = 'let source: Ser'
    const conversion = session.updateSource(source)
    const completions = session.environment.languageService.getCompletionsAtPosition(
      SCRIPT_SOURCE_FILE,
      conversion.toGenerated(source.length),
      {},
    )
    expect(completions?.entries.map((entry) => entry.name)).toContain('Series')

    session.updateSource(`function current(source: Series): number {
      return source.at(0) + source[1]
    }
    const source: Series = close
    const average: Series = ta.sma(source, 20)
    current(average)`)
    expect(diagnosticCodes(session)).toEqual([])

    session.updateSource('const source: Series = close; source[0] = 1')
    // 2540 = 序列当前值不可写，2542 = 数字索引签名只允许读取。
    expect(diagnosticCodes(session)).toEqual(expect.arrayContaining([2540]))
  })

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
    // 2353 = Bar 不接受 wickColor；2769 = fill 的重载都不接受 void 句柄。
    expect(diagnosticCodes(session)).toEqual(expect.arrayContaining([2353, 2769]))
  })

  it('颜色参数在类型上接受 Color 枚举，同时保留任意 CSS 颜色', () => {
    const session = createScriptLanguageSession()
    const source = `defineIndicator({ name: 'ColorApi', position: Position.Main, onBar() {
      const id = line.new(bar_index, close[0], bar_index + 1, high[0], xloc.bar_index, extend.none, Color.Red)
      line.set_color(id, Color.Green)
      const lineRef = plot.Line(close[0], 'line', { color: Color.Teal + '80', textColor: Color.Gray })
      plot.Candle(open, high, low, close, 'candles', { color: null, wickColor: Color.Gray, borderColor: '#123456' })
      plot.Arrow(close[1] - close[0], 'arrow', { colorUp: Color.Green, colorDown: Color.Red })
      fill(lineRef, plot.Line(close[0], 'other'), Color.Blue)
    } })`
    const conversion = session.updateSource(source)
    expect(diagnosticCodes(session)).toEqual([])

    // 类型提示必须点出 Color 枚举，而不是退化成 string。
    const quickInfo = session.environment.languageService.getQuickInfoAtPosition(
      SCRIPT_SOURCE_FILE,
      conversion.toGenerated(source.indexOf('color: Color.Teal')),
    )
    const display = (quickInfo?.displayParts ?? []).map((part) => part.text).join('')
    expect(display).toContain('Color | (string & {})')
  })

  it('title 是 defineIndicator 的合法展示名', () => {
    const session = createScriptLanguageSession()
    session.updateSource(
      `defineIndicator({ name: 'Titled', title: '展示名', position: Position.Sub, onBar() {} })`,
    )
    expect(diagnosticCodes(session)).toEqual([])
  })

  it('request.security 是编辑器可见的全局接口', () => {
    const session = createScriptLanguageSession()
    session.updateSource(`defineIndicator({ name: 'Request', position: Position.Main, onBar() {
      const timeframe = input.timeframe(Timeframe.Hour1, { options: [Timeframe.Hour1, Timeframe.Day] })
      const [o, h, l, c] = request.security(syminfo.tickerid, timeframe, () => [open, high, low, close] as const)
      const ma: number = request.security('BTCUSDT', Timeframe.Hour1, () => ta.sma(close, 20), { source: DataSource.Binance, calcBarsCount: 300, gaps: 'off' })
      plot.Candle(o, h, l, c, 'htf')
      plot.Line(ma, 'ma')
    } })`)
    expect(diagnosticCodes(session)).toEqual([])
  })

  it('目标周期只接受 Timeframe，Provider 周期名不再通过类型检查', () => {
    const session = createScriptLanguageSession()
    session.updateSource(`defineIndicator({ name: 'RawPeriod', position: Position.Main, onBar() {
      const ma: number = request.security(syminfo.tickerid, 'daily', () => ta.sma(close, 20))
      plot.Line(ma, 'ma')
    } })`)
    // 2345 = 实参类型不属于 Timeframe。
    expect(diagnosticCodes(session)).toEqual(expect.arrayContaining([2345]))
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

  it('动态库保留成员补全与 Series 返回类型，库修改和删除清除旧类型', () => {
    const session = createScriptLanguageSession()
    session.setLibraries([
      {
        name: 'stats',
        source: `defineLibrary('stats', { smooth(source: Series): Series { return ta.sma(source, 2) } })`,
      },
    ])
    const source = `const stats = importLibrary('stats'); const result = stats.smooth(close) + 1`
    expect(session.updateSource(source).code).toContain('(stats.smooth(close))[0]')
    expect(diagnosticCodes(session)).toEqual([])
    const completionSource = `const stats = importLibrary('stats'); stats.`
    const conversion = session.updateSource(completionSource)
    const completions = session.environment.languageService.getCompletionsAtPosition(
      SCRIPT_SOURCE_FILE,
      conversion.toGenerated(completionSource.length),
      {},
    )
    expect(completions?.entries.map((entry) => entry.name)).toContain('smooth')
    session.setLibraries([
      {
        name: 'stats',
        source: `defineLibrary('stats', { smooth(source: Series): number { return source[0] } })`,
      },
    ])
    expect(session.updateSource(source).code).not.toContain('(stats.smooth(close))[0]')
    session.setLibraries([])
    session.updateSource(source)
    expect(diagnosticCodes(session)).toContain(2345)
  })
})
