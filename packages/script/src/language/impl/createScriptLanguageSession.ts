/** 统一源码更新、参数推导、当前值转换和位置映射，入口适配不再自行组合流程。 */
import type { ScriptConversion, ScriptLanguageSession } from '../types.js'
import { convertScriptSource } from './convertScriptSource.js'
import { createScriptTypeEnvironment } from './createScriptTypeEnvironment.js'
import { SCRIPT_SOURCE_FILE } from './scriptFiles.js'
import { libraryTypeSource } from './scriptLibraries.js'

/** 创建独立的增量语义会话；同一源码版本复用转换结果和语言服务程序。 */
export function createScriptLanguageSession(): ScriptLanguageSession {
  const environment = createScriptTypeEnvironment()
  let source = ''
  let conversion: ScriptConversion | undefined
  let libraryKey = ''
  let libraryFiles: string[] = []
  return {
    environment,
    /** 同步库模块及类型目录，编辑器和执行器使用相同的公开成员类型。 */
    setLibraries(libraries) {
      const key = JSON.stringify(libraries)
      if (key === libraryKey) return
      libraryKey = key
      conversion = undefined
      for (const path of libraryFiles) environment.deleteFile(path)
      libraryFiles = libraries.map((_, index) => `/user-libraries/library-${index}.ts`)
      libraries.forEach((library, index) => {
        environment.createFile(libraryFiles[index]!, libraryTypeSource(library.source))
      })
      const contract = '/node_modules/@363045841yyt/klinechart-script/contracts/library.js'
      const catalog = `import type {} from ${JSON.stringify(contract)}\n`
        + `declare module ${JSON.stringify(contract)} { interface LibraryModules {\n`
        + libraries.map((library, index) => `${JSON.stringify(library.name)}: typeof import('./library-${index}.js').__library`).join('\n')
        + '\n} }\n'
      const path = '/user-libraries/catalog.ts'
      if (environment.getSourceFile(path)) environment.updateFile(path, catalog)
      else environment.createFile(path, catalog)
    },
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
