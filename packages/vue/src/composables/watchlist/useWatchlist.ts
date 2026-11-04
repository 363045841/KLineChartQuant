/** 自选股状态与 IndexedDB 持久化。 */

import { createIndexedDbPersistence, type PersistenceCodec } from '@363045841yyt/klinechart-core'
import type { SearchableSymbol } from '@vue-src/composables/symbol/useSymbolSearch.js'
import { symbolIdentityKey } from '@vue-src/composables/symbol/useSymbolSearch.js'
import { computed, ref, shallowRef, toRaw } from 'vue'

export const WATCHLIST_DATABASE_NAME = '@363045841yyt/klinechart'
const WATCHLIST_DATABASE_VERSION = 1
const WATCHLIST_STORE_NAME = 'watchlist'
const WATCHLIST_ITEMS_KEY = 'items'
const WATCHLIST_GROUPING_KEY = 'grouping'

/** 自选分组维度；界面与持久化共用同一份取值。 */
const WATCHLIST_GROUPINGS = ['source', 'instrumentType'] as const
export type WatchlistGrouping = (typeof WATCHLIST_GROUPINGS)[number]

/** 默认按品种归类：自选首先要回答“关注了哪些品种”，数据源是次要维度。 */
const DEFAULT_WATCHLIST_GROUPING: WatchlistGrouping = 'instrumentType'

/** 判断 IndexedDB 中的值是否为可用的统一品种描述。 */
function isWatchlistItem(value: unknown): value is SearchableSymbol {
  if (typeof value !== 'object' || value === null) return false
  const item = value as Record<string, unknown>
  return (
    typeof item.id === 'string' &&
    typeof item.sourceId === 'string' &&
    typeof item.symbol === 'string' &&
    typeof item.name === 'string' &&
    typeof item.instrumentType === 'string' &&
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

/** 判断 IndexedDB 中的值是否为受支持的分组维度。 */
function isWatchlistGrouping(value: unknown): value is WatchlistGrouping {
  return typeof value === 'string' && (WATCHLIST_GROUPINGS as ReadonlyArray<string>).includes(value)
}

const watchlistGroupingCodec: PersistenceCodec<WatchlistGrouping> = {
  decode(value): WatchlistGrouping | null {
    return isWatchlistGrouping(value) ? value : null
  },
  encode(value): unknown {
    return value
  },
}

const watchlistGroupingPersistence = createIndexedDbPersistence({
  databaseName: WATCHLIST_DATABASE_NAME,
  databaseVersion: WATCHLIST_DATABASE_VERSION,
  storeName: WATCHLIST_STORE_NAME,
  key: WATCHLIST_GROUPING_KEY,
  codec: watchlistGroupingCodec,
})

/** 从 IndexedDB 读取并校验自选股列表。 */
export async function loadWatchlist(): Promise<SearchableSymbol[]> {
  return (await watchlistPersistence.load()) ?? []
}

/** 将当前自选股快照写入 IndexedDB。 */
export async function saveWatchlist(items: ReadonlyArray<SearchableSymbol>): Promise<void> {
  await watchlistPersistence.save(items.map((item) => toRaw(item)))
}

/** 读取分组偏好；未保存过时使用默认维度。 */
export async function loadWatchlistGrouping(): Promise<WatchlistGrouping> {
  return (await watchlistGroupingPersistence.load()) ?? DEFAULT_WATCHLIST_GROUPING
}

/** 保存分组偏好。 */
export async function saveWatchlistGrouping(grouping: WatchlistGrouping): Promise<void> {
  await watchlistGroupingPersistence.save(grouping)
}

/** 管理自选股内存状态，并按操作顺序持久化最新快照。 */
export function useWatchlist() {
  const watchlistItems = shallowRef<SearchableSymbol[]>([])
  const watchlistGrouping = ref<WatchlistGrouping>(DEFAULT_WATCHLIST_GROUPING)
  const watchlistKeys = computed(
    () => new Set(watchlistItems.value.map((item) => symbolIdentityKey(item))),
  )
  let restoreTask: Promise<void> | null = null
  let writeQueue = Promise.resolve()
  let groupingWriteQueue = Promise.resolve()

  /** 从 IndexedDB 恢复列表与分组偏好，存储不可用时保持默认值。 */
  function restoreWatchlist(): Promise<void> {
    if (restoreTask !== null) return restoreTask
    restoreTask = Promise.all([
      loadWatchlist().catch(() => [] as SearchableSymbol[]),
      loadWatchlistGrouping().catch(() => DEFAULT_WATCHLIST_GROUPING),
    ]).then(([items, grouping]) => {
      watchlistItems.value = items
      watchlistGrouping.value = grouping
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

  /** 切换分组维度并持久化；相同维度不产生写入。 */
  function setWatchlistGrouping(grouping: WatchlistGrouping): Promise<void> {
    if (watchlistGrouping.value === grouping) return groupingWriteQueue
    watchlistGrouping.value = grouping
    groupingWriteQueue = groupingWriteQueue
      .catch(() => undefined)
      .then(() => saveWatchlistGrouping(grouping))
      .catch(() => undefined)
    return groupingWriteQueue
  }

  return {
    watchlistItems,
    watchlistKeys,
    watchlistGrouping,
    restoreWatchlist,
    addWatchlistItem,
    removeWatchlistItem,
    setWatchlistGrouping,
  }
}
