/** 工具栏选项收藏：级别与复权共用同一套编解码与切换逻辑。 */
import type { KeyValueStorage } from '@363045841yyt/klinechart-core'
import { KLineAdjustment, KLinePeriod } from '@363045841yyt/klinechart-core/market-data'
import { describe, expect, it } from 'vitest'
import { createKLineAdjustmentFavorites } from '../useKLineAdjustmentFavorites.js'
import { createKLineLevelFavorites } from '../useKLineLevelFavorites.js'
import type { OptionFavoritesState } from '../useOptionFavorites.js'

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

/** 两份收藏实例的差异只在值域；其余行为用同一张表覆盖。 */
const CASES: ReadonlyArray<{
  name: string
  create: (options?: { storage?: KeyValueStorage | null }) => OptionFavoritesState<string>
  valid: string
  invalid: string
}> = [
  {
    name: '级别',
    create: (options) => createKLineLevelFavorites(options),
    valid: KLinePeriod.Min1,
    invalid: KLineAdjustment.Qfq,
  },
  {
    name: '复权',
    create: (options) => createKLineAdjustmentFavorites(options),
    valid: KLineAdjustment.Qfq,
    invalid: KLinePeriod.Min1,
  },
]

describe.each(CASES)('$name 收藏', ({ create, valid, invalid }) => {
  it('只恢复已知选项并去重', () => {
    const memory = createMemoryStorage(JSON.stringify([valid, invalid, valid]))
    const favorites = create({ storage: memory.storage })

    expect(favorites.favoriteOptions.value).toEqual([valid])
  })

  it('切换收藏并写入存储', () => {
    const memory = createMemoryStorage()
    const favorites = create({ storage: memory.storage })

    favorites.toggleFavorite(valid)
    expect(favorites.isFavorite(valid)).toBe(true)
    expect(memory.read()).toEqual([valid])

    favorites.toggleFavorite(valid)
    expect(favorites.isFavorite(valid)).toBe(false)
    expect(memory.read()).toEqual([])
  })
})
