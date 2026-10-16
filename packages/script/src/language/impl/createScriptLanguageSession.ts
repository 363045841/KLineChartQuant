/** 统一源码更新、参数推导、当前值转换和位置映射，入口适配不再自行组合流程。 */
import type { ScriptConversion, ScriptLanguageSession } from '../types.js'
import { convertScriptSource } from './convertScriptSource.js'
import { createScriptTypeEnvironment } from './createScriptTypeEnvironment.js'
import { SCRIPT_SOURCE_FILE } from './scriptFiles.js'

/** 创建独立的增量语义会话；同一源码版本复用转换结果和语言服务程序。 */
export function createScriptLanguageSession(): ScriptLanguageSession {
  const environment = createScriptTypeEnvironment()
  let source = ''
  let conversion: ScriptConversion | undefined
  return {
    environment,
    get source() {
      return source
    },
    get conversion() {
      return conversion
    },
    /** 每轮转换前刷新参数类型，保证编译输出和编辑器分析使用同一上下文。 */
    updateSource(next) {
      if (next === source && conversion) return conversion
      source = next
      // typescript-vfs 把空文本当成缺失快照，虚拟文档必须始终有内容才能分析。
      conversion = convertScriptSource(source || '\n', (code) => {
        if (environment.getSourceFile(SCRIPT_SOURCE_FILE)?.text !== code) {
          environment.updateFile(SCRIPT_SOURCE_FILE, code)
        }
        const program = environment.languageService.getProgram()
        const file = program?.getSourceFile(SCRIPT_SOURCE_FILE)
        if (!program || !file) throw new Error('无法创建脚本类型程序')
        return { file, checker: program.getTypeChecker() }
      })
      return conversion
    },
  }
}
