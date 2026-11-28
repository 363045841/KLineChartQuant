/** 声明校验：源码是否直接调用 alert()；只做语法匹配，不推断行为。 */
import ts from 'typescript'
import { SCRIPT_TARGET } from '../../language/impl/scriptCompilerOptions.js'
import { SCRIPT_SOURCE_FILE } from '../../language/impl/scriptFiles.js'

/** 检查源码是否包含直接的 alert() 调用。 */
export function hasDirectAlertCall(source: string): boolean {
  const file = ts.createSourceFile(SCRIPT_SOURCE_FILE, source, SCRIPT_TARGET, true)
  let found = false
  const visit = (node: ts.Node): void => {
    if (found) return
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'alert'
    ) {
      found = true
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return found
}
