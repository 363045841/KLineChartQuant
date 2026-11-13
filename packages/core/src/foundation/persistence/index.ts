/**
 * 持久化公共入口：只导出契约与后端工厂，领域模块通过这里使用存储能力。
 */

export { createDocumentStore } from './impl/documentStore.js'
export { createIndexedDbDriver } from './impl/indexedDbDriver.js'
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
export {
  type CreateDocumentStoreOptions,
  type CreateIndexedDbDriverOptions,
  type DocumentStore,
  type DocumentTransaction,
  type IndexedDbDriver,
  type PersistenceCodec,
} from './types.js'
