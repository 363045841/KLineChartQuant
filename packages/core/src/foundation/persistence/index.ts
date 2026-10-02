export {
  type CreateIndexedDbPersistenceOptions,
  createIndexedDbPersistence,
  type IndexedDbPersistence,
} from './indexedDbPersistence.js'
export {
  bindSnapshotPersistence,
  type CreateLocalStoragePersistenceOptions,
  createLocalStoragePersistence,
  getBrowserLocalStorage,
  type KeyValueStorage,
  type Persistence,
  type PersistenceCodec,
  type SnapshotPersistence,
} from './localStoragePersistence.js'
