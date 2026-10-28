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
  ['drawing.ts', ['LineStyle', 'extend', 'xloc', 'yloc']],
  ['market.ts', ['DataSource', 'Timeframe']],
  ['plots.ts', ['PlotKind']],
  ['format.ts', ['Format']],
  ['hline.ts', ['HLineStyle']],
  ['shape.ts', ['ShapeStyle', 'ShapeLocation', 'ShapeSize']],
]

/** 按指定空格数给多行文本加缩进，供生成物内的成员注释对齐。 */
function indent(text, spaces) {
  const prefix = ' '.repeat(spaces)
  return text
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n')
}

/** 节点自带的 JSDoc 注释文本（不含标签）。 */
function jsDocTexts(node, file) {
  return ts
    .getJSDocCommentsAndTags(node)
    .filter((comment) => comment.kind === ts.SyntaxKind.JSDocComment)
    .map((comment) => comment.getText(file))
}

/** 解开 satisfies / as 包装，取出枚举的对象字面量。 */
function enumObjectOf(initializer) {
  const unwrapped =
    initializer && ts.isSatisfiesExpression(initializer) ? initializer.expression : initializer
  const object = unwrapped && ts.isAsExpression(unwrapped) ? unwrapped.expression : unwrapped
  if (!object || !ts.isObjectLiteralExpression(object)) throw new Error('枚举契约必须为对象')
  return object
}

/** 单条枚举成员：成员 JSDoc + 名称与字符串值。 */
function renderMember(property, file) {
  if (!ts.isPropertyAssignment(property) || !ts.isStringLiteral(property.initializer))
    throw new Error('枚举契约成员必须为字符串')
  const documentation = jsDocTexts(property, file)
    .map((text) => indent(text, 2))
    .join('\n')
  const prefix = documentation ? `${documentation}\n` : ''
  return `${prefix}  ${property.name.getText(file)} = ${JSON.stringify(property.initializer.text)},`
}

/**
 * 把一个契约文件中指定的枚举渲染成全局声明文本。
 * @param fileName 契约文件名，仅用于诊断与节点定位
 * @param source 契约源码
 * @param names 需要导出的枚举名
 * @returns 每个枚举一段 `declare enum` 文本
 */
export function renderEnumsFromSource(fileName, source, names) {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true)
  const declarations = []
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !names.includes(declaration.name.text)) continue
      const members = enumObjectOf(declaration.initializer).properties.map((property) =>
        renderMember(property, file),
      )
      // 保留共享契约的 JSDoc，让生成的全局枚举提供同一份编辑器提示。
      const documentation = jsDocTexts(statement, file)
        .map((text) => `${text}\n`)
        .join('')
      declarations.push(
        `${documentation}declare enum ${declaration.name.text} {\n${members.join('\n')}\n}`,
      )
    }
  }
  return declarations
}

/**
 * 从绘图契约生成全局枚举声明。
 * @param options check 为 true 时只校验生成物是否为最新
 * @returns changed 表示本次是否写盘
 */
export async function generateScriptEnums({ check = false } = {}) {
  const declarations = []
  for (const [fileName, names] of definitions) {
    const source = await readFile(new URL(`../plot-contracts/src/${fileName}`, packageRoot), 'utf8')
    declarations.push(...renderEnumsFromSource(fileName, source, names))
  }
  return {
    changed: writeGeneratedFile(
      outputFile,
      '/** 从 plot-contracts 自动生成的全局 TS 枚举；运行 generate-script-enums.mjs 更新。 */\n' +
        '// biome-ignore-all format: 枚举声明由生成器统一序列化\n' +
        declarations.join('\n\n') +
        '\n',
      { check },
    ),
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await generateScriptEnums({ check: process.argv.includes('--check') })
}
