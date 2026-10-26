/** 从脚本语法树读取声明与静态依赖，编译器和源码仓库共用。 */
import ts from 'typescript'
import type { QuickJSLibrary } from '../../quickjs/types.js'

/** 每个文件只声明一个指标或库；依赖名称必须在准备阶段可确定。 */
export function inspectScript(source: string) {
  const file = ts.createSourceFile('script.ts', source, ts.ScriptTarget.Latest, true)
  const declarations: { kind: 'indicator' | 'library'; name: string }[] = []
  const dependencies = new Set<string>()
  /** 收集全局 API 调用，拒绝无法静态解析的库依赖。 */
  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const api = node.expression.text
      if (api === 'importLibrary') {
        const name = node.arguments[0]
        if (!name || !ts.isStringLiteral(name)) throw new Error('importLibrary 需要字符串字面量库名')
        dependencies.add(name.text)
      }
      if (api === 'defineLibrary' || api === 'defineIndicator') {
        if (!ts.isExpressionStatement(node.parent) || node.parent.parent !== file) {
          throw new Error('脚本声明必须位于文件顶层')
        }
        const argument = node.arguments[0]
        if (api === 'defineLibrary') {
          if (!argument || !ts.isStringLiteral(argument) || !argument.text.trim()) {
            throw new Error('defineLibrary 需要非空字符串字面量库名')
          }
          declarations.push({ kind: 'library', name: argument.text })
        } else declarations.push({ kind: 'indicator', name: '' })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  const declaration = declarations[0]
  if (declarations.length !== 1 || !declaration) throw new Error('文件必须声明一个指标或库')
  return { ...declaration, dependencies: [...dependencies] }
}

/** 按依赖顺序返回实际使用的库，缺失与循环依赖在执行前报告。 */
export function resolveScriptLibraries(source: string, libraries: readonly QuickJSLibrary[]) {
  const catalog = new Map<string, QuickJSLibrary>()
  for (const library of libraries) {
    if (library.name === 'ta' || catalog.has(library.name)) throw new Error(`库名已存在：${library.name}`)
    catalog.set(library.name, library)
  }
  const visiting = new Set<string>()
  const loaded = new Set<string>(['ta'])
  const result: QuickJSLibrary[] = []
  /** 深度优先装载依赖，保证初始化时被引用库已注册。 */
  function load(name: string): void {
    if (loaded.has(name)) return
    if (visiting.has(name)) throw new Error(`库存在循环依赖：${[...visiting, name].join(' → ')}`)
    const library = catalog.get(name)
    if (!library) throw new Error(`库不存在：${name}`)
    const declaration = inspectScript(library.source)
    if (declaration.kind !== 'library' || declaration.name !== name) throw new Error(`库声明名称不匹配：${name}`)
    visiting.add(name)
    for (const dependency of declaration.dependencies) load(dependency)
    visiting.delete(name)
    loaded.add(name)
    result.push(library)
  }
  for (const name of inspectScript(source).dependencies) load(name)
  return result
}

/** 把库声明改成虚拟模块的导出，保留私有作用域、原始类型和注释。 */
export function libraryTypeSource(source: string): string {
  const file = ts.createSourceFile('library.ts', source, ts.ScriptTarget.Latest, true)
  for (const statement of file.statements) {
    if (ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression)
      && ts.isIdentifier(statement.expression.expression) && statement.expression.expression.text === 'defineLibrary') {
      const start = statement.getStart(file)
      return `${source.slice(0, start)}export const __library = ${source.slice(start)}`
    }
  }
  throw new Error('未找到库声明')
}
