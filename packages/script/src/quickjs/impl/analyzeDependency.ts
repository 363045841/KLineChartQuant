/**
 * 编译期依赖推断：能证明无状态才算无状态，证明不了默认有状态。
 *
 * 只做保守证明，不追求完备；动态访问、未知库函数一律按有状态处理。
 */
import {
  type ComputeDependency,
  STATEFUL,
  stateless,
} from '@363045841yyt/klinechart-plot-contracts'
import ts from 'typescript'
import { SCRIPT_TARGET } from '../../language/impl/scriptCompilerOptions.js'
import { SCRIPT_SOURCE_FILE } from '../../language/impl/scriptFiles.js'
import type { QuickJSLibrary } from '../types.js'
import { onBarDeclarationOf } from './scriptCompileAst.js'

/** 递归 TA：状态跨 bar 推进，无法只靠区间重算。 */
const STATEFUL_TA = new Set([
  'ema',
  'dema',
  'tema',
  't3',
  'rma',
  'rsi',
  'atr',
  'supertrend',
  'macd',
])

/** 窗口 TA：参数位置固定，字面量长度可折算回看深度。 */
const WINDOW_TA: Readonly<Record<string, number>> = {
  sma: 1,
  sum: 1,
  highest: 1,
  lowest: 1,
  highestbars: 1,
  lowestbars: 1,
  stddev: 1,
  wma: 1,
  linreg: 1,
  cci: 1,
  stoch: 3,
  cmo: 1,
  trima: 1,
  hma: 1,
  alma: 1,
  vwma: 2,
  maxsum: 1,
  mom: 1,
  roc: 1,
  change: 1,
  rising: 1,
  falling: 1,
  pivothigh: 1,
  pivotlow: 1,
}

/** 固定回看的 TA；值与是否 stateful 无关。 */
const FIXED_LOOKBACK: Readonly<Record<string, number>> = {
  swma: 3,
  crossover: 1,
  crossunder: 1,
}

/** 内置行情序列名；动态下标视为无界回看。 */
const SERIES_NAMES = new Set(['open', 'high', 'low', 'close', 'volume', 'time'])

/** 绘图 API 的宿主对象；绘图状态是顺序的。 */
const DRAWING_OWNERS = new Set(['line', 'box', 'label'])

/** 解析单份源码；编译期统一使用同一个目标。 */
function parse(source: string): ts.SourceFile {
  return ts.createSourceFile(SCRIPT_SOURCE_FILE, source, SCRIPT_TARGET, true)
}

/** 顶层可变绑定会让脚本跨 bar 保留状态。 */
function hasTopLevelMutableState(file: ts.SourceFile): boolean {
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) continue
    if ((statement.declarationList.flags & ts.NodeFlags.Const) === 0) return true
    for (const declaration of statement.declarationList.declarations) {
      const initializer = declaration.initializer
      if (initializer && (ts.isObjectLiteralExpression(initializer) || ts.isArrayLiteralExpression(initializer)))
        return true
    }
  }
  return false
}

/** 找到 onBar 的函数体；找不到时按无状态空脚本处理。 */
function findOnBarBody(file: ts.SourceFile): ts.Node | undefined {
  let body: ts.Node | undefined
  const visit = (node: ts.Node): void => {
    if (body) return
    if (
      (ts.isMethodDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
      onBarDeclarationOf(file, node)
    ) {
      body = node.body
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return body
}

/** 读取调用名：`ta.ema(...)` 与 `ema(...)` 都返回 `ema`。 */
function callName(expression: ts.Expression): string | undefined {
  if (ts.isIdentifier(expression)) return expression.text
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text
  return undefined
}

/** 只接受非负整数字面量；其余一律视为无法静态求值。 */
function literalOffset(node: ts.Expression | undefined): number | undefined {
  if (!node) return undefined
  if (!ts.isNumericLiteral(node)) return undefined
  const value = Number(node.text)
  return Number.isSafeInteger(value) && value >= 0 ? value : undefined
}

/** 窗口 TA 的回看深度；长度不是字面量时返回 'unbounded'。 */
function windowLookback(name: string, args: readonly ts.Expression[]): number | 'unbounded' {
  if (name === 'pivothigh' || name === 'pivotlow') {
    const left = literalOffset(args[1])
    const right = literalOffset(args[2])
    return left === undefined || right === undefined ? 'unbounded' : left + right
  }
  const index = WINDOW_TA[name]!
  const length = literalOffset(args[index])
  return length === undefined ? 'unbounded' : Math.max(0, length - 1)
}

/** 扫描整份源码：顶层辅助函数也可能被 onBar 调用，必须一起判定。 */
function scanBody(body: ts.Node): { stateful: boolean; lookback: number | 'unbounded' } {
  let lookback: number | 'unbounded' = 0
  const extend = (value: number | 'unbounded'): void => {
    if (value === 'unbounded') lookback = 'unbounded'
    else if (lookback !== 'unbounded') lookback = Math.max(lookback, value)
  }

  let stateful = false
  const visit = (node: ts.Node): void => {
    if (stateful) return

    if (ts.isCallExpression(node)) {
      const name = callName(node.expression)
      if (name && STATEFUL_TA.has(name)) {
        stateful = true
        return
      }
      if (name && Object.hasOwn(WINDOW_TA, name)) {
        extend(windowLookback(name, node.arguments))
      } else if (name && Object.hasOwn(FIXED_LOOKBACK, name)) {
        extend(FIXED_LOOKBACK[name]!)
      }
      // ta.* 的未知函数按有状态处理；用户函数不在这个命名空间内。
      if (ts.isPropertyAccessExpression(node.expression)) {
        const owner = node.expression.expression
        const property = node.expression.name.text
        if (
          ts.isIdentifier(owner) &&
          owner.text === 'ta' &&
          !STATEFUL_TA.has(property) &&
          !Object.hasOwn(WINDOW_TA, property) &&
          !Object.hasOwn(FIXED_LOOKBACK, property)
        ) {
          stateful = true
          return
        }
      }
      if (name === 'new' && ts.isPropertyAccessExpression(node.expression)) {
        const owner = node.expression.expression
        if (ts.isIdentifier(owner) && DRAWING_OWNERS.has(owner.text)) {
          stateful = true
          return
        }
      }
      if (name === 'at' && ts.isPropertyAccessExpression(node.expression)) {
        const owner = node.expression.expression
        if (ts.isIdentifier(owner) && SERIES_NAMES.has(owner.text)) {
          const offset = literalOffset(node.arguments[0])
          extend(offset === undefined ? 'unbounded' : offset)
        }
      }
    }

    if (
      ts.isElementAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      SERIES_NAMES.has(node.expression.text)
    ) {
      const offset = literalOffset(node.argumentExpression)
      extend(offset === undefined ? 'unbounded' : offset)
    }

    // bar_index 是位置坐标；前置插入会改变它，无法只重算区间。
    if (ts.isIdentifier(node) && node.text === 'bar_index') extend('unbounded')

    ts.forEachChild(node, visit)
  }
  visit(body)
  return { stateful, lookback }
}

/** 库自身是否持有跨调用状态；`ta` 按函数单独判定，不参与模块级判断。 */
function libraryHasState(source: string): boolean {
  return hasTopLevelMutableState(parse(source))
}

/** 脚本是否导入了有状态的库。 */
function importsStatefulLibrary(
  source: string,
  libraries: readonly QuickJSLibrary[],
  visited: Set<string> = new Set(),
): boolean {
  for (const library of libraries) {
    if (library.name === 'ta' || visited.has(library.name)) continue
    visited.add(library.name)
    const imported =
      source.includes(`importLibrary('${library.name}')`) ||
      source.includes(`importLibrary("${library.name}")`)
    if (!imported) continue
    if (libraryHasState(library.source)) return true
    if (importsStatefulLibrary(library.source, libraries, visited)) return true
  }
  return false
}

/** 推断脚本依赖；证明不了无状态时返回有状态。 */
export function analyzeScriptDependency(
  source: string,
  libraries: readonly QuickJSLibrary[] = [],
): ComputeDependency {
  const file = parse(source)
  if (hasTopLevelMutableState(file)) return STATEFUL
  const scan = scanBody(file)
  if (scan.stateful) return STATEFUL
  if (importsStatefulLibrary(source, libraries)) return STATEFUL
  return stateless(scan.lookback)
}
