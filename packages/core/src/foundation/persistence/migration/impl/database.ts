/**
 * 数据库定义到 IndexedDB 驱动的装配：版本、迁移顺序与通用建 store。
 *
 * 调用方只提供 `DatabaseDefinition`，不再自己拼版本号和 upgrade 回调。
 */
import { createIndexedDbDriver } from '../../impl/indexedDbDriver.js'
import type { DocumentDriver } from '../../types.js'
import type { DatabaseDefinition } from '../types.js'

/** 库版本 = 最后一步的目标版本；没有步骤时视为 0。 */
export function databaseVersion(database: DatabaseDefinition): number {
  return database.steps.at(-1)?.version ?? 0
}

/** 把迁移表转成驱动的 upgrade：只执行 oldVersion 之后的步骤。 */
export function upgradeTo(
  database: DatabaseDefinition,
): (connection: IDBDatabase, transaction: IDBTransaction, oldVersion: number) => void {
  return (connection, transaction, oldVersion) => {
    for (const step of database.steps) {
      if (step.version > oldVersion) step.execute(connection, transaction)
    }
  }
}

/** 建库步骤的通用实现：store 不存在时创建。 */
export function ensureStore(connection: IDBDatabase, storeName: string): void {
  if (!connection.objectStoreNames.contains(storeName)) connection.createObjectStore(storeName)
}

/**
 * 用定义打开驱动。
 *
 * @param database - 库定义
 * @returns 由调用方释放的文档驱动
 */
export function createDatabaseDriver(database: DatabaseDefinition): DocumentDriver {
  return createIndexedDbDriver({
    databaseName: database.name,
    version: databaseVersion(database),
    upgrade: upgradeTo(database),
  })
}
