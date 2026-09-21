/** 自选股状态与 IndexedDB 持久化。 */

import { createIndexedDbPersistence, type PersistenceCodec } from '@363045841yyt/klinechart-core'
import { computed, shallowRef, toRaw } from 'vue'

import type { SearchableSymbol } from './useSymbolSearch.js'
import { symbolIdentityKey } from './useSymbolSearch.js'

export const WATCHLIST_DATABASE_NAME = '@363045841yyt/klinechart'
const WATCHLIST_DATABASE_VERSION = 1
const WATCHLIST_STORE_NAME = 'watchlist'
const WATCHLIST_ITEMS_KEY = 'items'

/** 判断 IndexedDB 中的值是否为可用的统一品种描述。 */
function isWatchlistItem(value: unknown): value is SearchableSymbol {
  if (typeof value !== 'object' || value === null) return false
  const item = value as Record<string, unknown>
  return (
    typeof item.id === 'string' &&
    typeof item.sourceId === 'string' &&
    typeof item.symbol === 'string' &&
    typeof item.name === 'string' &&
    typeof item.assetClass === 'string' &&
    typeof item.exchange === 'string' &&
    typeof item.capabilities === 'object' &&
    item.capabilities !== null
  )
}

const watchlistCodec: PersistenceCodec<SearchableSymbol[]> = {
  decode(value): SearchableSymbol[] | null {
    return Array.isArray(value) ? value.filter(isWatchlistItem) : null
  },
  encode(value): unknown {
    return value
  },
}

const watchlistPersistence = createIndexedDbPersistence({
  databaseName: WATCHLIST_DATABASE_NAME,
  databaseVersion: WATCHLIST_DATABASE_VERSION,
  storeName: WATCHLIST_STORE_NAME,
  key: WATCHLIST_ITEMS_KEY,
  codec: watchlistCodec,
})

/** 从 IndexedDB 读取并校验自选股列表。 */
export async function loadWatchlist(): Promise<SearchableSymbol[]> {
  return (await watchlistPersistence.load()) ?? []
}

/** 将当前自选股快照写入 IndexedDB。 */
export async function saveWatchlist(items: ReadonlyArray<SearchableSymbol>): Promise<void> {
  await watchlistPersistence.save(items.map((item) => toRaw(item)))
}

/** 管理自选股内存状态，并按操作顺序持久化最新快照。 */
export function useWatchlist() {
  const watchlistItems = shallowRef<SearchableSymbol[]>([])
  const watchlistKeys = computed(
    () => new Set(watchlistItems.value.map((item) => symbolIdentityKey(item))),
  )
  let restoreTask: Promise<void> | null = null
  let writeQueue = Promise.resolve()

  /** 从 IndexedDB 恢复列表，存储不可用时保持空列表。 */
  function restoreWatchlist(): Promise<void> {
    if (restoreTask !== null) return restoreTask
    restoreTask = loadWatchlist()
      .then((items) => {
        watchlistItems.value = items
      })
      .catch(() => {
        watchlistItems.value = []
      })
    return restoreTask
  }

  /** 将当前列表快照追加到串行写入队列。 */
  function persistWatchlist(): Promise<void> {
    const snapshot = [...watchlistItems.value]
    writeQueue = writeQueue
      .catch(() => undefined)
      .then(() => saveWatchlist(snapshot))
      .catch(() => undefined)
    return writeQueue
  }

  /** 添加品种并按稳定身份去重。 */
  async function addWatchlistItem(item: SearchableSymbol): Promise<void> {
    await restoreWatchlist()
    const identity = symbolIdentityKey(item)
    if (watchlistKeys.value.has(identity)) return
    watchlistItems.value = [...watchlistItems.value, toRaw(item)]
    return persistWatchlist()
  }

  /** 移除指定品种并持久化剩余列表。 */
  async function removeWatchlistItem(item: SearchableSymbol): Promise<void> {
    await restoreWatchlist()
    const identity = symbolIdentityKey(item)
    watchlistItems.value = watchlistItems.value.filter(
      (saved) => symbolIdentityKey(saved) !== identity,
    )
    return persistWatchlist()
  }

  return {
    watchlistItems,
    watchlistKeys,
    restoreWatchlist,
    addWatchlistItem,
    removeWatchlistItem,
  }
}
