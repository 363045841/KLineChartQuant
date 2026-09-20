/** 自选股 IndexedDB 持久化测试。 */

import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it } from 'vitest'
import { reactive } from 'vue'

import {
  loadWatchlist,
  saveWatchlist,
  useWatchlist,
  WATCHLIST_DATABASE_NAME,
} from '../useWatchlist'
import { TEST_SYMBOLS } from './testSymbols'

const symbol = TEST_SYMBOLS[0]!
const secondSymbol = TEST_SYMBOLS[1]!

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
