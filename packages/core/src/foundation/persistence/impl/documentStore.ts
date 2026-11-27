/**
 * 文档仓库：在驱动的事务之上实现读取、整份写入与读改写。
 *
 * 仓库不创建也不释放驱动；事务边界与键空间完全由 `DocumentDriver` 定义。
 */
import type { CreateDocumentStoreOptions, DocumentStore } from '../types.js'
import { closedFailure, corruptFailure, readFailure, writeFailure } from './errors.js'

/**
 * 创建单文档仓库。
 *
 * @param options - 驱动、store 名、键与编解码
 * @returns 只使用传入驱动的文档仓库
 */
export function createDocumentStore<T>(options: CreateDocumentStoreOptions<T>): DocumentStore<T> {
  let disposed = false

  /** 已释放的仓库拒绝一切读写，避免迟到的异步写改到新状态。 */
  function requireActive(): void {
    if (disposed) throw closedFailure()
  }

  /** 读取并解码；只有 undefined 表示记录不存在。 */
  async function readValue(): Promise<T | null> {
    requireActive()
    return await options.driver.transaction([options.storeName], 'readonly', async (transaction) => {
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
    await options.driver.transaction([options.storeName], 'readwrite', async (transaction) => {
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
      return await options.driver.transaction(
        [options.storeName],
        'readwrite',
        async (transaction) => {
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
        },
      )
    },

    async remove(): Promise<void> {
      requireActive()
      await options.driver.transaction([options.storeName], 'readwrite', async (transaction) => {
        try {
          await transaction.delete(options.storeName, options.key)
        } catch (error) {
          throw writeFailure(error)
        }
      })
    },

    async dispose(): Promise<void> {
      // 只标记仓库失效；驱动的连接由创建者关闭。
      disposed = true
    },
  }
}
