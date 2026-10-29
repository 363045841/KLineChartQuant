/**
 * 脚本身份改写：复制脚本时只改 defineIndicator 的 name 与 defineLibrary 的首个名称参数，
 * 保留注释、计算代码与其他同名属性。
 *
 * 用 TypeScript 语法树而不是文本替换，因为 name 可能出现在嵌套对象里；
 * 编译器在函数内按需加载，只有真正复制脚本时才付出这份体积。
 */
import type { Node, ObjectLiteralExpression } from 'typescript'

/** 一次源码文本替换，按起始位置倒序应用。 */
type SourceEdit = { start: number; end: number; text: string }

/**
 * 改写脚本源码里的指标名或库名。
 *
 * @param source 完整脚本源码
 * @param name 新名称
 * @returns 改写后的源码
 * @throws 指标声明不是对象或找不到可改写的身份声明时抛出
 */
export async function rewriteScriptIdentity(source: string, name: string): Promise<string> {
  const ts = await import('typescript')
  const file = ts.createSourceFile(
    'indicator.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const edits: SourceEdit[] = []

  /** 是 defineIndicator(...) 调用则返回其声明对象，否则返回 null。 */
  function readDeclaration(node: Node): ObjectLiteralExpression | null {
    if (!ts.isCallExpression(node)) return null
    if (!ts.isIdentifier(node.expression) || node.expression.text !== 'defineIndicator') return null
    const declaration = node.arguments[0]
    if (!declaration || !ts.isObjectLiteralExpression(declaration)) {
      throw new Error('无法创建副本：指标声明必须是对象')
    }
    return declaration
  }

  /** 库名称是 defineLibrary 的首个字符串参数。 */
  function libraryEdit(node: Node): SourceEdit | null {
    if (
      !ts.isCallExpression(node) ||
      !ts.isIdentifier(node.expression) ||
      node.expression.text !== 'defineLibrary'
    )
      return null
    const argument = node.arguments[0]
    if (!argument || !ts.isStringLiteral(argument))
      throw new Error('无法创建副本：库名称必须是字符串字面量')
    return { start: argument.getStart(file), end: argument.end, text: JSON.stringify(name) }
  }

  /** 收集声明对象里 name 初始值的改写编辑。 */
  function identityEdits(declaration: ObjectLiteralExpression): SourceEdit[] {
    const found: SourceEdit[] = []
    for (const property of declaration.properties) {
      if (!ts.isPropertyAssignment(property)) continue
      const key = property.name
      if (!(ts.isIdentifier(key) || ts.isStringLiteral(key)) || key.text !== 'name') continue
      found.push({
        start: property.initializer.getStart(file),
        end: property.initializer.end,
        text: JSON.stringify(name),
      })
    }
    return found
  }

  /** 递归遍历语法树，只处理指标与库声明的身份，不修改其他对象上的同名属性。 */
  function visit(node: Node): void {
    const declaration = readDeclaration(node)
    if (declaration) {
      edits.push(...identityEdits(declaration))
      return
    }
    const library = libraryEdit(node)
    if (library) {
      edits.push(library)
      return
    }
    ts.forEachChild(node, visit)
  }

  visit(file)
  if (!edits.length) throw new Error('无法创建副本：未找到脚本名称声明')
  return edits
    .sort((a, b) => b.start - a.start)
    .reduce((text, edit) => text.slice(0, edit.start) + edit.text + text.slice(edit.end), source)
}
