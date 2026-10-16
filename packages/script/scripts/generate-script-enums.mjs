/** 从共享绘图契约生成真正的 TS 全局枚举，避免 var 和品牌类型模拟枚举。 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { writeGeneratedFile } from './lib/generated-file.mjs'

const packageRoot = new URL('../', import.meta.url)
const outputFile = fileURLToPath(new URL('src/quickjs/runtime/plotKind.ts', packageRoot))

/** 绘图契约文件与需要导出的枚举名；成员值从契约取值派生，不在此重复书写。 */
const definitions = [
  ['color.ts', ['Color']],
  ['plots.ts', ['PlotKind']],
  ['shape.ts', ['ShapeStyle', 'ShapeLocation', 'ShapeSize']],
]

/**
 * 从绘图契约生成全局枚举声明。
 * @param options check 为 true 时只校验生成物是否为最新
 * @returns changed 表示本次是否写盘
 */
export async function generateScriptEnums({ check = false } = {}) {
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
          initializer && ts.isSatisfiesExpression(initializer)
            ? initializer.expression
            : initializer
        if (!object || !ts.isObjectLiteralExpression(object)) throw new Error('枚举契约必须为对象')
        const members = object.properties.map((property) => {
          if (!ts.isPropertyAssignment(property) || !ts.isStringLiteral(property.initializer)) {
            throw new Error('枚举契约成员必须为字符串')
          }
          return `  ${property.name.getText(file)} = ${JSON.stringify(property.initializer.text)},`
        })
        // 保留共享契约的 JSDoc，让生成的全局枚举提供同一份编辑器提示。
        const documentation = ts
          .getJSDocCommentsAndTags(statement)
          .filter((comment) => comment.kind === ts.SyntaxKind.JSDocComment)
          .map((comment) => comment.getText(file) + '\n')
          .join('')
        declarations.push(
          `${documentation}declare enum ${declaration.name.text} {\n${members.join('\n')}\n}`,
        )
      }
    }
  }
  return {
    changed: writeGeneratedFile(
      outputFile,
      '/** 从 plot-contracts 自动生成的全局 TS 枚举；运行 generate-script-enums.mjs 更新。 */\n' +
        declarations.join('\n\n') +
        '\n',
      { check },
    ),
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await generateScriptEnums({ check: process.argv.includes('--check') })
}
