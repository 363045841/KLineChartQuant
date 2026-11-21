/** 用真实编辑器契约验证分片文档的覆盖范围、去噪结果与生成稳定性。 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderScriptApi } from '../generate-api-docs.mjs'
import { collectEditorResources } from '../generate-editor-resources.mjs'

const resources = await collectEditorResources()
const files = renderScriptApi(resources)
const index = files.get('index.md')
const runtime = files.get('runtime.md')
const plot = files.get('plot.md')
const drawing = files.get('drawing.md')
const ta = files.get('ta.md')
const enums = files.get('enums.md')

test('按主题拆分为索引与五个章节', () => {
  assert.deepEqual(
    [...files.keys()],
    ['index.md', 'runtime.md', 'plot.md', 'drawing.md', 'ta.md', 'enums.md'],
  )
  for (const page of ['runtime.md', 'plot.md', 'drawing.md', 'ta.md', 'enums.md']) {
    assert.ok(index.includes(`](./${page})`), `索引缺少 ${page}`)
  }
  assert.ok(index.includes('指标脚本'))
})

test('运行环境覆盖序列、时间、输入与跨周期取数', () => {
  for (const name of ['open', 'close', 'volume', 'timeTradingDay', 'barIndex']) {
    assert.ok(runtime.includes(`\`${name}\``), `缺少 ${name}`)
  }
  for (const name of ['timeOpen', 'timeClose', 'defineIndicator', 'derive']) {
    assert.ok(runtime.includes(`### ${name}\n`), `缺少 ${name}`)
  }
  for (const name of ['timeframe.inSeconds', 'session.isFirstBarRegular', 'barstate.isLast']) {
    assert.ok(runtime.includes(`\`${name}\``) || runtime.includes(`### ${name}\n`), `缺少 ${name}`)
  }
  assert.ok(runtime.includes('### request.security\n'))
  assert.ok(runtime.includes('### request.securityLowerTf\n'))
  assert.ok(runtime.includes('### input.timeframe\n'))
})

test('绘图分片内联每个方法的选项表', () => {
  for (const name of [
    'plot.Line',
    'plot.LineBR',
    'plot.StepLineBR',
    'plot.Histogram',
    'plot.Columns',
    'plot.Candle',
    'plot.Bar',
  ]) {
    assert.ok(plot.includes(`### ${name}\n`), `缺少 ${name}`)
  }
  assert.ok(plot.includes('| 选项 | 类型 | 说明 |'))
  assert.ok(plot.includes('`dash?`'))
  assert.ok(plot.includes('`baseline?`'))
  assert.ok(plot.includes('选项与 [plot.Line](#plot-line) 相同。'))
  assert.ok(plot.includes('### fill\n'))
  assert.ok(plot.includes('### hline\n'))
})

test('绘图对象分片按对象种类组织，方法使用驼峰名', () => {
  for (const name of [
    'line.setXY1',
    'line.setColor',
    'line.getPrice',
    'box.setTextColor',
    'label.setTextColor',
    'chart.point.fromIndex',
  ]) {
    assert.ok(drawing.includes(`### ${name}\n`), `缺少 ${name}`)
  }
  assert.ok(drawing.includes('### LineOptions\n'))
  assert.ok(drawing.includes('### ChartPoint\n'))
  assert.ok(drawing.includes('### LineRef\n'))
  assert.ok(!drawing.includes('type LineRef = ScriptLineRef'))
})

test('技术分析分片保留逐函数语义说明', () => {
  assert.ok(ta.includes('### ta.sma\n'))
  assert.ok(ta.includes('### ta.highestBars\n'))
  assert.ok(ta.includes('**返回**'))
  assert.ok(ta.includes('- `source` 数据序列'))
})

test('枚举压成取值表，每种枚举一节', () => {
  assert.ok(enums.includes('| 成员 | 值 | 说明 |'))
  const sections = [...enums.matchAll(/^### ([A-Za-z]+)$/gm)].map((match) => match[1])
  assert.deepEqual(sections.sort(), [
    'Color',
    'DataSource',
    'Format',
    'HLineStyle',
    'LineStyle',
    'Position',
    'ShapeLocation',
    'ShapeSize',
    'ShapeStyle',
    'Timeframe',
    'extend',
    'xloc',
  ])
  for (const row of [
    '`Color.red`',
    '`LineStyle.arrowBoth`',
    '`Timeframe.hour1`',
    '`DataSource.baoStock`',
    '`Position.sub`',
  ]) {
    assert.ok(enums.includes(row), `缺少 ${row}`)
  }
  // 成员值必须跟随语义说明，不再是一列破折号。
  assert.match(enums, /\| `Color\.red` \| `"@red"` \| 红 \|/)
})

test('已移除的脚本全局、原型方法与内部类型不再出现', () => {
  const all = [...files.values()].join('\n')
  for (const removed of [
    'PlotKind',
    'yloc',
    'toString',
    'valueOf',
    'QuickJSScriptDefinition',
    'PlotDeclaration',
    'InputDef',
    '**@summary**',
  ]) {
    assert.ok(!all.includes(removed), `仍出现 ${removed}`)
  }
})

test('生成结果稳定，锚点唯一且章节间不重复', () => {
  assert.deepEqual(renderScriptApi(resources), files)
  for (const [name, content] of files) {
    const anchors = [...content.matchAll(/<a id="([^"]+)"><\/a>/g)].map((match) => match[1])
    assert.equal(new Set(anchors).size, anchors.length, `${name} 存在重复锚点`)
  }
  const names = ['runtime.md', 'plot.md', 'drawing.md', 'ta.md', 'enums.md'].flatMap((name) =>
    [...files.get(name).matchAll(/^### (.+)$/gm)].map((match) => match[1]),
  )
  assert.equal(new Set(names).size, names.length, '同一名字出现在多个章节')
})

test('修改真实契约注释后直接反映到分片，无需先生成编辑器资源', () => {
  const patched = { ...resources.files }
  patched[resources.entry] = patched[resources.entry].replace(
    '当前 K 线索引，从 0 开始。',
    '文档注释同步验证。',
  )
  const updated = renderScriptApi({ ...resources, files: patched })
  assert.ok(updated.get('runtime.md').includes('文档注释同步验证。'))
})
