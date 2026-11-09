/**
 * 具名归档存储原语：一份归档的读取、串行写入与销毁守卫收敛在这里。
 *
 * @remarks
 * 布局与指标模板是两个独立的归档域（不同数据库、不同文档形状）；
 * 它们共用同一套读写机制，差异只留在各自的 codec、领域操作与错误文案。
 * 销毁后的操作统一失败，避免队列里残留写操作改到已释放的图表。
 */
import { createIndexedDbPersistence } from './indexedDbPersistence.js'
import type { PersistenceCodec } from './localStoragePersistence.js'

/** 归档存储向领域管理器暴露的最小能力。 */
export interface ArchivePersistence<T> {
  /** 读取并校验持久化归档；无记录、损坏或 IndexedDB 不可用时返回 null。 */
  loadStored(): Promise<T | null>
  /** 立即写入整份归档；失败时抛出原始错误。 */
  save(next: T): Promise<void>
  /** 串行执行归档操作；销毁后调用会抛错，失败不阻塞后续操作。 */
  run<R>(operation: () => Promise<R>): Promise<R>
  /** 等待队列清空并释放存储资源。 */
  dispose(): Promise<void>
}

/** 创建归档存储的选项；领域差异通过 codec 与文案注入。 */
export interface CreateArchivePersistenceOptions<T> {
  readonly databaseName: string
  readonly databaseVersion?: number
  readonly storeName: string
  readonly key: IDBValidKey
  readonly codec: PersistenceCodec<T>
  /** 销毁后继续操作时抛出的文案，由领域决定。 */
  readonly disposedMessage: string
}

/**
 * 创建一份串行写入的 IndexedDB 归档存储。
 *
 * @param options 数据库位置、编解码器与销毁文案。
 * @returns 读取、写入、串行执行与释放能力。
 */
export function createArchivePersistence<T>(
  options: CreateArchivePersistenceOptions<T>,
): ArchivePersistence<T> {
  const persistence = createIndexedDbPersistence<T>({
    databaseName: options.databaseName,
    databaseVersion: options.databaseVersion,
    storeName: options.storeName,
    key: options.key,
    flushOnPageHide: false,
    codec: options.codec,
  })
  let disposed = false
  let queue: Promise<unknown> = Promise.resolve()

  return {
    loadStored: () => persistence.load(),
    async save(next: T): Promise<void> {
      await persistence.save(next)
    },
    run<R>(operation: () => Promise<R>): Promise<R> {
      const result = queue.then(() => {
        if (disposed) throw new Error(options.disposedMessage)
        return operation()
      })
      queue = result.catch(() => undefined)
      return result
    },
    async dispose(): Promise<void> {
      disposed = true
      await queue.catch(() => undefined)
      await persistence.dispose()
    },
  }
}
