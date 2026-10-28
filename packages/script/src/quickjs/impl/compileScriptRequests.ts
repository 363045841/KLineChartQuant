/** 把静态 Request 调用编译为独立表达式与声明，拒绝跨周期捕获局部行情状态。 */
import { createSystem, createVirtualCompilerHost } from '@typescript/vfs'
import ts from 'typescript'
import { ScriptExecutionError } from '../../errors.js'
import {
  applySourceEdits,
  DECLARE_REQUEST,
  INPUT_VALUE,
  isLocalDeclaration,
  onBarDeclarationOf,
  REQUEST_EXPRESSIONS,
  REQUEST_VALUE,
  SECURITY_CALL,
  type SourceEdit,
} from './scriptCompileAst.js'

/** 已登记的 Request：声明行与回调表达式分两处收集，最后拼到文件末尾。 */
interface RequestDeclarations {
  readonly declarations: string[]
  readonly expressions: string[]
}

/** `request.security` 的位置参数；options 缺省时由编译结果补空对象。 */
interface SecurityArguments {
  readonly symbol: ts.Node
  readonly timeframe: ts.Node
  readonly expression: ts.ArrowFunction | ts.FunctionExpression
  readonly options: ts.Node | undefined
}

/** 失败在编译阶段暴露，避免脚本运行时偷偷借用主图计算值。 */
function fail(message: string): never {
  throw new ScriptExecutionError('compile', message)
}

/**
 * 向上找到最近的函数节点；途中出现分支或循环说明 Request 不在 onBar 顶层。
 * @param node 调用节点
 * @returns 最近的函数节点
 */
function enclosingFunctionOf(node: ts.Node): ts.Node {
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
  if (!owner) fail('Request 必须在 onBar 顶层调用')
  return owner
}

/** 判断声明是否由 input 编译产生；这类值可以在回调里独立求值。 */
function inputValueSource(declaration: ts.Declaration): ts.CallExpression | undefined {
  if (!ts.isVariableDeclaration(declaration) || declaration.initializer === undefined)
    return undefined
  const initializer = declaration.initializer
  if (!ts.isCallExpression(initializer)) return undefined
  return initializer.expression.getText(declaration.getSourceFile()) === INPUT_VALUE
    ? initializer
    : undefined
}

/**
 * 收集回调内越出自身范围的局部引用，并换算成可独立求值的文本。
 * 只有 input 声明允许替换，其余局部变量会让跨周期结果依赖主图当前 bar。
 * @param file 用于读取源码文本
 * @param checker 符号绑定只用于辨别局部捕获
 * @param node 待检查的表达式
 * @returns 相对整个文件的改写区间
 */
function collectDetachedCaptures(
  file: ts.SourceFile,
  checker: ts.TypeChecker,
  node: ts.Node,
): SourceEdit[] {
  const replacements: SourceEdit[] = []
  function visit(current: ts.Node): void {
    if (ts.isIdentifier(current)) {
      const declaration = checker.getSymbolAtLocation(current)?.valueDeclaration
      if (
        declaration &&
        isLocalDeclaration(declaration) &&
        (declaration.pos < node.pos || declaration.end > node.end)
      ) {
        const source = inputValueSource(declaration)
        if (!source) fail('Request 不能捕获 onBar 的局部变量，请把计算写入回调内')
        replacements.push({
          from: current.getStart(file),
          to: current.end,
          text: source.getText(file),
        })
      }
    }
    if (ts.isCallExpression(current) && current.expression.getText(file) === SECURITY_CALL)
      fail('暂不支持嵌套 Request')
    ts.forEachChild(current, visit)
  }
  visit(node)
  return replacements
}

/** 把回调改写成不依赖当前作用域的独立表达式文本。 */
function detachedSource(file: ts.SourceFile, checker: ts.TypeChecker, node: ts.Node): string {
  const start = node.getStart(file)
  const edits = collectDetachedCaptures(file, checker, node).map((edit) => ({
    from: edit.from - start,
    to: edit.to - start,
    text: edit.text,
  }))
  return applySourceEdits(node.getText(file), edits)
}

/** 读取并校验位置参数；参数个数与回调形状在这里收口。 */
function readSecurityArguments(node: ts.CallExpression): SecurityArguments {
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
  return { symbol, timeframe, expression, options }
}

/**
 * 把一个 `request.security` 调用改写为请求值读取，并登记声明与回调表达式。
 * @param file 用于读取源码文本
 * @param checker 用于确认回调没有捕获行情局部变量
 * @param node 调用节点
 * @param target 收集声明与回调表达式
 * @returns 将调用替换成取值调用的改写区间
 */
function rewriteSecurityCall(
  file: ts.SourceFile,
  checker: ts.TypeChecker,
  node: ts.CallExpression,
  target: RequestDeclarations,
): SourceEdit {
  const { symbol, timeframe, expression, options } = readSecurityArguments(node)
  if (!onBarDeclarationOf(file, enclosingFunctionOf(node))) fail('Request 必须在 onBar 方法中调用')
  const id = JSON.stringify(String(target.declarations.length))
  const optionSource = options ? detachedSource(file, checker, options) : '{}'
  target.declarations.push(
    `${DECLARE_REQUEST}(${id}, ${detachedSource(file, checker, symbol)}, ${detachedSource(file, checker, timeframe)}, ${optionSource});`,
  )
  target.expressions.push(
    `${REQUEST_EXPRESSIONS}.set(${id}, ${detachedSource(file, checker, expression)});`,
  )
  return { from: node.getStart(file), to: node.end, text: `${REQUEST_VALUE}(${id})` }
}

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
  const edits: SourceEdit[] = []
  const target: RequestDeclarations = { declarations: [], expressions: [] }
  /** 提取顶层 onBar 中的调用；请求不能放在分支或循环里。 */
  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && node.expression.getText(file) === SECURITY_CALL) {
      edits.push(rewriteSecurityCall(file, checker, node, target))
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return `${applySourceEdits(source, edits)}\n${target.declarations.join('\n')}\n${target.expressions.join('\n')}`
}
