/** 从 onBar 的输入变量提取配置，注册时无需执行行情计算即可生成参数面板。 */
import ts from 'typescript'
import type { ScriptInput } from '../../editor/types.js'
import { ScriptExecutionError } from '../../errors.js'
import {
  applySourceEdits,
  DECLARE_INPUT,
  INPUT_FACTORY,
  INPUT_VALUE,
  onBarDeclarationOf,
  type SourceEdit,
} from './scriptCompileAst.js'
import { SCRIPT_ENUM_GLOBALS } from './scriptEnumGlobals.js'

/** 编译器接受的 input 方法；键必须与 ScriptInput 完全一致，漏写新输入类型会在这里编译失败。 */
const INPUT_METHODS: Readonly<Record<keyof ScriptInput, true>> = {
  int: true,
  float: true,
  bool: true,
  string: true,
  timeframe: true,
}

/** 输入调用的声明形状：变量名与直接所属函数。 */
interface InputDeclaration {
  readonly name: string
  readonly callback: ts.Node
}

/** 注入的常数枚举成员（如 Timeframe.Day）在注册期求值，不依赖行情与局部作用域。 */
function enumConstant(node: ts.Node): boolean {
  return (
    ts.isPropertyAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    Object.hasOwn(SCRIPT_ENUM_GLOBALS, node.expression.text)
  )
}

/** 配置必须独立于行情和局部作用域，避免注册配置时执行用户计算。 */
function constant(node: ts.Node): boolean {
  if (
    ts.isStringLiteral(node) ||
    ts.isNumericLiteral(node) ||
    node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword
  )
    return true
  if (ts.isPrefixUnaryExpression(node)) return constant(node.operand)
  if (ts.isArrayLiteralExpression(node)) return node.elements.every(constant)
  if (ts.isObjectLiteralExpression(node))
    return node.properties.every(
      (property) => ts.isPropertyAssignment(property) && constant(property.initializer),
    )
  return enumConstant(node)
}

/** 识别 `input.xxx(...)` 调用，返回调用节点与方法名。 */
function readInputCall(
  node: ts.Node,
): { readonly call: ts.CallExpression; readonly method: string } | undefined {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression))
    return undefined
  const target = node.expression.expression
  if (!ts.isIdentifier(target) || target.text !== INPUT_FACTORY) return undefined
  return { call: node, method: node.expression.name.text }
}

/**
 * 读取输入声明的父链形状：`input.xxx(...)` 必须是 onBar 顶层的 const 变量初始化。
 * @param node input 调用节点
 * @returns 变量名与所属函数；形状不合法时返回 undefined
 */
function readInputDeclaration(node: ts.Node): InputDeclaration | undefined {
  const variable = node.parent
  if (!ts.isVariableDeclaration(variable) || !ts.isIdentifier(variable.name)) return undefined
  const list = variable.parent
  if (!ts.isVariableDeclarationList(list) || (list.flags & ts.NodeFlags.Const) === 0)
    return undefined
  const statement = list.parent
  if (!ts.isVariableStatement(statement)) return undefined
  const block = statement.parent
  if (!ts.isBlock(block) || !block.parent) return undefined
  return { name: variable.name.text, callback: block.parent }
}

/**
 * 校验输入调用的默认值与选项，并把调用改写为参数读取，同时登记声明。
 * @param file 用于读取参数源码文本
 * @param call input 调用节点
 * @param method 输入类型名
 * @param declaration 变量声明上下文
 * @param names 已登记的参数名，用于拒绝重名
 * @param declarations 收集追加到文件末尾的声明
 * @param edits 收集源码改写
 */
function rewriteInputCall(
  file: ts.SourceFile,
  call: ts.CallExpression,
  method: string,
  declaration: InputDeclaration,
  names: Set<string>,
  declarations: string[],
  edits: SourceEdit[],
): void {
  if (!Object.hasOwn(INPUT_METHODS, method))
    throw new ScriptExecutionError('compile', `未知的输入类型：${method}`)
  if (call.arguments.length < 1 || call.arguments.length > 2 || !call.arguments.every(constant))
    throw new ScriptExecutionError('compile', '输入默认值和选项必须使用常量字面量')
  if (names.has(declaration.name))
    throw new ScriptExecutionError('compile', `输入参数名称重复：${declaration.name}`)
  names.add(declaration.name)
  const key = JSON.stringify(declaration.name)
  const args = call.arguments.map((argument) => argument.getText(file)).join(', ')
  declarations.push(`${DECLARE_INPUT}(${key}, ${JSON.stringify(method)}, ${args});`)
  edits.push({ from: call.getStart(file), to: call.end, text: `${INPUT_VALUE}(${key})` })
}

/** 将输入初始化转换为稳定参数名读取，并在文件末尾注册默认值与选项。 */
export function compileScriptInputs(source: string): string {
  const file = ts.createSourceFile('script.ts', source, ts.ScriptTarget.ES2022, true)
  const edits: SourceEdit[] = []
  const declarations: string[] = []
  const names = new Set<string>()
  /** 只接受 onBar 顶层 const 输入声明，使参数身份不随分支和循环变化。 */
  function visit(node: ts.Node): void {
    const found = readInputCall(node)
    if (!found) {
      ts.forEachChild(node, visit)
      return
    }
    const declaration = readInputDeclaration(found.call)
    if (!declaration)
      throw new ScriptExecutionError('compile', 'input.xxx 必须直接初始化 onBar 顶层的 const 变量')
    if (!onBarDeclarationOf(file, declaration.callback))
      throw new ScriptExecutionError('compile', 'input.xxx 只能声明在 onBar 中')
    rewriteInputCall(file, found.call, found.method, declaration, names, declarations, edits)
  }
  visit(file)
  return `${applySourceEdits(source, edits)}\n${declarations.join('\n')}`
}
