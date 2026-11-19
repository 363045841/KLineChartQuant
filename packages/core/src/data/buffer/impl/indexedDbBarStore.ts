/**
 * 行情落盘缓存：把 Provider 返回的 K 线页存进 IndexedDB，跨会话复用。
 *
 * 只做「按选择身份 + 时间块」存取，不做分页推导；页的根数与游标由调用方给。
 * 修正检测在这里收口：新页与已存页在相同时间戳上取值不同，就认为上游修正了历史，
 * 整段选择作废后重存，避免新旧数据混在一起。
 */

import type { BarSeries, InstrumentDescriptor, OlderDataStatus } from '@/data/provider/types.js'
import type { KLineData } from '@/foundation/types/price.js'
import { continuousTail } from './barContinuity.js'

/** 落盘时一并保存的序列身份，读取时用它重建缓存条目。 */
export interface BarCachePageMeta {
  readonly sourceId: string
  readonly instrument: InstrumentDescriptor
  readonly series: Omit<BarSeries, 'data' | 'olderData'>
}

/** 一条已落盘的 K 线页。 */
export interface BarCachePage {
  readonly selectionKey: string
  /** 页内最早与最晚时间戳，读取时用来筛时间窗口。 */
  readonly firstTimestamp: number
  readonly lastTimestamp: number
  readonly bars: readonly KLineData[]
  readonly meta: BarCachePageMeta
  readonly olderData: OlderDataStatus
  /** 落盘时间；用于 TTL 与全局淘汰。 */
  readonly savedAt: number
}

/** 落盘页的写入参数，落盘时间由仓库补。 */
export type BarCachePageInput = Omit<BarCachePage, 'savedAt' | 'firstTimestamp' | 'lastTimestamp'>

/** 读取请求：不给游标表示取最新一页。 */
export interface BarCacheReadOptions {
  readonly beforeTimestamp?: number
  readonly limit: number
  /** 期望的 K 线步长（毫秒）；给出时只返回末尾连续段，缺口一律按未命中处理。 */
  readonly stepMs?: number
}

/** 写入结果：corrected 表示检测到上游修正并已整体作废该选择。 */
export interface BarCacheWriteResult {
  readonly corrected: boolean
}

/** 落盘缓存契约；测试与宿主都可以换成别的实现。 */
export interface BarPageStore {
  read(selectionKey: string, options: BarCacheReadOptions): Promise<BarCachePage | null>
  write(page: BarCachePageInput): Promise<BarCacheWriteResult>
  clearSelection(selectionKey: string): Promise<void>
  clearAll(): Promise<void>
  stats(): Promise<BarStoreStats>
  /** 已落盘的全部选择身份；校验历史时按选择逐个遍历。 */
  listSelections(): Promise<readonly string[]>
  /** 某选择身份已落盘的全部页，按页内最晚时间升序。 */
  listSelection(selectionKey: string): Promise<readonly BarCachePage[]>
}

/** 落盘占用统计；bytes 是写入时估算的序列化体积。 */
export interface BarStoreStats {
  readonly pages: number
  readonly bars: number
  readonly bytes: number
}

/** 数据库与仓库名；版本变化时旧数据整体丢弃。 */
/** 数据库名；测试需要直接打补丁时使用。 */
export const BAR_STORE_DATABASE_NAME = '@363045841yyt/klinechart-market-data'
const DATABASE_NAME = BAR_STORE_DATABASE_NAME
const STORE_NAME = 'bar-pages'
const DATABASE_VERSION = 1
/** 每个选择身份最多保留的页数；500 根一页时约 20 万根。 */
const MAX_PAGES_PER_SELECTION = 400
/** 全局保留页数上限，超出按落盘时间淘汰最旧的。 */
const MAX_PAGES_TOTAL = 2000
/** 历史页有效期；开发期源可能修正历史，过期后重新取。 */
const MAX_PAGE_AGE_MS = 7 * 24 * 60 * 60 * 1000

interface StoredRecord extends BarCachePage {
  /** 主键：选择身份 + 页内最早时间戳，同一页重复写入只保留一份。 */
  readonly id: string
  /** 写入时估算的序列化体积；避免统计时反复序列化整页。 */
  readonly bytes: number
}

/** 打开数据库；只在首次调用时建立连接。 */
let databasePromise: Promise<IDBDatabase> | null = null

/** 缩窄 unknown 到 IDBRequest 的结果。 */
function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

/** 等待事务提交，写入顺序与调用顺序一致。 */
function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB write failed'))
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB write aborted'))
  })
}

/** 打开（必要时创建）行情缓存库。 */
function openDatabase(): Promise<IDBDatabase> {
  databasePromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (database.objectStoreNames.contains(STORE_NAME)) database.deleteObjectStore(STORE_NAME)
      const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' })
      store.createIndex('selectionKey', 'selectionKey')
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'))
  })
  return databasePromise
}

/** 两个 K 线在同时间戳上的取值是否一致；判定上游是否修正了历史。 */
export function sameBarValues(left: KLineData, right: KLineData): boolean {
  return (
    left.open === right.open &&
    left.high === right.high &&
    left.low === right.low &&
    left.close === right.close &&
    left.volume === right.volume
  )
}

/** 读取某选择身份的全部页，按页内最晚时间升序。 */
async function readSelection(database: IDBDatabase, selectionKey: string): Promise<StoredRecord[]> {
  const transaction = database.transaction(STORE_NAME, 'readonly')
  const index = transaction.objectStore(STORE_NAME).index('selectionKey')
  const records = await requestResult<StoredRecord[]>(index.getAll(selectionKey))
  return records.sort((left, right) => left.lastTimestamp - right.lastTimestamp)
}

/** 删除若干主键。 */
async function deleteRecords(database: IDBDatabase, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return
  const transaction = database.transaction(STORE_NAME, 'readwrite')
  const store = transaction.objectStore(STORE_NAME)
  for (const id of ids) store.delete(id)
  await transactionDone(transaction)
}

/** 统计页数、总根数与估算字节；供设置面板展示。 */
async function reportStats(database: IDBDatabase): Promise<BarStoreStats> {
  const transaction = database.transaction(STORE_NAME, 'readonly')
  const records = await requestResult<StoredRecord[]>(transaction.objectStore(STORE_NAME).getAll())
  return {
    pages: records.length,
    bars: records.reduce((sum, record) => sum + record.bars.length, 0),
    bytes: records.reduce((sum, record) => sum + (record.bytes ?? pageBytes(record)), 0),
  }
}

/** 估算一页的序列化体积；写入时算一次，统计与淘汰都复用它。 */
function pageBytes(page: BarCachePageInput): number {
  try {
    return JSON.stringify(page.bars).length * 2
  } catch {
    return page.bars.length * 64
  }
}

/** 创建基于 IndexedDB 的行情落盘缓存。 */
export function createIndexedDbBarStore(): BarPageStore {
  /** 读取一页：从已存页里拼出请求窗口，命中不足即视为未命中。 */
  async function read(
    selectionKey: string,
    options: BarCacheReadOptions,
  ): Promise<BarCachePage | null> {
    if (typeof indexedDB === 'undefined') return null
    const database = await openDatabase()
    const records = await readSelection(database, selectionKey)
    if (records.length === 0) return null
    const now = Date.now()
    const usable = records.filter((record) => now - record.savedAt <= MAX_PAGE_AGE_MS)
    if (usable.length === 0) return null
    const cutoff = options.beforeTimestamp ?? Number.POSITIVE_INFINITY
    // 跨游标的页也要参与：页内按时间戳筛选，游标落在页中间时不能整页丢掉。
    const candidates = usable
    if (candidates.length === 0) return null
    const merged = new Map<number, KLineData>()
    for (const record of candidates) {
      for (const bar of record.bars) merged.set(bar.timestamp, bar)
    }
    const bars = [...merged.values()]
      .filter((bar) => bar.timestamp < cutoff)
      .sort((left, right) => left.timestamp - right.timestamp)
    if (bars.length < options.limit) return null
    // 页间缺口不能拼成一条序列：裁到末尾连续段，凑不满就按未命中回源。
    const continuous = continuousTail(bars, options.stepMs ?? null)
    if (continuous.length < options.limit) return null
    const slice = continuous.slice(-options.limit)
    const last = candidates[candidates.length - 1]
    return {
      selectionKey,
      firstTimestamp: slice[0]?.timestamp ?? 0,
      lastTimestamp: slice[slice.length - 1]?.timestamp ?? 0,
      bars: slice,
      meta: last.meta,
      olderData: last.olderData,
      savedAt: last.savedAt,
    }
  }

  /** 写入一页；与已存页冲突时整段作废，返回 corrected。 */
  async function write(page: BarCachePageInput): Promise<BarCacheWriteResult> {
    if (typeof indexedDB === 'undefined') return { corrected: false }
    if (page.bars.length === 0) return { corrected: false }
    const database = await openDatabase()
    const records = await readSelection(database, page.selectionKey)
    const incoming = new Map(page.bars.map((bar) => [bar.timestamp, bar]))
    const bars = [...incoming.values()].sort((left, right) => left.timestamp - right.timestamp)
    const newest = bars[bars.length - 1]?.timestamp
    let corrected = false
    for (const record of records) {
      for (const bar of record.bars) {
        // 最新一根可能还在形成中，取值变化不算历史修正。
        if (bar.timestamp === newest) continue
        const fresh = incoming.get(bar.timestamp)
        if (fresh !== undefined && !sameBarValues(bar, fresh)) {
          corrected = true
          break
        }
      }
      if (corrected) break
    }
    if (corrected)
      await deleteRecords(
        database,
        records.map((record) => record.id),
      )

    const record: StoredRecord = {
      id: `${page.selectionKey}|${bars[0]?.timestamp ?? 0}`,
      selectionKey: page.selectionKey,
      firstTimestamp: bars[0]?.timestamp ?? 0,
      lastTimestamp: bars[bars.length - 1]?.timestamp ?? 0,
      bars,
      meta: page.meta,
      olderData: page.olderData,
      savedAt: Date.now(),
      bytes: pageBytes(page),
    }
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put(record)
    await transactionDone(transaction)

    // 先按选择身份淘汰超出页数上限的旧页，再按全局上限淘汰最久未写的页。
    const kept = corrected ? [record] : [...records, record]
    const overflow = kept.slice(0, Math.max(0, kept.length - MAX_PAGES_PER_SELECTION))
    await deleteRecords(
      database,
      overflow.map((item) => item.id),
    )
    const all = await requestResult<StoredRecord[]>(
      database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll(),
    )
    if (all.length > MAX_PAGES_TOTAL) {
      const oldest = all
        .sort((left, right) => left.savedAt - right.savedAt)
        .slice(0, all.length - MAX_PAGES_TOTAL)
      await deleteRecords(
        database,
        oldest.map((item) => item.id),
      )
    }
    return { corrected }
  }

  return {
    read,
    write,
    async clearSelection(selectionKey) {
      if (typeof indexedDB === 'undefined') return
      const database = await openDatabase()
      const records = await readSelection(database, selectionKey)
      await deleteRecords(
        database,
        records.map((record) => record.id),
      )
    },
    async clearAll() {
      if (typeof indexedDB === 'undefined') return
      const database = await openDatabase()
      const transaction = database.transaction(STORE_NAME, 'readwrite')
      transaction.objectStore(STORE_NAME).clear()
      await transactionDone(transaction)
    },
    async stats() {
      if (typeof indexedDB === 'undefined') return { pages: 0, bars: 0, bytes: 0 }
      return reportStats(await openDatabase())
    },
    async listSelections() {
      if (typeof indexedDB === 'undefined') return []
      const database = await openDatabase()
      const records = await requestResult<StoredRecord[]>(
        database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll(),
      )
      return [...new Set(records.map((record) => record.selectionKey))]
    },
    async listSelection(selectionKey) {
      if (typeof indexedDB === 'undefined') return []
      return readSelection(await openDatabase(), selectionKey)
    },
  }
}
