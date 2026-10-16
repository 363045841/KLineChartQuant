/** 序列引用的当前值上下文判定：只做语法与类型分析，不产生任何文本修改。 */
import ts from 'typescript'

/** 上下文谓词；返回 undefined 表示父节点不决定，交给上下文类型判断。 */
type ContextPredicate = (
  node: ts.Expression,
  parent: ts.Node,
  checker: ts.TypeChecker,
) => boolean | undefined

/** 判断一个类型是否为行情序列；不将 any、数组或普通对象当成序列。 */
export function isSeries(type: ts.Type): boolean {
  if (type.isUnion()) return type.types.every(isSeries)
  if (type.isIntersection()) return type.types.some(isSeries)
  return (
    type
      .getSymbol()
      ?.declarations?.some(
        (declaration) =>
          ts.isInterfaceDeclaration(declaration) &&
          declaration.name.text === 'Series' &&
          declaration.getSourceFile().fileName.endsWith('/series/types.ts'),
      ) ?? false
  )
}

/** 数值和布尔上下文接受当前值，含 Series 的联合类型仍保留完整序列。 */
function expectsValue(type: ts.Type | undefined): boolean {
  if (!type || isSeries(type)) return false
  if (type.isUnion()) return !type.types.some(isSeries) && type.types.some(expectsValue)
  return (type.flags & (ts.TypeFlags.NumberLike | ts.TypeFlags.BooleanLike)) !== 0
}

/** 跳过声明名称、属性键和类型节点，仅分析真正取值的表达式。 */
export function isReference(node: ts.Expression): boolean {
  const parent = node.parent
  if (ts.isPropertyAccessExpression(parent)) return parent.expression === node
  if (ts.isPropertyAssignment(parent)) return parent.initializer === node
  if (ts.isShorthandPropertyAssignment(parent)) return parent.name === node
  if (ts.isBindingElement(parent) || ts.isImportSpecifier(parent)) return false
  if ('name' in parent && parent.name === node) return false
  return !ts.isTypeNode(parent)
}

/** 赋值运算符覆盖复合赋值，用于区分写左值与读右值。 */
function isAssignmentOperator(kind: ts.SyntaxKind): boolean {
  return kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment
}

/** 二元表达式：写左值保持序列，赋值右值看目标类型，逗号右值沿用外层判定。 */
function binaryContext(node: ts.Expression, parent: ts.Node, checker: ts.TypeChecker): boolean {
  const expression = parent as ts.BinaryExpression
  const operator = expression.operatorToken.kind
  if (expression.left === node && isAssignmentOperator(operator)) return false
  if (operator === ts.SyntaxKind.EqualsToken) {
    return expectsValue(checker.getTypeAtLocation(expression.left))
  }
  // 逗号右值仍由外层上下文决定，不能把返回的完整序列提前取值。
  if (operator === ts.SyntaxKind.CommaToken) {
    return expression.right === node && needsCurrentValue(expression, checker)
  }
  if (operator === ts.SyntaxKind.InKeyword || operator === ts.SyntaxKind.InstanceOfKeyword)
    return false
  return true
}

/** 自增自减作用在写左值上，其余一元运算读取当前值。 */
function prefixContext(node: ts.Expression, parent: ts.Node): boolean {
  const operator = (parent as ts.PrefixUnaryExpression).operator
  return operator !== ts.SyntaxKind.PlusPlusToken && operator !== ts.SyntaxKind.MinusMinusToken
}

/** 序列与数值、空值混合的条件结果物化为当前值，使别名也能推导为数值。 */
function materializesConditional(type: ts.Type): boolean {
  if (!type.isUnion() || !type.types.some(isSeries)) return false
  return type.types.some(
    (member) =>
      expectsValue(member) || (member.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined)) !== 0,
  )
}

/** 条件表达式：条件槽取当前值，结果与条件同型时跟随条件自身的判定。 */
function conditionalContext(
  node: ts.Expression,
  parent: ts.Node,
  checker: ts.TypeChecker,
): boolean {
  const conditional = parent as ts.ConditionalExpression
  if (conditional.condition === node) return true
  if (needsCurrentValue(conditional, checker)) return true
  return materializesConditional(checker.getTypeAtLocation(conditional))
}

/** 简写属性只在目标属性要求数值或布尔时物化当前值。 */
function shorthandContext(
  node: ts.Expression,
  parent: ts.Node,
  checker: ts.TypeChecker,
): boolean | undefined {
  const shorthand = parent as ts.ShorthandPropertyAssignment
  if (!ts.isObjectLiteralExpression(shorthand.parent)) return undefined
  const property = checker.getContextualType(shorthand.parent)?.getProperty(shorthand.name.text)
  return !!property && expectsValue(checker.getTypeOfSymbolAtLocation(property, shorthand))
}

/** 索引和成员访问的基座保持完整序列，其余位置交由上下文类型判断。 */
function baseExpressionContext(node: ts.Expression, parent: ts.Node): boolean | undefined {
  const access = parent as ts.ElementAccessExpression | ts.PropertyAccessExpression
  return access.expression === node ? false : undefined
}

/** 语句的表达式槽（if / while / do / switch / case）读取当前值。 */
function expressionSlotContext(node: ts.Expression, parent: ts.Node): boolean {
  return (parent as { expression?: ts.Node }).expression === node
}

/** for 语句只有条件槽读取当前值。 */
function forConditionContext(node: ts.Expression, parent: ts.Node): boolean {
  return (parent as ts.ForStatement).condition === node
}

/** 括号不改变取值位置，跟随括号自身的上下文判定。 */
function parenthesizedContext(
  node: ts.Expression,
  parent: ts.Node,
  checker: ts.TypeChecker,
): boolean {
  return needsCurrentValue(parent as ts.Expression, checker)
}

/** 父节点 kind 到上下文谓词的映射；未命中即按上下文类型判断。 */
const PARENT_CONTEXTS: Readonly<Record<number, ContextPredicate>> = {
  [ts.SyntaxKind.ParenthesizedExpression]: parenthesizedContext,
  [ts.SyntaxKind.ElementAccessExpression]: baseExpressionContext,
  [ts.SyntaxKind.PropertyAccessExpression]: baseExpressionContext,
  [ts.SyntaxKind.BinaryExpression]: binaryContext,
  [ts.SyntaxKind.PrefixUnaryExpression]: prefixContext,
  [ts.SyntaxKind.ConditionalExpression]: conditionalContext,
  [ts.SyntaxKind.ShorthandPropertyAssignment]: shorthandContext,
  [ts.SyntaxKind.IfStatement]: expressionSlotContext,
  [ts.SyntaxKind.WhileStatement]: expressionSlotContext,
  [ts.SyntaxKind.DoStatement]: expressionSlotContext,
  [ts.SyntaxKind.SwitchStatement]: expressionSlotContext,
  [ts.SyntaxKind.CaseClause]: expressionSlotContext,
  [ts.SyntaxKind.ForStatement]: forConditionContext,
}

/** 根据父节点和上下文类型判断引用是否读取当前值；索引、成员和未标注别名保持序列。 */
export function needsCurrentValue(node: ts.Expression, checker: ts.TypeChecker): boolean {
  const context = PARENT_CONTEXTS[node.parent.kind]
  const decided = context?.(node, node.parent, checker)
  if (decided !== undefined) return decided
  return expectsValue(checker.getContextualType(node))
}
