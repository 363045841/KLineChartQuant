/**
 * 持久化公共入口：契约加两套装配。
 *
 * 模块间只依赖 `DocumentStore` 契约；IndexedDB 入口只给浏览器组合根使用。
 */

export { createDocumentStore } from './impl/documentStore.js'
export { createIndexedDbDocumentStore } from './impl/indexedDbDocumentStore.js'
export {
  createIndexedDbDriver,
  type CreateIndexedDbDriverOptions,
} from './impl/indexedDbDriver.js'
export {
  createDatabaseDriver,
  databaseVersion,
  ensureStore,
  upgradeTo,
} from './migration/impl/database.js'
export type { DatabaseDefinition, MigrationStep } from './migration/types.js'
export {
  bindSnapshotPersistence,
  type CreateLocalStoragePersistenceOptions,
  createLocalStoragePersistence,
  getBrowserLocalStorage,
  type KeyValueStorage,
  type Persistence,
  type SnapshotPersistence,
} from './impl/localStoragePersistence.js'
export { createMemoryDocumentStore } from './impl/memoryDocumentStore.js'
export { configureBrowserPersistenceScope, scopedPersistenceName } from './persistence-scope.js'
export type {
  CreateDocumentStoreOptions,
  DocumentDriver,
  DocumentKey,
  DocumentStore,
  DocumentTransaction,
  PersistenceCodec,
} from './types.js'
