/** 文档示例即测试：指南里标记为 js 的代码块必须是能跑通的完整脚本。 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { barsFromCloses } from '../../__tests__/marketData.js'
import { runQuickJSScript } from '../../__tests__/helpers/quickJSScript.js'

const guide = readFileSync(
  fileURLToPath(new URL('../../../docs/indicator.md', import.meta.url)),
  'utf8',
)

/** 抽取 ```js 代码块；文档约定只有可直接运行的完整脚本才用这个标记。 */
function runnableExamples(source: string): readonly string[] {
  const blocks: string[] = []
  for (const match of source.matchAll(/```js\r?\n([\s\S]*?)```/g)) blocks.push(match[1])
  return blocks
}

const examples = runnableExamples(guide)

/** 覆盖上涨、下跌与平盘的固定行情，示例不依赖外部数据源。 */
const bars = barsFromCloses([10, 11, 12, 11, 13, 14, 13, 15, 16, 15, 14, 16])

describe('指标指南示例', () => {
  it('指南包含可运行示例', () => {
    expect(examples.length).toBeGreaterThanOrEqual(6)
  })

  it.each(examples.map((code, index) => [index + 1, code] as const))(
    '示例 %i 是完整脚本并能运行',
    async (_index, code) => {
      expect(code).toMatch(/define(Indicator|Alert)\(/)
      await expect(runQuickJSScript({ source: code, bars })).resolves.toBeDefined()
    },
  )
})
