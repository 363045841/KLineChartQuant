/** 随包脚本必须在编辑器类型环境中无诊断，防止类型声明与运行源码漂移。 */
import { describe, expect, it } from 'vitest'
import { shippedSource } from '../../__tests__/marketData.js'
import { createScriptLanguageSession } from '../impl/createScriptLanguageSession.js'
import { SCRIPT_SOURCE_FILE } from '../impl/scriptFiles.js'

describe('内置脚本的编辑器类型契约', () => {
  it.each(['structure', 'zones', 'mpr', 'mfs', 'bis', 'mdd'])(
    '%s has no editor type errors',
    (name) => {
      const session = createScriptLanguageSession()
      session.updateSource(shippedSource(name))
      const diagnostics =
        session.environment.languageService.getSemanticDiagnostics(SCRIPT_SOURCE_FILE)
      expect(diagnostics.map((diagnostic) => diagnostic.messageText)).toEqual([])
    },
  )
})
