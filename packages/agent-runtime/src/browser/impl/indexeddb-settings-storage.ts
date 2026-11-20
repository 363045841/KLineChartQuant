/**
 * 宿主设置文档的 IndexedDB 实现。
 *
 * 文档只存一份，读不到时返回 `null`；任何存储失败都以运行时错误抛出，
 * 不静默退化为内存状态。
 */

import { AgentRuntimeError } from '../../contracts/errors.js'
import type { AgentSettingsStorage } from '../../host/impl/agent-settings.js'

/** 设置库与对象仓库的默认名字。 */
const DEFAULT_DATABASE = 'kq-agent-settings'
const STORE_NAME = 'document'
const DOCUMENT_KEY = 'agent'

/** 打开数据库并准备对象仓库。 */
function openDatabase(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(
        new AgentRuntimeError('INTERNAL_ERROR', 'Unable to open the Agent settings database.', {
          cause: request.error,
        }),
      )
  })
}

/** 在事务中读取或写入一次文档。 */
function transact<T>(
  database: IDBDatabase,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode)
    const request = run(transaction.objectStore(STORE_NAME))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(
        new AgentRuntimeError('INTERNAL_ERROR', 'The Agent settings database request failed.', {
          cause: request.error,
        }),
      )
    transaction.onabort = () =>
      reject(
        new AgentRuntimeError('INTERNAL_ERROR', 'The Agent settings transaction was aborted.', {
          cause: transaction.error,
        }),
      )
  })
}

/**
 * 创建基于 IndexedDB 的设置文档存储。
 * @param databaseName 数据库名，测试可替换。
 * @returns 宿主使用的设置存储端口。
 */
export function createIndexedDbSettingsStorage(
  databaseName = DEFAULT_DATABASE,
): AgentSettingsStorage {
  let databasePromise: Promise<IDBDatabase> | undefined

  /** 复用同一个数据库连接，避免每次写入都重新打开。 */
  function database(): Promise<IDBDatabase> {
    databasePromise ??= openDatabase(databaseName)
    return databasePromise
  }

  return {
    async read(): Promise<unknown> {
      const value = await transact<unknown>(await database(), 'readonly', (store) =>
        store.get(DOCUMENT_KEY),
      )
      return value ?? null
    },
    async write(document: unknown): Promise<void> {
      await transact(await database(), 'readwrite', (store) => store.put(document, DOCUMENT_KEY))
    },
  }
}
