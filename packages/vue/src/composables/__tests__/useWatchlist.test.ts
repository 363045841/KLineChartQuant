/** 自选股 IndexedDB 持久化测试。 */

import 'fake-indexeddb/auto'

import { reactive } from 'vue'
import { beforeEach, describe, expect, it } from 'vitest'

import type { SearchableSymbol } from '../useSymbolSearch'
import {
  WATCHLIST_DATABASE_NAME,
  loadWatchlist,
  saveWatchlist,
  useWatchlist,
} from '../useWatchlist'

const symbol: SearchableSymbol = {
  id: 'gotdx:stock:1:600519',
  sourceId: 'gotdx',
  symbol: '600519',
  name: '贵州茅台',
  assetClass: 'stock',
  exchange: 'SH',
  sessionId: 'CN',
  providerRef: { market: 1 },
  capabilities: {},
}

const secondSymbol: SearchableSymbol = {
  id: 'tradingview:stock:NASDAQ:AAPL',
  sourceId: 'tradingview',
  symbol: 'AAPL',
  name: 'Apple Inc.',
  assetClass: 'stock',
  exchange: 'NASDAQ',
  sessionId: 'US',
  capabilities: {},
}

/** 删除测试数据库，确保用例之间没有持久化状态。 */
function deleteWatchlistDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(WATCHLIST_DATABASE_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('Test database deletion was blocked'))
  })
}

describe('useWatchlist', () => {
  beforeEach(deleteWatchlistDatabase)

  it('persists and restores symbols through IndexedDB', async () => {
    await saveWatchlist([symbol])

    expect(await loadWatchlist()).toEqual([symbol])
  })

  it('deduplicates additions and persists removals in operation order', async () => {
    const watchlist = useWatchlist()

    const firstWrite = watchlist.addWatchlistItem(symbol)
    await watchlist.addWatchlistItem(symbol)
    const lastWrite = watchlist.removeWatchlistItem(symbol)
    await Promise.all([firstWrite, lastWrite])

    expect(watchlist.watchlistItems.value).toEqual([])
    expect(await loadWatchlist()).toEqual([])
  })

  it('restores saved items before applying the first mutation', async () => {
    await saveWatchlist([symbol])
    const watchlist = useWatchlist()

    await watchlist.addWatchlistItem(reactive(secondSymbol))

    expect(watchlist.watchlistItems.value).toEqual([symbol, secondSymbol])
    expect(await loadWatchlist()).toEqual([symbol, secondSymbol])
  })

  it('restores an empty list when the database has no saved value', async () => {
    const watchlist = useWatchlist()

    await watchlist.restoreWatchlist()

    expect(watchlist.watchlistItems.value).toEqual([])
  })
})
