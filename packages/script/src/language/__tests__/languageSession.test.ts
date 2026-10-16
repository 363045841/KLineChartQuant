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
  it('同版本复用转换结果，修改 inputs 后清除旧参数并采用新类型', () => {
    const session = createScriptLanguageSession()
    const source = `defineIndicator({
      name: 'ParameterContext', inputs: { level: input(2) },
      onBar() { plot.Line(close, { id: 'value' }) }
    })`
    const conversion = session.updateSource(source)
    expect(session.updateSource(source)).toBe(conversion)
    expect(diagnosticCodes(session)).toEqual([])

    session.updateSource(`defineIndicator({
      name: 'Changed', inputs: { enabled: input(true) },
      onBar() { const removed = params.level; const active: number = params.enabled }
    })`)
    // 2339 = 不存在旧参数，2322 = 新参数类型为 boolean 不能赋给 number。
    expect(diagnosticCodes(session)).toEqual(expect.arrayContaining([2339, 2322]))

    session.updateSource('')
    session.updateSource(source)
    expect(diagnosticCodes(session)).toEqual([])
  })
})
