/**
 * IndexedDB 驱动：唯一负责打开连接、升级结构、处理阻塞/版本变更和执行事务。
 *
 * @remarks
 * 连接按需建立并长期复用；其他标签页请求升级时立即关闭，下一次操作再重新打开。
 * 连接和事务的失败统一转换成带错误码的 `KLineChartError`，请求自身的中止错误保持原样，
 * 便于领域层区分「业务校验失败」和「存储失败」。
 */
import { scopedPersistenceName } from '../persistence-scope.js'
import type {
  CreateIndexedDbDriverOptions,
  DocumentTransaction,
  IndexedDbDriver,
} from '../types.js'
import {
  blockedFailure,
  closedFailure,
  readFailure,
  unavailableFailure,
  versionMismatchFailure,
  writeFailure,
} from './errors.js'

/** 将单次请求转换为 Promise；错误保留底层 DOMException。 */
function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** 打开失败分类：版本低于磁盘与普通不可用需要不同恢复动作。 */
function openFailure(error: unknown) {
  return error instanceof DOMException && error.name === 'VersionError'
    ? versionMismatchFailure(error)
    : unavailableFailure(error)
}

/** 创建驱动；同一实例内的连接与事务由它独占。 */
export function createIndexedDbDriver(options: CreateIndexedDbDriverOptions): IndexedDbDriver {
  let database: IDBDatabase | null = null
  let opening: Promise<IDBDatabase> | null = null
  let disposed = false

  /** 建立连接；并发调用共享同一次打开请求。 */
  function connect(): Promise<IDBDatabase> {
    if (disposed) return Promise.reject(closedFailure())
    if (database) return Promise.resolve(database)
    if (opening) return opening
    if (typeof indexedDB === 'undefined') return Promise.reject(unavailableFailure())

    const request = indexedDB.open(scopedPersistenceName(options.databaseName), options.version)
    let settled = false
    let blocked = false

    opening = new Promise<IDBDatabase>((resolve, reject) => {
      /** 只结算一次；后续事件仍然负责关闭迟到的连接。 */
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
        // 被阻塞或已释放的请求即使后来成功，也必须立刻关闭，避免留下阻塞升级的连接。
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
        get: (storeName, key) => requestResult(transaction.objectStore(storeName).get(key)),
        put: async (storeName, value, key) => {
          await requestResult(transaction.objectStore(storeName).put(value, key))
        },
        delete: async (storeName, key) => {
          await requestResult(transaction.objectStore(storeName).delete(key))
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
          // 已结算的事务无需再次中止。
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
