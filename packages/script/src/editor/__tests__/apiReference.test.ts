/** 产品内参考内容必须与分片文档同源：任何一边改动都会在这里暴露。 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SCRIPT_API_REFERENCE } from '../apiReference.js'

/** 读取仓库内的参考文件。 */
function repoFile(relative: string): string {
  return readFileSync(fileURLToPath(new URL(`../../../../../${relative}`, import.meta.url)), 'utf8')
}

describe('脚本参考内容', () => {
  it('主题顺序固定，写作指南排在最前', () => {
    expect(SCRIPT_API_REFERENCE.map((entry) => entry.id)).toEqual([
      'guide',
      'runtime',
      'plot',
      'drawing',
      'ta',
      'enums',
    ])
  })

  it.each([
    ['guide', 'packages/script/docs/indicator.md'],
    ['runtime', 'docs/script/api/runtime.md'],
    ['plot', 'docs/script/api/plot.md'],
    ['drawing', 'docs/script/api/drawing.md'],
    ['ta', 'docs/script/api/ta.md'],
    ['enums', 'docs/script/api/enums.md'],
  ])('%s 与对应文档逐字一致', (id, file) => {
    const entry = SCRIPT_API_REFERENCE.find((item) => item.id === id)
    expect(entry?.content).toBe(repoFile(file))
  })

  it('每个条目都有标题与一句话用途', () => {
    for (const entry of SCRIPT_API_REFERENCE) {
      expect(entry.title.length).toBeGreaterThan(0)
      expect(entry.summary.length).toBeGreaterThan(0)
      expect(entry.content.length).toBeGreaterThan(0)
    }
  })
})
