/** 从共享绘图契约生成真正的 TS 全局枚举，避免 var 和品牌类型模拟枚举。 */
import { readFile, writeFile } from 'node:fs/promises'
import ts from 'typescript'

const packageRoot = new URL('../', import.meta.url)
const definitions = [
  ['plots.ts', ['PlotKind']],
  ['shape.ts', ['ShapeStyle', 'ShapeLocation', 'ShapeSize']],
]
const declarations = []
for (const [fileName, names] of definitions) {
  const source = await readFile(new URL(`../plot-contracts/src/${fileName}`, packageRoot), 'utf8')
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true)
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !names.includes(declaration.name.text)) continue
      const initializer = declaration.initializer
      const object =
        initializer && ts.isSatisfiesExpression(initializer) ? initializer.expression : initializer
      if (!object || !ts.isObjectLiteralExpression(object)) throw new Error('枚举契约必须为对象')
      const members = object.properties.map((property) => {
        if (!ts.isPropertyAssignment(property) || !ts.isStringLiteral(property.initializer)) {
          throw new Error('枚举契约成员必须为字符串')
        }
        return `  ${property.name.getText(file)} = ${JSON.stringify(property.initializer.text)},`
      })
      declarations.push(`declare enum ${declaration.name.text} {\n${members.join('\n')}\n}`)
    }
  }
}
await writeFile(
  new URL('src/quickjs/runtime/plotKind.ts', packageRoot),
  '/** 从 plot-contracts 自动生成的全局 TS 枚举；运行 generate-script-enums.mjs 更新。 */\n' +
    declarations.join('\n\n') +
    '\n',
)
