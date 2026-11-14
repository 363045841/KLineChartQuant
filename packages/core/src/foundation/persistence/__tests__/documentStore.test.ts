/** 文档仓库契约：读三态、原子读改写、损坏隔离和释放语义。 */
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isKLineChartError } from '../../../errors.js'
import { createDocumentStore } from '../impl/documentStore.js'
import { createMemoryDocumentStore } from '../impl/memoryDocumentStore.js'
import type { DocumentStore, PersistenceCodec } from '../types.js'

const DATABASE_NAME = '@363045841yyt/persistence-contract-test'
const STORE_NAME = 'records'
const KEY = 'current'
const codec: PersistenceCodec<string[]> = {
  decode: (value) =>
    Array.isArray(value) ? value.filter((item) => typeof item === 'string') : null,
  encode: (value) => value,
}

let stores: DocumentStore<unknown>[] = []

/** 创建测试仓库并登记，用例结束后统一释放。 */
function createStore<T>(storeCodec: PersistenceCodec<T>) {
  const store = createDocumentStore<T>({
    databaseName: DATABASE_NAME,
    version: 1,
    storeName: STORE_NAME,
    key: KEY,
    codec: storeCodec,
  })
  stores.push(store as DocumentStore<unknown>)
  return store
}

/** 删除测试数据库，确保用例之间没有持久化状态。 */
function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DATABASE_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('Test database deletion was blocked'))
  })
}

beforeEach(async () => {
  stores = []
  await deleteDatabase()
})

afterEach(async () => {
  await Promise.all(stores.map((store) => store.dispose()))
})

describe('createDocumentStore', () => {
  it('returns null only when the record is missing', async () => {
    expect(await createStore(codec).read()).toBeNull()
  })

  it('writes and reads a decoded document', async () => {
    const store = createStore(codec)
    await store.write(['alpha', 'beta'])
    expect(await store.read()).toEqual(['alpha', 'beta'])
  })

  it('updates from the latest committed value instead of a stale snapshot', async () => {
    const first = createStore(codec)
    const second = createStore(codec)
    await first.write([])

    await Promise.all([
      first.update((current) => [...(current ?? []), 'first']),
      second.update((current) => [...(current ?? []), 'second']),
    ])

    expect((await first.read())?.sort()).toEqual(['first', 'second'])
  })

  it('rejects corrupt records instead of passing null to update', async () => {
    const raw = createStore<unknown>({ decode: (value) => value ?? null, encode: (value) => value })
    await raw.write('not-an-array')

    const strict = createStore(codec)
    await expect(strict.read()).rejects.toSatisfy((error) =>
      isKLineChartError(error, 'PERSISTENCE_CORRUPT'),
    )
    await expect(strict.update(() => ['overwrite'])).rejects.toSatisfy((error) =>
      isKLineChartError(error, 'PERSISTENCE_CORRUPT'),
    )
    expect(await raw.read()).toBe('not-an-array')
  })

  it('rejects operations after dispose with a closed error', async () => {
    const store = createStore(codec)
    await store.dispose()
    await expect(store.read()).rejects.toSatisfy((error) =>
      isKLineChartError(error, 'PERSISTENCE_CLOSED'),
    )
  })

  it('reports unavailable IndexedDB as a typed failure', async () => {
    const store = createStore(codec)
    vi.stubGlobal('indexedDB', undefined)
    try {
      await expect(store.read()).rejects.toSatisfy((error) =>
        isKLineChartError(error, 'PERSISTENCE_UNAVAILABLE'),
      )
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('createMemoryDocumentStore', () => {
  it('follows the same read, update and dispose contract', async () => {
    const store = createMemoryDocumentStore<string[]>(['seed'])
    expect(await store.read()).toEqual(['seed'])
    expect(await store.update((current) => [...(current ?? []), 'next'])).toEqual(['seed', 'next'])
    await store.remove()
    expect(await store.read()).toBeNull()
    await store.dispose()
    await expect(store.read()).rejects.toSatisfy((error) =>
      isKLineChartError(error, 'PERSISTENCE_CLOSED'),
    )
  })
})
