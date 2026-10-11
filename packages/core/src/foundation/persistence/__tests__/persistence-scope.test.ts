/** 工作区持久化隔离：旧实例的延迟写入不能流入新工作区。 */
import 'fake-indexeddb/auto'
import { afterEach, expect, it, vi } from 'vitest'
import type { KeyValueStorage, PersistenceCodec } from '../localStoragePersistence.js'

const values = new Map<string, string>()
const storage: KeyValueStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => {
    values.set(key, value)
  },
  removeItem: (key) => {
    values.delete(key)
  },
}
const codec: PersistenceCodec<string> = {
  decode: (value) => (typeof value === 'string' ? value : null),
  encode: (value) => value,
}

/** 模拟一次新页面启动，同一存储后端保留之前工作区的数据。 */
async function boot(scope: string) {
  vi.resetModules()
  const { configureBrowserPersistenceScope } = await import('../persistence-scope.js')
  configureBrowserPersistenceScope(scope)
  const { createLocalStoragePersistence } = await import('../localStoragePersistence.js')
  const { createIndexedDbPersistence } = await import('../indexedDbPersistence.js')
  return {
    configureBrowserPersistenceScope,
    local: createLocalStoragePersistence({ key: 'settings', storage, codec }),
    database: createIndexedDbPersistence({
      databaseName: 'scope-regression',
      storeName: 'layouts',
      key: 'current',
      codec,
    }),
  }
}

afterEach(() => {
  values.clear()
  vi.resetModules()
})

it('isolates local and IndexedDB data, including late writes from the old page', async () => {
  const first = await boot('user-one/workspace-one')
  first.local.schedule(() => 'old-page-write')
  await first.database.save('first-layout')
  const second = await boot('user-one/workspace-two')
  expect(second.local.load()).toBeNull()
  expect(await second.database.load()).toBeNull()
  first.local.flush()
  second.local.save('second-settings')
  await second.database.save('second-layout')
  const restored = await boot('user-one/workspace-one')
  expect(restored.local.load()).toBe('old-page-write')
  expect(await restored.database.load()).toBe('first-layout')
  for (const page of [first, second, restored]) {
    page.local.dispose()
    await page.database.dispose()
  }
})

it('requires a page reload to change scope after persistence starts', async () => {
  const page = await boot('user-one/workspace-one')
  expect(() => page.configureBrowserPersistenceScope('user-two/workspace-one')).toThrow()
  page.local.dispose()
  await page.database.dispose()
})
