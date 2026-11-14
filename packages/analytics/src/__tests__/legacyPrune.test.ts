/**
 * 旧版期权关键位历史清理测试。
 *
 * 只删 `YYYY-MM-DD.jsonl.gz` 且日期早于截止日的文件；目录里其他文件与未过期文件保持不动。
 */
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { pruneLegacyOptionsLevels } from '../options/impl/legacyPrune'
import { createTempDir } from './testUtils'

/** 创建一个临时数据根，并在其下写入指定的旧版文件。 */
function seed(files: readonly string[]): string {
  const root = createTempDir()
  for (const relative of files) {
    const absolute = join(root, relative)
    mkdirSync(join(absolute, '..'), { recursive: true })
    writeFileSync(absolute, 'x')
  }
  return root
}

describe('pruneLegacyOptionsLevels', () => {
  it('删除早于截止日的文件，保留未过期文件', () => {
    const root = seed([
      'legacy/options-levels/BTCUSD/2026-08-01.jsonl.gz',
      'legacy/options-levels/BTCUSD/2026-11-09.jsonl.gz',
    ])

    const results = pruneLegacyOptionsLevels(root, '2026-10-01')

    expect(results).toEqual([{ symbol: 'BTCUSD', removed: ['2026-08-01'] }])
    expect(readdirSync(join(root, 'legacy/options-levels/BTCUSD'))).toEqual(['2026-11-09.jsonl.gz'])
  })

  it('忽略非日期命名的文件', () => {
    const root = seed(['legacy/options-levels/XAUUSD/notes.txt'])

    expect(pruneLegacyOptionsLevels(root, '2026-10-01')).toEqual([])
    expect(readdirSync(join(root, 'legacy/options-levels/XAUUSD'))).toEqual(['notes.txt'])
  })

  it('目录不存在时返回空数组', () => {
    const root = seed([])

    expect(pruneLegacyOptionsLevels(root, '2026-10-01')).toEqual([])
  })

  it('品种目录清空后被删除', () => {
    const root = seed(['legacy/options-levels/ETHUSD/2026-08-01.jsonl.gz'])

    pruneLegacyOptionsLevels(root, '2026-10-01')

    expect(readdirSync(join(root, 'legacy/options-levels'))).toEqual([])
  })
})
