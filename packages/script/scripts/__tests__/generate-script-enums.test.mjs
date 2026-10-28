/** 验证枚举生成器：JSDoc 复制、成员序列化与非法契约拒绝。 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderEnumsFromSource } from '../generate-script-enums.mjs'

test('复制枚举与成员的 JSDoc，并序列化字符串成员', () => {
  const source = `/** 绘图类型 */\nexport const PlotKind = {\n  /** 折线 */\n  Line: 'line',\n} satisfies Record<string, string>\n`
  const [declaration] = renderEnumsFromSource('plots.ts', source, ['PlotKind'])
  assert.match(declaration, /^\/\*\* 绘图类型 \*\/\ndeclare enum PlotKind \{/)
  assert.match(declaration, / {2}\/\*\* 折线 \*\/\n {2}Line = "line",/)
})

test('只导出登记过的枚举名', () => {
  const source = `export const Color = { Red: '#f00' }\nexport const Other = { A: 'a' }\n`
  const names = renderEnumsFromSource('plots.ts', source, ['Color']).join('\n')
  assert.match(names, /declare enum Color/)
  assert.doesNotMatch(names, /declare enum Other/)
})

test('非对象枚举与非字符串成员直接拒绝', () => {
  assert.throws(
    () => renderEnumsFromSource('x.ts', 'export const A = 1', ['A']),
    /枚举契约必须为对象/,
  )
  assert.throws(
    () => renderEnumsFromSource('x.ts', 'export const A = { B: value }', ['A']),
    /枚举契约成员必须为字符串/,
  )
})
