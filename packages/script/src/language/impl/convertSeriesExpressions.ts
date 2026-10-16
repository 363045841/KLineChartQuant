/** 用类型程序收集数值上下文中的序列引用，只插入当前值访问，保留源码位置和注释。 */
import ts from 'typescript'
import type { ScriptConversion, ScriptInsertion, ScriptValueRead } from '../types.js'
import { isReference, isSeries, needsCurrentValue } from './valueContexts.js'

/** 简写属性要回到被简写的局部符号取类型，否则拿到的是目标属性类型而不是序列。 */
function expressionTypeOf(node: ts.Expression, checker: ts.TypeChecker): ts.Type {
  if (ts.isShorthandPropertyAssignment(node.parent)) {
    const symbol = checker.getShorthandAssignmentValueSymbol(node.parent)
    if (symbol) return checker.getTypeOfSymbolAtLocation(symbol, node)
  }
  return checker.getTypeAtLocation(node)
}

/** 只处理引用位置：整体运算和括号由父节点统一判定，避免同一表达式重复插入。 */
function isValueCandidate(node: ts.Node, checker: ts.TypeChecker): node is ts.Expression {
  return (
    ts.isExpression(node) &&
    !ts.isParenthesizedExpression(node) &&
    !ts.isConditionalExpression(node) &&
    !ts.isBinaryExpression(node) &&
    isReference(node) &&
    isSeries(expressionTypeOf(node, checker)) &&
    needsCurrentValue(node, checker)
  )
}

/** 深度优先收集数值上下文中的序列引用，保留源码出现顺序。 */
function collectValueCandidates(file: ts.SourceFile, checker: ts.TypeChecker): ts.Expression[] {
  const candidates: ts.Expression[] = []
  function visit(node: ts.Node): void {
    if (isValueCandidate(node, checker)) candidates.push(node)
    ts.forEachChild(node, visit)
  }
  visit(file)
  return candidates
}

/** 推导依赖跟踪器：判断某个推导来源本轮是否也在转换，并按声明缓存结论。 */
function createDeferralTracker(
  file: ts.SourceFile,
  checker: ts.TypeChecker,
  candidates: ReadonlySet<ts.Node>,
): (node: ts.Expression) => boolean {
  const changing = new Map<ts.Node, boolean>()
  const resolving = new Set<ts.Node>()

  /** 显式类型标注的声明不参与推导，直接按声明类型处理。 */
  function hasExplicitType(declaration: ts.Node): boolean {
    return (declaration as { type?: ts.Node }).type !== undefined
  }

  /** 推导来源：变量、参数、属性的初始化式，或函数声明的返回体。 */
  function inferenceSource(declaration: ts.Node): ts.Node | undefined {
    if (hasExplicitType(declaration)) return undefined
    if (
      ts.isVariableDeclaration(declaration) ||
      ts.isParameter(declaration) ||
      ts.isPropertyDeclaration(declaration) ||
      ts.isPropertyAssignment(declaration)
    ) {
      return declaration.initializer
    }
    if (ts.isFunctionLike(declaration) && 'body' in declaration) return declaration.body
    return undefined
  }

  /**
   * 遍历推导表达式，判断它或它引用的推导是否落在本轮候选上。
   * 本轮也在转换时延后处理，下一轮再以新类型决定是否还需要 [0]。
   */
  function dependsOnConversion(node: ts.Node): boolean {
    if (candidates.has(node)) return true
    if (ts.isExpression(node) && tracksExpression(node)) return true
    return ts.forEachChild(node, dependsOnConversion) ?? false
  }

  /** 该声明本轮是否也在转换；递归中的声明先按未转换处理，避免自引用成环。 */
  function tracksDeclaration(declaration: ts.Node): boolean {
    if (declaration.getSourceFile() !== file) return false
    const cached = changing.get(declaration)
    if (cached !== undefined) return cached
    if (resolving.has(declaration)) return false
    const source = inferenceSource(declaration)
    if (!source) return false
    resolving.add(declaration)
    const result = dependsOnConversion(source)
    resolving.delete(declaration)
    changing.set(declaration, result)
    return result
  }

  /** 表达式是否为引用本轮转换候选的推导来源；调用取签名声明，其余取引用符号。 */
  function tracksExpression(node: ts.Expression): boolean {
    const declarations = ts.isCallExpression(node)
      ? [checker.getResolvedSignature(node)?.declaration]
      : (checker.getSymbolAtLocation(node)?.declarations ?? [])
    return declarations.some((declaration) => !!declaration && tracksDeclaration(declaration))
  }

  return tracksExpression
}

/** 把引用列表转成插入项；简写属性需要补出属性名才能包住取值。 */
function buildInsertions(file: ts.SourceFile, nodes: readonly ts.Expression[]): ScriptInsertion[] {
  const insertions: ScriptInsertion[] = []
  for (const node of nodes) {
    insertions.push({
      position: node.getStart(file),
      text: ts.isShorthandPropertyAssignment(node.parent) ? `${node.getText(file)}: (` : '(',
    })
    insertions.push({ position: node.end, text: ')[0]' })
  }
  return insertions
}

/** 插入布局：虚拟文档与双向位置映射；取值记录在节点定位完成后附加。 */
type InsertionLayout = Omit<ScriptConversion, 'valueReads'>

/** 将插入项组合成虚拟文档，并提供原文与虚拟文档之间的双向位置映射。 */
function buildLayout(source: string, insertions: ScriptInsertion[]): InsertionLayout {
  insertions.sort((left, right) => left.position - right.position)
  let code = ''
  let previous = 0
  for (const insertion of insertions) {
    code += source.slice(previous, insertion.position) + insertion.text
    previous = insertion.position
  }
  code += source.slice(previous)
  return {
    code,
    insertions,
    /** 原文位置跳过该位置之前的所有插入文本。 */
    toGenerated(position) {
      let offset = 0
      for (const insertion of insertions) {
        if (insertion.position > position) break
        offset += insertion.text.length
      }
      return position + offset
    },
    /** 插入文本中的位置收敛到对应的原文边界。 */
    toSource(position) {
      let offset = 0
      for (const insertion of insertions) {
        const start = insertion.position + offset
        if (position < start) break
        if (position <= start + insertion.text.length) return insertion.position
        offset += insertion.text.length
      }
      return position - offset
    },
  }
}

/** 记录被物化引用的原文范围与生成的取值位置，供语言服务查询类型。 */
function readValueNodes(
  file: ts.SourceFile,
  nodes: readonly ts.Expression[],
  layout: Pick<InsertionLayout, 'toGenerated'>,
): ScriptValueRead[] {
  return nodes.map((node) => {
    const reference = ts.isPropertyAccessExpression(node) ? node.name : node
    return {
      sourceStart: reference.getStart(file),
      sourceEnd: reference.end,
      // 指向生成的 [0] 内部，以便语言查询取得当前值表达式的类型。
      generatedPosition: layout.toGenerated(node.end) - 2,
    }
  })
}

/** 从实际类型程序生成当前值语法糖；完整序列参数、历史索引和局部同名变量不受影响。 */
export function convertSeriesExpressions(
  file: ts.SourceFile,
  checker: ts.TypeChecker,
): ScriptConversion {
  const candidates = collectValueCandidates(file, checker)
  const defers = createDeferralTracker(file, checker, new Set(candidates))
  const converted = candidates.filter((node) => !defers(node))
  const layout = buildLayout(file.text, buildInsertions(file, converted))
  return { ...layout, valueReads: readValueNodes(file, converted, layout) }
}
