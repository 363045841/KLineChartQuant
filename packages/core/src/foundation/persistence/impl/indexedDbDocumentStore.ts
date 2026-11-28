/**
 * IndexedDB 文档仓库：浏览器组合根使用的自包含入口。
 *
 * 库的结构与迁移由 `DatabaseDefinition` 拥有；仓库只负责单文档读写，
 * 释放时一并关闭连接。
 */
import type { DatabaseDefinition } from '../migration/types.js'
import { createDatabaseDriver } from '../migration/impl/database.js'
import type { DocumentKey, DocumentStore, PersistenceCodec } from '../types.js'
import { createDocumentStore } from './documentStore.js'

/** 创建 IndexedDB 文档仓库的选项；库名、store 与迁移由定义提供。 */
export interface CreateIndexedDbDocumentStoreOptions<T> {
  readonly database: DatabaseDefinition
  readonly key: DocumentKey
  readonly codec: PersistenceCodec<T>
}

/**
 * 创建自包含的 IndexedDB 文档仓库。
 *
 * @param options - 数据库定义、文档键与编解码
 * @returns 释放时一并关闭连接的仓库
 */
export function createIndexedDbDocumentStore<T>(
  options: CreateIndexedDbDocumentStoreOptions<T>,
): DocumentStore<T> {
  const driver = createDatabaseDriver(options.database)
  const store = createDocumentStore<T>({
    driver,
    storeName: options.database.storeName,
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
