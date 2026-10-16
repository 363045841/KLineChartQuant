/** 从脚本真实 inputs 推导 params，编译器与编辑器均在源码分析时执行。 */
import type { VirtualTypeScriptEnvironment } from '@typescript/vfs'
import ts from 'typescript'
import { scriptEditorTypeEntry } from '../../editor/resources.js'
import { SCRIPT_PARAMETERS_FILE, SCRIPT_SOURCE_FILE } from './scriptFiles.js'

/** 读取 defineIndicator 调用的声明对象；别名调用有效，局部同名函数不会误匹配。 */
function readDeclaration(
  checker: ts.TypeChecker,
  node: ts.CallExpression,
): ts.Expression | undefined {
  const declaration = checker.getResolvedSignature(node)?.declaration
  if (!declaration || declaration.getSourceFile().fileName !== scriptEditorTypeEntry) {
    return undefined
  }
  if (!ts.isFunctionDeclaration(declaration) || declaration.name?.text !== 'defineIndicator') {
    return undefined
  }
  return node.arguments[0]
}

/** 把 inputs 的默认值类型渲染成 ScriptParameters 成员，缺省值的字面量类型收敛到基础类型。 */
function readParameterMembers(checker: ts.TypeChecker, definition: ts.Expression): string[] {
  const inputs = checker.getTypeAtLocation(definition).getProperty('inputs')
  if (!inputs) return []
  const members: string[] = []
  const inputType = checker.getTypeOfSymbolAtLocation(inputs, definition)
  for (const parameter of inputType.getProperties()) {
    const value = checker.getTypeOfSymbolAtLocation(parameter, definition).getProperty('default')
    if (!value) continue
    const type = checker.getTypeOfSymbolAtLocation(value, definition)
    members.push(
      `${JSON.stringify(parameter.name)}: ${checker.typeToString(checker.getBaseTypeOfLiteralType(type))}`,
    )
  }
  return members
}

/** 更新当前脚本的参数声明，支持声明别名、变量引用和对象展开，不执行用户代码。 */
export function updateScriptParameters(env: VirtualTypeScriptEnvironment): void {
  const program = env.languageService.getProgram()
  const file = program?.getSourceFile(SCRIPT_SOURCE_FILE)
  if (!file || !program) throw new Error('无法创建脚本类型程序')
  const checker = program.getTypeChecker()
  const members: string[] = []
  /** 命中指标声明后不再深入其参数，避免把参数对象内的调用当成新的声明。 */
  function visit(node: ts.Node): void {
    const definition = ts.isCallExpression(node) ? readDeclaration(checker, node) : undefined
    if (definition) {
      members.push(...readParameterMembers(checker, definition))
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  const code = `interface ScriptParameters { ${members.join('; ')} }`
  if (env.getSourceFile(SCRIPT_PARAMETERS_FILE)?.text !== code) {
    env.updateFile(SCRIPT_PARAMETERS_FILE, code)
  }
}
