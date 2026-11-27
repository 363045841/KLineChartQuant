/**
 * IndexedDB 文档仓库：浏览器组合根使用的自包含入口。
 *
 * 驱动由仓库自己创建并独占，`dispose()` 同时关闭仓库与连接；需要共享连接的调用方
 * 直接使用 `createDocumentStore` 并自行管理驱动。
 */
import type { DocumentStore, PersistenceCodec } from '../types.js'
import { createDocumentStore } from './documentStore.js'
import { createIndexedDbDriver } from './indexedDbDriver.js'

/** 创建 IndexedDB 文档仓库的选项；数据库名与版本只在这一层出现。 */
export interface CreateIndexedDbDocumentStoreOptions<T> {
  readonly databaseName: string
  readonly version: number
  readonly upgrade?: (
    database: IDBDatabase,
    transaction: IDBTransaction,
    oldVersion: number,
  ) => void
  readonly storeName: string
  readonly key: string | readonly string[]
  readonly codec: PersistenceCodec<T>
}

/**
 * 创建自包含的 IndexedDB 文档仓库。
 *
 * @param options - 数据库、store 与编解码配置
 * @returns 释放时一并关闭连接
 */
export function createIndexedDbDocumentStore<T>(
  options: CreateIndexedDbDocumentStoreOptions<T>,
): DocumentStore<T> {
  const driver = createIndexedDbDriver({
    databaseName: options.databaseName,
    version: options.version,
    upgrade: (database, transaction, oldVersion) => {
      // 仓库级入口必须保证自己的 store 存在；调用方的升级逻辑随后执行。
      if (!database.objectStoreNames.contains(options.storeName))
        database.createObjectStore(options.storeName)
      options.upgrade?.(database, transaction, oldVersion)
    },
  })
  const store = createDocumentStore<T>({
    driver,
    storeName: options.storeName,
    key: options.key,
    codec: options.codec,
  })
  let disposed = false
  return {
    read: () => store.read(),
    write: (value) => store.write(value),
    update: (change) => store.update(change),
    remove: () => store.remove(),
    async dispose(): Promise<void> {
      if (disposed) return
      disposed = true
      await store.dispose()
      await driver.dispose()
    },
  }
}
