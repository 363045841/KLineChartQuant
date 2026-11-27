/**
 * 文档仓库契约：同一批断言在内存驱动与 IndexedDB 适配器上各跑一遍。
 *
 * 驱动只提供事务，仓库只负责解码、整份写入与读改写；两者边界在这里固定。
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isKLineChartError } from '../../../errors.js'
import { createDocumentStore } from '../impl/documentStore.js'
import { createIndexedDbDocumentStore } from '../impl/indexedDbDocumentStore.js'
import { createMemoryDocumentStore } from '../impl/memoryDocumentStore.js'
import type {
  DocumentDriver,
  DocumentKey,
  DocumentStore,
  PersistenceCodec,
} from '../types.js'

const DATABASE_NAME = '@363045841yyt/persistence-contract-test'
const STORE_NAME = 'records'
const KEY = 'current'

const codec: PersistenceCodec<string[]> = {
  decode: (value) =>
    Array.isArray(value) ? value.filter((item) => typeof item === 'string') : null,
  encode: (value) => value,
}

/** 把 store 名与契约键合成内存驱动的键；数组键按段拼接。 */
function memoryKey(storeName: string, key: DocumentKey): string {
  return [storeName, ...(typeof key === 'string' ? [key] : key)].join('|')
}

interface MemoryDriver extends DocumentDriver {
  readonly values: Map<string, unknown>
  disposeCount: number
}

/** 内存驱动：只实现事务语义，用来证明仓库不依赖具体存储。 */
function createMemoryDriver(): MemoryDriver {
  const values = new Map<string, unknown>()
  // 事务串行执行：真实驱动也不会让两个写事务交错读写。
  let queue: Promise<unknown> = Promise.resolve()
  const driver: MemoryDriver = {
    values,
    disposeCount: 0,
    transaction(_storeNames, _mode, run) {
      const result = queue.then(() =>
        run({
          async get(storeName, key) {
            return values.get(memoryKey(storeName, key))
          },
          async put(storeName, value, key) {
            values.set(memoryKey(storeName, key), value)
          },
          async delete(storeName, key) {
            values.delete(memoryKey(storeName, key))
          },
        }),
      )
      queue = result.catch(() => undefined)
      return result
    },
    async dispose() {
      driver.disposeCount += 1
      values.clear()
    },
  }
  return driver
}

/** 一套仓库装配；每个实现只需提供自己的 createStore。 */
interface StoreHarness {
  readonly name: string
  createStore<T>(storeCodec: PersistenceCodec<T>): DocumentStore<T>
}

let drivers: MemoryDriver[] = []
let stores: DocumentStore<unknown>[] = []

/** 内存驱动装配；同一用例内多个仓库共享一份驱动。 */
function memoryHarness(): StoreHarness {
  const driver = createMemoryDriver()
  drivers.push(driver)
  return {
    name: 'memory driver',
    createStore<T>(storeCodec: PersistenceCodec<T>) {
      const store = createDocumentStore<T>({ driver, storeName: STORE_NAME, key: KEY, codec: storeCodec })
      stores.push(store as DocumentStore<unknown>)
      return store
    },
  }
}

/** IndexedDB 适配器装配；每个仓库独占一条连接，dispose 一并关闭。 */
function indexedDbHarness(): StoreHarness {
  return {
    name: 'IndexedDB adapter',
    createStore<T>(storeCodec: PersistenceCodec<T>) {
      const store = createIndexedDbDocumentStore<T>({
        databaseName: DATABASE_NAME,
        version: 1,
        storeName: STORE_NAME,
        key: KEY,
        codec: storeCodec,
      })
      stores.push(store as DocumentStore<unknown>)
      return store
    },
  }
}

const harnesses = [memoryHarness, indexedDbHarness] as const

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
  drivers = []
  stores = []
  await deleteDatabase()
})

afterEach(async () => {
  await Promise.all(stores.map((store) => store.dispose()))
  stores = []
  drivers = []
  vi.unstubAllGlobals()
})

describe.each(harnesses)('$name', (createHarness) => {
  let harness: StoreHarness

  beforeEach(() => {
    harness = createHarness()
  })

  it('returns null only when the record is missing', async () => {
    expect(await harness.createStore(codec).read()).toBeNull()
  })

  it('writes and reads a decoded document', async () => {
    const store = harness.createStore(codec)
    await store.write(['alpha', 'beta'])
    expect(await store.read()).toEqual(['alpha', 'beta'])
  })

  it('updates from the latest committed value instead of a stale snapshot', async () => {
    const first = harness.createStore(codec)
    const second = harness.createStore(codec)
    await first.write([])

    await Promise.all([
      first.update((current) => [...(current ?? []), 'first']),
      second.update((current) => [...(current ?? []), 'second']),
    ])

    expect((await first.read())?.sort()).toEqual(['first', 'second'])
  })

  it('rejects corrupt records instead of passing null to update', async () => {
    const raw = harness.createStore<unknown>({
      decode: (value) => value ?? null,
      encode: (value) => value,
    })
    await raw.write('not-an-array')

    const strict = harness.createStore(codec)
    await expect(strict.read()).rejects.toSatisfy((error) =>
      isKLineChartError(error, 'PERSISTENCE_CORRUPT'),
    )
    await expect(strict.update(() => ['overwrite'])).rejects.toSatisfy((error) =>
      isKLineChartError(error, 'PERSISTENCE_CORRUPT'),
    )
    expect(await raw.read()).toBe('not-an-array')
  })

  it('rejects operations after dispose with a closed error', async () => {
    const store = harness.createStore(codec)
    await store.dispose()
    await expect(store.read()).rejects.toSatisfy((error) =>
      isKLineChartError(error, 'PERSISTENCE_CLOSED'),
    )
  })

  it('reads and writes documents keyed by string arrays', async () => {
    const driver = createMemoryDriver()
    drivers.push(driver)
    const first = createDocumentStore<string[]>({
      driver,
      storeName: STORE_NAME,
      key: ['documents', 'tab-a'],
      codec,
    })
    const second = createDocumentStore<string[]>({
      driver,
      storeName: STORE_NAME,
      key: ['documents', 'tab-b'],
      codec,
    })
    await first.write(['a'])
    await second.write(['b'])
    expect(await first.read()).toEqual(['a'])
    expect(await second.read()).toEqual(['b'])
  })
})

describe('driver ownership', () => {
  it('releases the store without closing the driver it borrowed', async () => {
    const driver = createMemoryDriver()
    const store = createDocumentStore<string[]>({
      driver,
      storeName: STORE_NAME,
      key: KEY,
      codec,
    })
    await store.dispose()
    expect(driver.disposeCount).toBe(0)
    await driver.dispose()
    expect(driver.disposeCount).toBe(1)
  })

  it('closes the connection it created itself', async () => {
    const store = createIndexedDbDocumentStore<string[]>({
      databaseName: DATABASE_NAME,
      version: 1,
      storeName: STORE_NAME,
      key: KEY,
      codec,
    })
    await store.write(['value'])
    await store.dispose()
    await expect(store.read()).rejects.toSatisfy((error) =>
      isKLineChartError(error, 'PERSISTENCE_CLOSED'),
    )
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
