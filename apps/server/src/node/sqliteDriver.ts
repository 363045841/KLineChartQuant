/**
 * SQLite 文档驱动：用 `node:sqlite` 实现 Core 的 `DocumentDriver`。
 *
 * 事务串行执行；键按 JSON 编码，值按 JSON 文本保存。
 */
import { DatabaseSync } from 'node:sqlite'
import type {
  DocumentDriver,
  DocumentKey,
  DocumentTransaction,
} from '@363045841yyt/klinechart-core/node'

/** 契约键转成存储键；数组键序列化后保持唯一。 */
function encodeKey(key: DocumentKey): string {
  return typeof key === 'string' ? key : JSON.stringify(key)
}

export interface SqliteDriverOptions {
  readonly filename: string
}

/**
 * 创建 SQLite 驱动。
 *
 * @param options - 数据库文件路径
 * @returns 由调用方负责释放的文档驱动
 */
export function createSqliteDriver(options: SqliteDriverOptions): DocumentDriver {
  const database = new DatabaseSync(options.filename)
  database.exec('PRAGMA journal_mode = WAL')
  database.exec(
    'CREATE TABLE IF NOT EXISTS documents (store TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY (store, key))',
  )
  const select = database.prepare('SELECT value FROM documents WHERE store = ? AND key = ?')
  const upsert = database.prepare(
    'INSERT INTO documents (store, key, value) VALUES (?, ?, ?) ON CONFLICT(store, key) DO UPDATE SET value = excluded.value',
  )
  const remove = database.prepare('DELETE FROM documents WHERE store = ? AND key = ?')
  let queue: Promise<unknown> = Promise.resolve()
  let disposed = false

  /** 事务串行执行，避免两个写事务交错读写。 */
  function transaction<R>(
    _storeNames: readonly string[],
    _mode: 'readonly' | 'readwrite',
    run: (transaction: DocumentTransaction) => Promise<R>,
  ): Promise<R> {
    if (disposed) return Promise.reject(new Error('SQLite driver is disposed'))
    const result = queue.then(async () => {
      database.exec('BEGIN')
      try {
        const value = await run({
          async get(storeName, key) {
            const row = select.get(storeName, encodeKey(key)) as { value: string } | undefined
            return row === undefined ? undefined : JSON.parse(row.value)
          },
          async put(storeName, next, key) {
            upsert.run(storeName, encodeKey(key), JSON.stringify(next))
          },
          async delete(storeName, key) {
            remove.run(storeName, encodeKey(key))
          },
        })
        database.exec('COMMIT')
        return value
      } catch (error) {
        database.exec('ROLLBACK')
        throw error
      }
    })
    queue = result.catch(() => undefined)
    return result
  }

  return {
    transaction,
    async dispose() {
      if (disposed) return
      disposed = true
      await queue.catch(() => undefined)
      database.close()
    },
  }
}
