/** 行情落盘缓存：读写窗口、修正作废、过期与整体清空。 */
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  BAR_STORE_DATABASE_NAME,
  type BarPageStore,
  createIndexedDbBarStore,
} from '../impl/indexedDbBarStore.js'

const SELECTION = 'test|binance:spot:BTCUSDT|daily|none|original'
const META = {
  sourceId: 'binance',
  instrument: {
    id: 'binance:spot:BTCUSDT',
    sourceId: 'binance',
    symbol: 'BTCUSDT',
    name: 'BTC / USDT',
    instrumentType: 'crypto' as const,
    exchange: 'BINANCE',
    sessionId: 'BINANCE_SPOT',
    capabilities: { bars: { periods: ['daily' as const], adjustments: ['none' as const] } },
  },
  series: {
    instrumentId: 'binance:spot:BTCUSDT',
    period: 'daily' as const,
    adjustment: 'none' as const,
    barAggregation: 'original' as const,
    timezone: 'UTC',
  },
}

/** 构造一根 K 线；只关心时间戳与收盘价。 */
function bar(timestamp: number, close = 100) {
  return { timestamp, open: close, high: close + 1, low: close - 1, close, volume: 10 }
}

describe('行情落盘缓存', () => {
  let store: BarPageStore

  // 共用一个数据库连接，用例之间只清内容，避免删除数据库把连接卡住。
  beforeEach(async () => {
    store = createIndexedDbBarStore()
    await store.clearAll()
  })

  it('写入一页后可按游标读出同一批 K 线', async () => {
    await store.write({
      selectionKey: SELECTION,
      bars: [bar(10), bar(15), bar(20), bar(30)],
      olderData: 'available',
      meta: META,
    })

    const latest = await store.read(SELECTION, { limit: 2 })
    expect(latest?.bars.map((item) => item.timestamp)).toEqual([20, 30])
    expect(latest?.meta.sourceId).toBe('binance')

    // 游标落在页中间：只取游标之前的部分，不能整页丢掉。
    const older = await store.read(SELECTION, { limit: 2, beforeTimestamp: 20 })
    expect(older?.bars.map((item) => item.timestamp)).toEqual([10, 15])
  })

  it('同时间戳取值变化时整体作废该选择并保留新页', async () => {
    await store.write({
      selectionKey: SELECTION,
      bars: [bar(10, 100), bar(20, 100)],
      olderData: 'available',
      meta: META,
    })

    const result = await store.write({
      selectionKey: SELECTION,
      bars: [bar(20, 999), bar(30, 100)],
      olderData: 'available',
      meta: META,
    })

    expect(result.corrected).toBe(true)
    expect((await store.stats()).pages).toBe(1)
    const reloaded = await store.read(SELECTION, { limit: 2 })
    expect(reloaded?.bars.map((item) => item.close)).toEqual([999, 100])
  })

  it('过期页不再参与读取', async () => {
    await store.write({
      selectionKey: SELECTION,
      bars: [bar(10), bar(20)],
      olderData: 'available',
      meta: META,
    })
    expect(await store.read(SELECTION, { limit: 2 })).not.toBeNull()

    // 直接把落盘时间改成 8 天前，验证超过有效期后不再读取。
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(BAR_STORE_DATABASE_NAME)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('bar-pages', 'readwrite')
      const objectStore = transaction.objectStore('bar-pages')
      const cursorRequest = objectStore.openCursor()
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result
        if (!cursor) return
        const record = { ...cursor.value, savedAt: Date.now() - 8 * 24 * 60 * 60 * 1000 }
        cursor.update(record)
        cursor.continue()
      }
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
    database.close()

    expect(await store.read(SELECTION, { limit: 2 })).toBeNull()
  })

  it('给出步长时只返回末尾连续段，缺口凑不满一页按未命中处理', async () => {
    await store.write({
      selectionKey: SELECTION,
      bars: [bar(0), bar(3600000), bar(14400000), bar(18000000)],
      olderData: 'available',
      meta: META,
    })

    const tail = await store.read(SELECTION, { limit: 2, stepMs: 3600000 })
    expect(tail?.bars.map((item) => item.timestamp)).toEqual([14400000, 18000000])

    // 末尾连续段只有 2 根；要 3 根就按未命中处理，交给回源重取。
    expect(await store.read(SELECTION, { limit: 3, stepMs: 3600000 })).toBeNull()
    // 不给步长的旧调用不受影响。
    expect((await store.read(SELECTION, { limit: 4 }))?.bars).toHaveLength(4)
  })

  it('清空后读不到任何页', async () => {
    await store.write({
      selectionKey: SELECTION,
      bars: [bar(10), bar(20)],
      olderData: 'exhausted',
      meta: META,
    })

    await store.clearAll()

    expect(await store.read(SELECTION, { limit: 1 })).toBeNull()
    expect(await store.stats()).toEqual({ pages: 0, bars: 0, bytes: 0 })
  })
})
