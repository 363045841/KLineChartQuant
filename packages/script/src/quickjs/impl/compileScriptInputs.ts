/** 从 onBar 的输入变量提取配置，注册时无需执行行情计算即可生成参数面板。 */
import ts from 'typescript'
import type { ScriptInput } from '../../editor/types.js'
import { ScriptExecutionError } from '../../errors.js'
import { SCRIPT_ENUM_GLOBALS } from './scriptEnumGlobals.js'

/** 编译器接受的 input 方法；键必须与 ScriptInput 完全一致，漏写新输入类型会在这里编译失败。 */
const INPUT_METHODS: Readonly<Record<keyof ScriptInput, true>> = {
  int: true,
  float: true,
  bool: true,
  string: true,
  timeframe: true,
}

/** 将输入初始化转换为稳定参数名读取，并在文件末尾注册默认值与选项。 */
export function compileScriptInputs(source: string): string {
  const file = ts.createSourceFile('script.ts', source, ts.ScriptTarget.ES2022, true)
  const edits: { from: number; to: number; text: string }[] = []
  const declarations: string[] = []
  const names = new Set<string>()
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
  /** 只接受 onBar 顶层 const 输入声明，使参数身份不随分支和循环变化。 */
  function visit(node: ts.Node): void {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === 'input'
    ) {
      const method = node.expression.name.text
      const variable = node.parent
      const list = variable.parent
      const statement = list?.parent
      const block = statement?.parent
      const callback = block?.parent
      if (
        !Object.hasOwn(INPUT_METHODS, method) ||
        !ts.isVariableDeclaration(variable) ||
        !ts.isIdentifier(variable.name) ||
        !ts.isVariableDeclarationList(list) ||
        !(list.flags & ts.NodeFlags.Const) ||
        !statement ||
        !ts.isVariableStatement(statement) ||
        !block ||
        !ts.isBlock(block) ||
        !callback ||
        !(
          ts.isMethodDeclaration(callback) ||
          ts.isArrowFunction(callback) ||
          ts.isFunctionExpression(callback)
        )
      ) {
        throw new ScriptExecutionError(
          'compile',
          'input.xxx 必须直接初始化 onBar 顶层的 const 变量',
        )
      }
      const owner = ts.isMethodDeclaration(callback)
        ? callback
        : ts.isPropertyAssignment(callback.parent)
          ? callback.parent
          : undefined
      if (!owner || owner.name?.getText(file) !== 'onBar')
        throw new ScriptExecutionError('compile', 'input.xxx 只能声明在 onBar 中')
      if (node.arguments.length < 1 || node.arguments.length > 2 || !node.arguments.every(constant))
        throw new ScriptExecutionError('compile', '输入默认值和选项必须使用常量字面量')
      const name = variable.name.text
      if (names.has(name)) throw new ScriptExecutionError('compile', `输入参数名称重复：${name}`)
      names.add(name)
      const key = JSON.stringify(name)
      declarations.push(
        `__declareInput(${key}, ${JSON.stringify(method)}, ${node.arguments.map((argument) => argument.getText(file)).join(', ')});`,
      )
      edits.push({ from: node.getStart(file), to: node.end, text: `__inputValue(${key})` })
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  for (const edit of edits.sort((left, right) => right.from - left.from))
    source = source.slice(0, edit.from) + edit.text + source.slice(edit.to)
  return `${source}\n${declarations.join('\n')}`
}
