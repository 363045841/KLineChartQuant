/** 自选股状态与 IndexedDB 持久化。 */

import {
  createDocumentStore,
  type DocumentStore,
  type PersistenceCodec,
} from '@363045841yyt/klinechart-core'
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

let watchlistPersistence: DocumentStore<SearchableSymbol[]> | null = null

/** 按需创建自选列表仓库；模块导入不打开数据库。 */
function watchlistStore(): DocumentStore<SearchableSymbol[]> {
  watchlistPersistence ??= createDocumentStore<SearchableSymbol[]>({
    databaseName: WATCHLIST_DATABASE_NAME,
    version: WATCHLIST_DATABASE_VERSION,
    storeName: WATCHLIST_STORE_NAME,
    key: WATCHLIST_ITEMS_KEY,
    codec: watchlistCodec,
  })
  return watchlistPersistence
}

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

let watchlistGroupingPersistence: DocumentStore<WatchlistGrouping> | null = null

/** 按需创建分组偏好仓库。 */
function watchlistGroupingStore(): DocumentStore<WatchlistGrouping> {
  watchlistGroupingPersistence ??= createDocumentStore<WatchlistGrouping>({
    databaseName: WATCHLIST_DATABASE_NAME,
    version: WATCHLIST_DATABASE_VERSION,
    storeName: WATCHLIST_STORE_NAME,
    key: WATCHLIST_GROUPING_KEY,
    codec: watchlistGroupingCodec,
  })
  return watchlistGroupingPersistence
}

/** 从 IndexedDB 读取并校验自选股列表；读取失败会抛出，不能当成空列表。 */
export async function loadWatchlist(): Promise<SearchableSymbol[]> {
  return (await watchlistStore().read()) ?? []
}

/** 将当前自选股快照写入 IndexedDB。 */
export async function saveWatchlist(items: ReadonlyArray<SearchableSymbol>): Promise<void> {
  await watchlistStore().write(items.map((item) => toRaw(item)))
}

/** 读取分组偏好；未保存过时使用默认维度。 */
export async function loadWatchlistGrouping(): Promise<WatchlistGrouping> {
  return (await watchlistGroupingStore().read()) ?? DEFAULT_WATCHLIST_GROUPING
}

/** 保存分组偏好。 */
export async function saveWatchlistGrouping(grouping: WatchlistGrouping): Promise<void> {
  await watchlistGroupingStore().write(grouping)
}

/** 关闭自选持久化连接；页面卸载或测试重置时调用。 */
export async function disposeWatchlistPersistence(): Promise<void> {
  const stores = [watchlistPersistence, watchlistGroupingPersistence]
  watchlistPersistence = null
  watchlistGroupingPersistence = null
  await Promise.all(stores.map((store) => store?.dispose()))
}

/** 管理自选股内存状态，并按操作顺序持久化最新快照。 */
export function useWatchlist() {
  const watchlistItems = shallowRef<SearchableSymbol[]>([])
  const watchlistGrouping = ref<WatchlistGrouping>(DEFAULT_WATCHLIST_GROUPING)
  const watchlistError = ref<string | null>(null)
  const watchlistKeys = computed(
    () => new Set(watchlistItems.value.map((item) => symbolIdentityKey(item))),
  )
  let restoreTask: Promise<void> | null = null

  /** 把存储失败转成界面可读文案，不用默认值掩盖失败。 */
  function reportError(error: unknown, fallback: string): void {
    watchlistError.value = error instanceof Error ? error.message : fallback
  }

  /** 从 IndexedDB 恢复列表与分组偏好；读取失败保留错误状态，不覆盖已有数据。 */
  function restoreWatchlist(): Promise<void> {
    if (restoreTask !== null) return restoreTask
    restoreTask = Promise.all([
      loadWatchlist().catch((error: unknown) => {
        reportError(error, '自选股读取失败')
        return [] as SearchableSymbol[]
      }),
      loadWatchlistGrouping().catch((error: unknown) => {
        reportError(error, '自选股分组读取失败')
        return DEFAULT_WATCHLIST_GROUPING
      }),
    ]).then(([items, grouping]) => {
      watchlistItems.value = items
      watchlistGrouping.value = grouping
    })
    return restoreTask
  }

  /** 在单个事务里修改列表，避免跨标签页整份快照覆盖。 */
  async function changeWatchlist(
    change: (items: ReadonlyArray<SearchableSymbol>) => SearchableSymbol[],
  ): Promise<void> {
    await restoreWatchlist()
    try {
      watchlistItems.value = await watchlistStore().update((current) => change(current ?? []))
      watchlistError.value = null
    } catch (error) {
      reportError(error, '自选股保存失败')
    }
  }

  /** 添加品种并按稳定身份去重。 */
  async function addWatchlistItem(item: SearchableSymbol): Promise<void> {
    const identity = symbolIdentityKey(item)
    await changeWatchlist((items) =>
      items.some((saved) => symbolIdentityKey(saved) === identity)
        ? [...items]
        : [...items, toRaw(item)],
    )
  }

  /** 移除指定品种并持久化剩余列表。 */
  async function removeWatchlistItem(item: SearchableSymbol): Promise<void> {
    const identity = symbolIdentityKey(item)
    await changeWatchlist((items) => items.filter((saved) => symbolIdentityKey(saved) !== identity))
  }

  /** 切换分组维度并持久化；相同维度不产生写入。 */
  async function setWatchlistGrouping(grouping: WatchlistGrouping): Promise<void> {
    if (watchlistGrouping.value === grouping) return
    watchlistGrouping.value = grouping
    try {
      await saveWatchlistGrouping(grouping)
      watchlistError.value = null
    } catch (error) {
      reportError(error, '自选股分组保存失败')
    }
  }

  return {
    watchlistItems,
    watchlistKeys,
    watchlistGrouping,
    watchlistError,
    restoreWatchlist,
    addWatchlistItem,
    removeWatchlistItem,
    setWatchlistGrouping,
  }
}
