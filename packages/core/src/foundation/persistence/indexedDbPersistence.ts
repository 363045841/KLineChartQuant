import type { PersistenceCodec } from './localStoragePersistence.js'

/** 一个已绑定 IndexedDB record 的异步持久化实例。 */
export interface IndexedDbPersistence<T> {
  /** 读取、校验持久化值；无值、损坏或 IndexedDB 不可用时返回 null。 */
  load(): Promise<T | null>
  /** 立即写入 value，并取消尚未完成的延迟写入；失败时抛出原始错误。 */
  save(value: T): Promise<boolean>
  /** 安排一次延迟写入；实际写入时才调用 createValue 取值。 */
  schedule(createValue: () => T): void
  /** 立即提交最新的待写快照；没有待写快照时返回 true。 */
  flush(): Promise<boolean>
  /** 删除该 record 的值，并取消尚未完成的延迟写入；失败时抛出原始错误。 */
  clear(): Promise<boolean>
  /** 释放监听页面生命周期的资源，并补写最新待写快照。 */
  dispose(): Promise<void>
}

/** 创建 IndexedDB 持久化实例的选项。 */
export interface CreateIndexedDbPersistenceOptions<T> {
  /** IndexedDB 数据库名称。 */
  readonly databaseName: string
  /** 数据库 schema 版本，默认 1。 */
  readonly databaseVersion?: number
  /** 用于保存持久化 record 的 object store 名称。 */
  readonly storeName: string
  /** object store 中用于定位此持久化值的 record key。 */
  readonly key: IDBValidKey
  /** 持久化值与领域值之间的显式边界。 */
  readonly codec: PersistenceCodec<T>
  /** 延迟写入时长，默认 1 秒。 */
  readonly debounceMs?: number
  /** 是否在 pagehide 时补写，默认 true。 */
  readonly flushOnPageHide?: boolean
}

const DEFAULT_DEBOUNCE_MS = 1_000

function openDatabase<T>(options: CreateIndexedDbPersistenceOptions<T>): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is unavailable'))
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(options.databaseName, options.databaseVersion ?? 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(options.storeName)) {
        request.result.createObjectStore(options.storeName)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'))
    request.onblocked = () => reject(new Error('IndexedDB upgrade was blocked'))
  })
}

/** 创建具备 JSON 无关编解码、延迟写入和 pagehide 补写能力的 IndexedDB 持久化实例。 */
export function createIndexedDbPersistence<T>(
  options: CreateIndexedDbPersistenceOptions<T>,
): IndexedDbPersistence<T> {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS
  const flushOnPageHide = options.flushOnPageHide ?? true
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: { readonly createValue: () => T } | null = null
  let disposed = false

  function cancelScheduledWrite(): void {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  async function transact<R>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest<R>,
  ): Promise<R> {
    const database = await openDatabase(options)
    try {
      return await new Promise<R>((resolve, reject) => {
        const transaction = database.transaction(options.storeName, mode)
        const request = run(transaction.objectStore(options.storeName))
        transaction.oncomplete = () => resolve(request.result)
        request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
        transaction.onerror = () =>
          reject(transaction.error ?? new Error('IndexedDB transaction failed'))
        transaction.onabort = () =>
          reject(transaction.error ?? new Error('IndexedDB transaction aborted'))
      })
    } finally {
      database.close()
    }
  }

  async function write(value: T): Promise<boolean> {
    await transact('readwrite', (store) => store.put(options.codec.encode(value), options.key))
    return true
  }

  async function flush(): Promise<boolean> {
    cancelScheduledWrite()
    if (!pending) return true
    const next = pending
    pending = null
    return await write(next.createValue())
  }

  function onPageHide(): void {
    void flush().catch((error: unknown) => console.error('IndexedDB pagehide flush failed', error))
  }

  if (flushOnPageHide) globalThis.addEventListener?.('pagehide', onPageHide)

  return {
    async load(): Promise<T | null> {
      try {
        const value = await transact('readonly', (store) => store.get(options.key))
        return value === undefined ? null : options.codec.decode(value)
      } catch {
        return null
      }
    },
    async save(value: T): Promise<boolean> {
      if (disposed) throw new Error('IndexedDB persistence is disposed')
      cancelScheduledWrite()
      pending = null
      return await write(value)
    },
    schedule(createValue: () => T): void {
      if (disposed) return
      pending = { createValue }
      cancelScheduledWrite()
      timer = setTimeout(() => {
        void flush().catch((error: unknown) =>
          console.error('IndexedDB scheduled flush failed', error),
        )
      }, debounceMs)
    },
    async flush(): Promise<boolean> {
      if (disposed) throw new Error('IndexedDB persistence is disposed')
      return await flush()
    },
    async clear(): Promise<boolean> {
      if (disposed) throw new Error('IndexedDB persistence is disposed')
      cancelScheduledWrite()
      pending = null
      await transact('readwrite', (store) => store.delete(options.key))
      return true
    },
    async dispose(): Promise<void> {
      if (disposed) return
      await flush()
      disposed = true
      if (flushOnPageHide) globalThis.removeEventListener?.('pagehide', onPageHide)
    },
  }
}
