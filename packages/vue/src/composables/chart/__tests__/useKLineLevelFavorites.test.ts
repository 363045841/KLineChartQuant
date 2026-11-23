/** 级别收藏：只保留已知档位、去重，并在切换时同步落盘。 */
import type { KeyValueStorage } from '@363045841yyt/klinechart-core'
import { KLinePeriod } from '@363045841yyt/klinechart-core/market-data'
import { describe, expect, it } from 'vitest'
import { createKLineLevelFavorites } from '../useKLineLevelFavorites.js'

/** 内存版键值存储：读取最近一次写入的 JSON，便于断言编解码结果。 */
function createMemoryStorage(initialValue: string | null = null) {
  let stored = initialValue
  const storage: KeyValueStorage = {
    getItem: () => stored,
    setItem: (_key, value) => {
      stored = value
    },
    removeItem: () => {
      stored = null
    },
  }
  return { storage, read: () => (stored === null ? null : JSON.parse(stored)) }
}

describe('useKLineLevelFavorites', () => {
  it('restores only known levels, deduplicated', () => {
    const memory = createMemoryStorage(
      JSON.stringify([KLinePeriod.Min1, 'bogus', KLinePeriod.Min1, 'timeshare']),
    )
    const favorites = createKLineLevelFavorites({ storage: memory.storage })

    expect(favorites.favoriteLevels.value).toEqual([KLinePeriod.Min1, 'timeshare'])
  })

  it('toggles a level and writes each snapshot', () => {
    const memory = createMemoryStorage()
    const favorites = createKLineLevelFavorites({ storage: memory.storage })

    favorites.toggleFavorite(KLinePeriod.Daily)
    expect(favorites.isFavorite(KLinePeriod.Daily)).toBe(true)
    expect(memory.read()).toEqual([KLinePeriod.Daily])

    favorites.toggleFavorite(KLinePeriod.Daily)
    expect(favorites.isFavorite(KLinePeriod.Daily)).toBe(false)
    expect(memory.read()).toEqual([])
  })
})
