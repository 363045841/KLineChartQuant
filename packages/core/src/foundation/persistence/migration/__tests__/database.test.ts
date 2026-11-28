/** 数据库迁移执行器：新库跑全部步骤，旧库只跑新增步骤。 */
import 'fake-indexeddb/auto'
import { expect, it } from 'vitest'
import { createDatabaseDriver, databaseVersion, ensureStore } from '../impl/database.js'
import type { DatabaseDefinition } from '../types.js'

const STORE = 'records'

/** 只建 store 的基线定义。 */
function baseline(name: string): DatabaseDefinition {
  return {
    name,
    storeName: STORE,
    steps: [{ version: 1, execute: (connection) => ensureStore(connection, STORE) }],
  }
}

it('runs every step on a fresh database', async () => {
  const calls: number[] = []
  const definition: DatabaseDefinition = {
    ...baseline('migration-fresh'),
    steps: [
      {
        version: 1,
        execute: (connection) => {
          calls.push(1)
          ensureStore(connection, STORE)
        },
      },
      { version: 2, execute: () => calls.push(2) },
      { version: 3, execute: () => calls.push(3) },
    ],
  }
  expect(databaseVersion(definition)).toBe(3)
  const driver = createDatabaseDriver(definition)
  try {
    await driver.transaction([STORE], 'readwrite', (transaction) =>
      transaction.put(STORE, 'value', 'key'),
    )
    expect(calls).toEqual([1, 2, 3])
    expect(
      await driver.transaction([STORE], 'readonly', (transaction) => transaction.get(STORE, 'key')),
    ).toBe('value')
  } finally {
    await driver.dispose()
  }
})

it('runs only steps after the stored version and keeps existing data', async () => {
  const first = createDatabaseDriver(baseline('migration-existing'))
  try {
    await first.transaction([STORE], 'readwrite', (transaction) =>
      transaction.put(STORE, 'old', 'key'),
    )
  } finally {
    await first.dispose()
  }

  const calls: number[] = []
  const definition: DatabaseDefinition = {
    ...baseline('migration-existing'),
    steps: [
      { version: 1, execute: (connection) => ensureStore(connection, STORE) },
      { version: 2, execute: () => calls.push(2) },
    ],
  }
  const driver = createDatabaseDriver(definition)
  try {
    const value = await driver.transaction([STORE], 'readonly', (transaction) =>
      transaction.get(STORE, 'key'),
    )
    expect(calls).toEqual([2])
    expect(value).toBe('old')
  } finally {
    await driver.dispose()
  }
})
