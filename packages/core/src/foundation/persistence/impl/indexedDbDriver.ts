/**
 * IndexedDB 驱动：唯一负责打开连接、升级结构、处理阻塞与版本变更并执行事务。
 *
 * @remarks
 * 连接按需建立、按实例复用；标签页切换或版本变化时主动关闭，下一次操作重新打开。
 * 连接后的所有失败统一转换成带错误码的 `KLineChartError`，避免上层把「记录不存在」
 * 与「读取失败」「业务校验失败」和「存储失败」混为一谈。
 */
import { scopedPersistenceName } from '../persistence-scope.js'
import type { DocumentDriver, DocumentKey, DocumentTransaction } from '../types.js'
import {
  blockedFailure,
  closedFailure,
  readFailure,
  unavailableFailure,
  versionMismatchFailure,
  writeFailure,
} from './errors.js'

/** 创建 IndexedDB 驱动的选项；升级回调需要 DOM 类型，因此只属于浏览器适配器。 */
export interface CreateIndexedDbDriverOptions {
  readonly databaseName: string
  readonly version: number
  /** 在升级事务内创建或调整 object store；旧版本号由 IndexedDB 提供。 */
  readonly upgrade?: (
    database: IDBDatabase,
    transaction: IDBTransaction,
    oldVersion: number,
  ) => void
}

/** 把契约键转成 IDB 可接受的键；数组键复制成可变数组，避免只读类型进入实现。 */
function toIdbKey(key: DocumentKey): string | string[] {
  return typeof key === 'string' ? key : [...key]
}

/** 把事件回调形式的请求转成 Promise；失败时保留底层 DOMException。 */
function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** 打开失败分类：版本高于当前代码时与普通不可用需要不同的恢复动作。 */
function openFailure(error: unknown) {
  return error instanceof DOMException && error.name === 'VersionError'
    ? versionMismatchFailure(error)
    : unavailableFailure(error)
}

/**
 * 创建 IndexedDB 驱动。
 *
 * @param options - 数据库名、版本与升级回调
 * @returns 由调用方负责释放的文档驱动
 */
export function createIndexedDbDriver(options: CreateIndexedDbDriverOptions): DocumentDriver {
  let database: IDBDatabase | null = null
  let opening: Promise<IDBDatabase> | null = null
  let disposed = false

  /** 建立连接；并发调用共享同一次打开。 */
  function connect(): Promise<IDBDatabase> {
    if (disposed) return Promise.reject(closedFailure())
    if (database) return Promise.resolve(database)
    if (opening) return opening
    // 这里刻意保留一次能力检查：它只存在于浏览器适配器内部，用来把缺失的全局
    // 转成类型化错误，而不是让 ReferenceError 穿透到调用方。
    if (typeof indexedDB === 'undefined') return Promise.reject(unavailableFailure())

    const request = indexedDB.open(scopedPersistenceName(options.databaseName), options.version)
    let settled = false
    let blocked = false

    opening = new Promise<IDBDatabase>((resolve, reject) => {
      /** 只结算一次；结算后的事件仍然负责关闭迟到的连接。 */
      const fail = (error: unknown): void => {
        if (settled) return
        settled = true
        opening = null
        reject(error)
      }

      request.onupgradeneeded = (event) => {
        try {
          options.upgrade?.(request.result, request.transaction!, event.oldVersion)
        } catch (error) {
          settled = true
          opening = null
          request.transaction?.abort()
          reject(error)
        }
      }
      request.onsuccess = () => {
        const connection = request.result
        opening = null
        // 连接建立后仍要检查释放与阻塞：成功事件可能晚于关闭动作到达。
        if (settled || blocked || disposed) {
          connection.close()
          if (!settled && !blocked) reject(closedFailure())
          return
        }
        settled = true
        database = connection
        connection.onversionchange = () => {
          connection.close()
          if (database === connection) database = null
        }
        connection.onclose = () => {
          if (database === connection) database = null
        }
        resolve(connection)
      }
      request.onerror = () => fail(openFailure(request.error))
      request.onblocked = () => {
        blocked = true
        fail(blockedFailure())
      }
    })
    return opening
  }

  return {
    async transaction<R>(
      storeNames: readonly string[],
      mode: 'readonly' | 'readwrite',
      run: (transaction: DocumentTransaction) => Promise<R>,
    ): Promise<R> {
      const connection = await connect()
      let transaction: IDBTransaction
      try {
        transaction = connection.transaction(storeNames, mode)
      } catch (error) {
        if (database === connection) database = null
        throw closedFailure(error)
      }
      const completed = new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve()
        transaction.onabort = () => reject(transaction.error ?? closedFailure())
        transaction.onerror = () => reject(transaction.error ?? closedFailure())
      })
      const api: DocumentTransaction = {
        get: (storeName, key) =>
          requestResult(transaction.objectStore(storeName).get(toIdbKey(key))),
        put: async (storeName, value, key) => {
          await requestResult(transaction.objectStore(storeName).put(value, toIdbKey(key)))
        },
        delete: async (storeName, key) => {
          await requestResult(transaction.objectStore(storeName).delete(toIdbKey(key)))
        },
      }
      try {
        const result = await run(api)
        try {
          await completed
        } catch (error) {
          throw mode === 'readwrite' ? writeFailure(error) : readFailure(error)
        }
        return result
      } catch (error) {
        try {
          transaction.abort()
        } catch {
          // 已结束的事务不再重复终止。
        }
        await completed.catch(() => undefined)
        throw error
      }
    },

    async dispose(): Promise<void> {
      if (disposed) return
      disposed = true
      const pending = opening
      if (pending) await pending.catch(() => undefined)
      database?.close()
      database = null
    },
  }
}
