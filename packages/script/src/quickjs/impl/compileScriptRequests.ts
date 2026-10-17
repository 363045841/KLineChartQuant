/** 把静态 Request 调用编译为独立表达式与声明，拒绝跨周期捕获局部行情状态。 */
import { createSystem, createVirtualCompilerHost } from '@typescript/vfs'
import ts from 'typescript'
import { ScriptExecutionError } from '../../errors.js'

/** 在输入编译后提取请求；符号绑定只用于辨别回调的局部捕获，不建立第二套类型转换。 */
export function compileScriptRequests(source: string): string {
  const name = 'request-script.ts'
  const file = ts.createSourceFile(name, source, ts.ScriptTarget.ES2022, true)
  // 与编辑器共用 VFS 基础设施，浏览器 Worker 不依赖 Node 的 ts.sys。
  const options: ts.CompilerOptions = { noLib: true, noResolve: true }
  const system = createSystem(new Map([[name, source]]))
  const { compilerHost } = createVirtualCompilerHost(system, options, ts)
  compilerHost.getSourceFile = (path) => (path === name ? file : undefined)
  const checker = ts.createProgram([name], options, compilerHost).getTypeChecker()
  const edits: { start: number; end: number; text: string }[] = []
  const declarations: string[] = []
  const expressions: string[] = []
  /** 失败在编译阶段暴露，避免脚本运行时偷偷借用主图计算值。 */
  function fail(message: string): never {
    throw new ScriptExecutionError('compile', message)
  }
  /** 判断声明是否在某个函数内部。 */
  function local(node: ts.Node): boolean {
    for (let parent = node.parent; parent; parent = parent.parent)
      if (ts.isFunctionLike(parent)) return true
    return false
  }
  /** 根据符号恢复 input 读取；其他外部局部变量不允许进入独立上下文。 */
  function detached(node: ts.Node): string {
    const replacements: { start: number; end: number; text: string }[] = []
    function visit(current: ts.Node): void {
      if (ts.isIdentifier(current)) {
        const declaration = checker.getSymbolAtLocation(current)?.valueDeclaration
        if (
          declaration &&
          local(declaration) &&
          (declaration.pos < node.pos || declaration.end > node.end)
        ) {
          if (
            !ts.isVariableDeclaration(declaration) ||
            !declaration.initializer ||
            !ts.isCallExpression(declaration.initializer) ||
            declaration.initializer.expression.getText(file) !== '__inputValue'
          )
            fail('Request 不能捕获 onBar 的局部变量，请把计算写入回调内')
          replacements.push({
            start: current.getStart(file),
            end: current.end,
            text: declaration.initializer.getText(file),
          })
        }
      }
      if (ts.isCallExpression(current) && current.expression.getText(file) === 'request.security')
        fail('暂不支持嵌套 Request')
      ts.forEachChild(current, visit)
    }
    visit(node)
    const start = node.getStart(file)
    let text = node.getText(file)
    for (const replacement of replacements.sort((a, b) => b.start - a.start))
      text =
        text.slice(0, replacement.start - start) +
        replacement.text +
        text.slice(replacement.end - start)
    return text
  }
  /** 提取顶层 onBar 中的调用；请求不能放在分支或循环里。 */
  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && node.expression.getText(file) === 'request.security') {
      if (node.arguments.length < 3 || node.arguments.length > 4)
        fail('request.security 需要品种、周期、回调和可选选项')
      const [symbol, timeframe, expression, options] = node.arguments
      if (
        !symbol ||
        !timeframe ||
        !expression ||
        !(ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) ||
        expression.parameters.length !== 0 ||
        expression.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword)
      )
        fail('Request expression 必须是无参数的同步函数')
      let owner: ts.Node | undefined = node.parent
      while (owner && !ts.isFunctionLike(owner)) {
        if (
          ts.isIfStatement(owner) ||
          ts.isConditionalExpression(owner) ||
          ts.isIterationStatement(owner, false) ||
          ts.isSwitchStatement(owner)
        )
          fail('Request 必须在 onBar 顶层调用')
        owner = owner.parent
      }
      const callback =
        owner && ts.isMethodDeclaration(owner)
          ? owner
          : owner &&
              (ts.isArrowFunction(owner) || ts.isFunctionExpression(owner)) &&
              ts.isPropertyAssignment(owner.parent)
            ? owner.parent
            : undefined
      if (callback === undefined || callback.name.getText(file) !== 'onBar')
        fail('Request 必须在 onBar 方法中调用')
      const id = JSON.stringify(String(declarations.length))
      declarations.push(
        `__declareRequest(${id}, ${detached(symbol)}, ${detached(timeframe)}, ${options ? detached(options) : '{}'});`,
      )
      expressions.push(`__requestExpressions.set(${id}, ${detached(expression)});`)
      edits.push({ start: node.getStart(file), end: node.end, text: `__requestValue(${id})` })
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  for (const edit of edits.sort((a, b) => b.start - a.start))
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end)
  return `${source}\n${declarations.join('\n')}\n${expressions.join('\n')}`
}
