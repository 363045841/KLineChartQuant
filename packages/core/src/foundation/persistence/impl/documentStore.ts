/**
 * 单文档仓库：把编解码、读三态和原子读改写收敛到公共层。
 *
 * @remarks
 * `read()` 只有在记录确实不存在时才返回 null；解码失败、连接不可用、事务中止都会抛出
 * 带错误码的异常。`update()` 在一个 readwrite 事务里完成读取和写入，跨标签页不会丢失更新。
 */
import type { CreateDocumentStoreOptions, DocumentStore } from '../types.js'
import { closedFailure, corruptFailure, readFailure, writeFailure } from './errors.js'
import { createIndexedDbDriver } from './indexedDbDriver.js'

/** 创建单文档仓库；未注入驱动时仓库独占一个连接。 */
export function createDocumentStore<T>(options: CreateDocumentStoreOptions<T>): DocumentStore<T> {
  const ownsDriver = options.driver === undefined
  const driver =
    options.driver ??
    createIndexedDbDriver({
      databaseName: options.databaseName,
      version: options.version,
      upgrade: (database) => {
        if (!database.objectStoreNames.contains(options.storeName))
          database.createObjectStore(options.storeName)
      },
    })
  let disposed = false

  /** 已释放的仓库拒绝一切读写，避免迟到的异步写改到新状态。 */
  function requireActive(): void {
    if (disposed) throw closedFailure()
  }

  /** 读取并解码；只有 undefined 表示记录不存在。 */
  async function readValue(): Promise<T | null> {
    requireActive()
    return await driver.transaction([options.storeName], 'readonly', async (transaction) => {
      let raw: unknown
      try {
        raw = await transaction.get(options.storeName, options.key)
      } catch (error) {
        throw readFailure(error)
      }
      if (raw === undefined) return null
      const decoded = options.codec.decode(raw)
      if (decoded === null) throw corruptFailure(options.storeName)
      return decoded
    })
  }

  /** 编码并写入；编码失败视为调用方的契约错误，不做兜底。 */
  async function writeValue(value: T): Promise<void> {
    requireActive()
    const encoded = options.codec.encode(value)
    await driver.transaction([options.storeName], 'readwrite', async (transaction) => {
      try {
        await transaction.put(options.storeName, encoded, options.key)
      } catch (error) {
        throw writeFailure(error)
      }
    })
  }

  return {
    read: readValue,

    write: async (value: T) => {
      await writeValue(value)
    },

    async update(change: (current: T | null) => T): Promise<T> {
      requireActive()
      return await driver.transaction([options.storeName], 'readwrite', async (transaction) => {
        let raw: unknown
        try {
          raw = await transaction.get(options.storeName, options.key)
        } catch (error) {
          throw readFailure(error)
        }
        let current: T | null = null
        if (raw !== undefined) {
          current = options.codec.decode(raw)
          // 已存在的记录解不开时不能把它当空值交给 change，否则会用默认值覆盖用户数据。
          if (current === null) throw corruptFailure(options.storeName)
        }
        const next = change(current)
        const encoded = options.codec.encode(next)
        try {
          await transaction.put(options.storeName, encoded, options.key)
        } catch (error) {
          throw writeFailure(error)
        }
        return next
      })
    },

    async remove(): Promise<void> {
      requireActive()
      await driver.transaction([options.storeName], 'readwrite', async (transaction) => {
        try {
          await transaction.delete(options.storeName, options.key)
        } catch (error) {
          throw writeFailure(error)
        }
      })
    },

    async dispose(): Promise<void> {
      if (disposed) return
      disposed = true
      if (ownsDriver) await driver.dispose()
    },
  }
}
