/** 自选股状态与 IndexedDB 持久化。 */

import { computed, shallowRef, toRaw } from 'vue'

import type { SearchableSymbol } from './useSymbolSearch'
import { symbolIdentityKey } from './useSymbolSearch'

export const WATCHLIST_DATABASE_NAME = '@363045841yyt/klinechart'
const WATCHLIST_DATABASE_VERSION = 1
const WATCHLIST_STORE_NAME = 'watchlist'
const WATCHLIST_ITEMS_KEY = 'items'

/** 打开自选股数据库，并在首次使用时创建 object store。 */
function openWatchlistDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is unavailable'))
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(WATCHLIST_DATABASE_NAME, WATCHLIST_DATABASE_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(WATCHLIST_STORE_NAME)) {
        request.result.createObjectStore(WATCHLIST_STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Failed to open watchlist database'))
    request.onblocked = () => reject(new Error('Watchlist database upgrade was blocked'))
  })
}

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

/** 从 IndexedDB 读取并校验自选股列表。 */
export async function loadWatchlist(): Promise<SearchableSymbol[]> {
  const database = await openWatchlistDatabase()
  try {
    const stored = await new Promise<unknown>((resolve, reject) => {
      const transaction = database.transaction(WATCHLIST_STORE_NAME, 'readonly')
      const request = transaction.objectStore(WATCHLIST_STORE_NAME).get(WATCHLIST_ITEMS_KEY)
      let result: unknown

      request.onsuccess = () => {
        result = request.result
      }
      transaction.oncomplete = () => resolve(result)
      transaction.onerror = () =>
        reject(transaction.error ?? new Error('Failed to read watchlist database'))
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('Watchlist read transaction was aborted'))
    })
    return Array.isArray(stored) ? stored.filter(isWatchlistItem) : []
  } finally {
    database.close()
  }
}

/** 将当前自选股快照写入 IndexedDB。 */
export async function saveWatchlist(items: ReadonlyArray<SearchableSymbol>): Promise<void> {
  const database = await openWatchlistDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(WATCHLIST_STORE_NAME, 'readwrite')
      const cloneableItems = items.map((item) => toRaw(item))
      transaction.objectStore(WATCHLIST_STORE_NAME).put(cloneableItems, WATCHLIST_ITEMS_KEY)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () =>
        reject(transaction.error ?? new Error('Failed to write watchlist database'))
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('Watchlist write transaction was aborted'))
    })
  } finally {
    database.close()
  }
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
