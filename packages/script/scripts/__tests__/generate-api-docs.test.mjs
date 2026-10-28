/** 用真实编辑器契约验证文档覆盖范围、注释同步与生成稳定性。 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderScriptApi } from '../generate-api-docs.mjs'
import { collectEditorResources } from '../generate-editor-resources.mjs'

const resources = await collectEditorResources()
const markdown = renderScriptApi(resources)

test('覆盖全局 API、嵌套对象、技术分析、绘图、枚举与相关选项', () => {
  for (const name of [
    'open',
    'defineIndicator',
    'derive',
    'fill',
    'input.int',
    'ta.sma',
    'plot.Line',
    'request.security',
    'chart.point.new',
    'line.new',
    'Position.Main',
    'Timeframe.Hour1',
    'Color.Red',
    'Series.at',
    'SecurityOptions.gaps',
  ]) {
    assert.ok(markdown.includes(`### ${name}\n`), `缺少 ${name}`)
  }
  assert.ok(!markdown.includes('### OutputSink\n'))
  assert.match(markdown, /\*\*@param\*\* source/)
  assert.match(markdown, /\*\*@returns\*\*/)
  assert.match(markdown, /const \[o, h, l, c\] = request\.security/)
  assert.ok(!markdown.includes('import("'))
  assert.match(markdown, /Color\.Red = "@red"/)
  assert.match(markdown, /Timeframe\.Hour1 = "60"/)
  assert.equal([...markdown.matchAll(/^### Series$/gm)].length, 1)
})

test('修改真实契约注释后直接反映到 Markdown，无需先生成编辑器资源', () => {
  const files = { ...resources.files }
  files[resources.entry] = files[resources.entry].replace(
    '当前 K 线索引，从 0 开始。',
    '文档注释同步验证。',
  )
  const updated = renderScriptApi({ ...resources, files })
  assert.match(updated, /文档注释同步验证。/)
  assert.ok(!updated.includes('当前 K 线索引，从 0 开始。'))
})

test('相同契约的生成结果稳定，所有目录链接均有唯一锚点', () => {
  assert.equal(renderScriptApi(resources), markdown)
  const anchors = [...markdown.matchAll(/<a id="([^"]+)"><\/a>/g)].map((match) => match[1])
  assert.equal(new Set(anchors).size, anchors.length)
  for (const match of markdown.matchAll(/\]\(#((?:api|type)-\d+)\)/g)) {
    assert.ok(anchors.includes(match[1]), `缺少锚点 ${match[1]}`)
  }
})
