/** 将本地标准库和 Script 源码契约装入虚拟文件系统，不依赖 CDN 或另一份类型目录。 */

import {
  scriptEditorTypeEntry,
  scriptEditorTypeFiles,
} from '@363045841yyt/klinechart-script/editor'
import { createSystem, createVirtualTypeScriptEnvironment } from '@typescript/vfs'
import ts from 'typescript'
import { SCRIPT_EDITOR_FILE } from '../types.js'

const PARAMETERS_FILE = '/parameters.d.ts'

// 构建时嵌入源码，发布后的编辑器不需要访问 workspace 或下载标准库。
const standardLibraries = import.meta.glob<string>(
  '../../../../../node_modules/typescript/lib/lib.es*.d.ts',
  { query: '?raw', import: 'default', eager: true },
)

/** 创建单个编辑会话的 JS 类型环境，仅加载 ECMAScript 全局，不加载 DOM。 */
export function createScriptTypeEnvironment() {
  const files = new Map<string, string>(Object.entries(scriptEditorTypeFiles))
  for (const [path, source] of Object.entries(standardLibraries)) {
    files.set(`/${path.slice(path.lastIndexOf('/') + 1)}`, source)
  }
  files.set(SCRIPT_EDITOR_FILE, '\n')
  files.set(PARAMETERS_FILE, 'interface ScriptParameters {}')
  return createVirtualTypeScriptEnvironment(
    createSystem(files),
    [SCRIPT_EDITOR_FILE, PARAMETERS_FILE, scriptEditorTypeEntry],
    ts,
    {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      lib: ['lib.es2022.d.ts'],
      allowJs: true,
      checkJs: true,
      strict: true,
      noImplicitAny: false,
      noEmit: true,
      skipLibCheck: true,
      types: [],
    },
  )
}

/** 从实际 inputs 的类型推导全局参数，支持变量引用和对象展开，不执行用户脚本。 */
export function updateScriptParameters(env: ReturnType<typeof createScriptTypeEnvironment>): void {
  const program = env.languageService.getProgram()
  const file = program?.getSourceFile(SCRIPT_EDITOR_FILE)
  if (!file || !program) return
  const checker = program.getTypeChecker()
  const members: string[] = []
  /** 按解析出的调用签名识别声明 API，别名有效，局部同名函数不会误匹配。 */
  function visit(node: ts.Node): void {
    if (!ts.isCallExpression(node)) {
      ts.forEachChild(node, visit)
      return
    }
    const call = node
    const declaration = checker.getResolvedSignature(call)?.declaration
    if (
      !declaration ||
      declaration.getSourceFile().fileName !== scriptEditorTypeEntry ||
      !ts.isFunctionDeclaration(declaration) ||
      declaration.name?.text !== 'defineIndicator'
    ) {
      ts.forEachChild(node, visit)
      return
    }
    const definition = call.arguments[0]
    if (!definition) return
    const inputs = checker.getTypeAtLocation(definition).getProperty('inputs')
    if (!inputs) return
    const inputType = checker.getTypeOfSymbolAtLocation(inputs, definition)
    for (const parameter of inputType.getProperties()) {
      const value = checker.getTypeOfSymbolAtLocation(parameter, definition).getProperty('default')
      if (!value) continue
      const type = checker.getBaseTypeOfLiteralType(
        checker.getTypeOfSymbolAtLocation(value, definition),
      )
      members.push(`${JSON.stringify(parameter.name)}: ${checker.typeToString(type)}`)
    }
  }
  visit(file)
  env.updateFile(PARAMETERS_FILE, `interface ScriptParameters { ${members.join('; ')} }`)
}
