/** 新建及副本草稿：使用语法树改写声明身份，不替换注释或计算代码。 */
import type { Node, ObjectLiteralExpression } from 'typescript'
import type { ScriptSourceStore } from '../types.js'

/** 一次源码文本替换，按起始位置倒序应用。 */
type SourceEdit = { start: number; end: number; text: string }

/** 为新建脚本或官方副本生成不与现有文档冲突的名称。 */
export function uniqueScriptName(store: ScriptSourceStore, base: string): string {
  let name = base
  let suffix = 2
  while (store.read(name)) name = `${base} ${suffix++}`
  return name
}

/** 修改 defineIndicator 对象中的 name，保持剩余源码原样。 */
export async function createCopySource(source: string, name: string): Promise<string> {
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

  /** 递归遍历语法树，只处理指标声明的身份属性，不修改其他对象上的同名属性。 */
  function visit(node: Node): void {
    const declaration = readDeclaration(node)
    if (declaration) {
      edits.push(...identityEdits(declaration))
      return
    }
    ts.forEachChild(node, visit)
  }

  visit(file)
  if (!edits.length) throw new Error('无法创建副本：未找到指标名称声明')
  return edits
    .sort((a, b) => b.start - a.start)
    .reduce((text, edit) => text.slice(0, edit.start) + edit.text + text.slice(edit.end), source)
}

/** 新建脚本提供可直接保存的独立声明。 */
export function createBlankSource(name: string): string {
  return `// 用户自定义指标\ndefineIndicator({\n  name: ${JSON.stringify(name)},\n  pane: PaneKind.Sub,\n  inputs: {},\n  onBar() {\n    plot.Line(close[0], { id: 'close' })\n  },\n})\n`
}
