/** LocalStorage 持久化原语，存储实例绑定创建时的工作区。 */
import { KLineChartError, PERSISTENCE_ERROR_CODES } from '@/errors.js'
import { scopedPersistenceName } from '../persistence-scope.js'
import type { PersistenceCodec } from '../types.js'
import { createPendingWriteScheduler, DEFAULT_DEBOUNCE_MS } from './pendingWriteScheduler.js'

export type { PersistenceCodec } from '../types.js'

/** 可替换的字符串键值存储后端。 */
export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** 一个已绑定 storage key 的 JSON 持久化实例。 */
export interface Persistence<T> {
  /** 无记录或无可用后端时返回 null；读取或解码失败时抛出。 */
  load(): T | null
  /** 立即写入 value，并取消尚未完成的延迟写入。 */
  save(value: T): boolean
  /** 安排一次延迟写入；实际写入时才调用 createValue 取值。 */
  schedule(createValue: () => T): void
  /** 立即提交最新的待写快照；没有待写快照时返回 true。 */
  flush(): boolean
  /** 删除该 key 的值，并取消尚未完成的延迟写入。 */
  clear(): boolean
  /** 释放监听页面生命周期的资源，并补写最新待写快照。 */
  dispose(): void
}

/** 创建 localStorage JSON 持久化实例的选项。 */
export interface CreateLocalStoragePersistenceOptions<T> {
  /** LocalStorage 中用于定位此持久化值的键名，例如 `kline-settings`。 */
  readonly key: string
  /** 持久化 JSON 与领域值之间的显式边界。 */
  readonly codec: PersistenceCodec<T>
  /** 注入的 storage 后端；省略时安全地尝试使用浏览器 localStorage。 */
  readonly storage?: KeyValueStorage | null
  /** 延迟写入时长，默认 1 秒。 */
  readonly debounceMs?: number
  /** 是否在 pagehide 时补写，默认 true。 */
  readonly flushOnPageHide?: boolean
  /** 延迟写入或 pagehide 失败时接收原始异常。 */
  readonly onBackgroundError?: (error: unknown) => void
}

/**
 * 获取浏览器 localStorage；浏览器拒绝访问时抛出。
 */
export function getBrowserLocalStorage(): KeyValueStorage | null {
  try {
    return globalThis.localStorage ?? null
  } catch (cause) {
    throw new KLineChartError(PERSISTENCE_ERROR_CODES.UNAVAILABLE, 'Unable to access LocalStorage', { cause })
  }
}

/** 创建一个具备 JSON 编解码、延迟写入和 pagehide 补写能力的持久化实例。 */
export function createLocalStoragePersistence<T>(
  options: CreateLocalStoragePersistenceOptions<T>,
): Persistence<T> {
  const key = scopedPersistenceName(options.key)
  const getStorage = () => options.storage === undefined ? getBrowserLocalStorage() : options.storage
  const flushOnPageHide = options.flushOnPageHide ?? true
  const scheduler = createPendingWriteScheduler<T>(options.debounceMs ?? DEFAULT_DEBOUNCE_MS)
  let disposed = false

  function write(value: T): boolean {
    const storage = getStorage()
    if (!storage) return false
    try {
      storage.setItem(key, JSON.stringify(options.codec.encode(value)))
      return true
    } catch (cause) {
      throw new KLineChartError(PERSISTENCE_ERROR_CODES.WRITE_FAILED, `Unable to write LocalStorage key "${key}"`, { cause })
    }
  }

  function flush(): boolean {
    const next = scheduler.takePending()
    return next ? write(next()) : true
  }

  function flushInBackground(): void {
    try {
      flush()
    } catch (error) {
      if (options.onBackgroundError) options.onBackgroundError(error)
      else console.error('[LocalStorage persistence]', error)
    }
  }

  if (flushOnPageHide) globalThis.addEventListener?.('pagehide', flushInBackground)

  return {
    load(): T | null {
      const storage = getStorage()
      if (!storage) return null
      let raw: string | null
      try {
        raw = storage.getItem(key)
      } catch (cause) {
        throw new KLineChartError(PERSISTENCE_ERROR_CODES.READ_FAILED, `Unable to read LocalStorage key "${key}"`, { cause })
      }
      if (raw === null) return null
      try {
        const decoded = options.codec.decode(JSON.parse(raw))
        if (decoded === null) throw new TypeError('Stored value did not match the codec')
        return decoded
      } catch (cause) {
        throw new KLineChartError(PERSISTENCE_ERROR_CODES.CORRUPT, `Invalid LocalStorage value for "${key}"`, { cause })
      }
    },
    save(value: T): boolean {
      if (disposed) return false
      scheduler.drop()
      return write(value)
    },
    schedule(createValue: () => T): void {
      if (disposed || options.storage === null) return
      scheduler.schedule(createValue, flushInBackground)
    },
    flush(): boolean {
      if (disposed) return false
      return flush()
    },
    clear(): boolean {
      if (disposed) return false
      const storage = getStorage()
      if (!storage) return false
      scheduler.drop()
      try {
        storage.removeItem(key)
        return true
      } catch (cause) {
        throw new KLineChartError(PERSISTENCE_ERROR_CODES.WRITE_FAILED, `Unable to clear LocalStorage key "${key}"`, { cause })
      }
    },
    dispose(): void {
      if (disposed) return
      disposed = true
      if (flushOnPageHide) globalThis.removeEventListener?.('pagehide', flushInBackground)
      flush()
    },
  }
}

/**
 * 已绑定快照来源的持久化契约：宿主只消费无参 schedule/dispose，不需要关心取值时机。
 */
export interface SnapshotPersistence {
  /** 安排一次延迟写入；实际写入时读取已绑定的快照。 */
  schedule(): void
  /** 释放资源并补写最新待写快照。 */
  dispose(): void
}

/** 将快照 getter 绑定到 `Persistence`，得到宿主可直接调用的无参协议。 */
export function bindSnapshotPersistence<T>(
  persistence: Persistence<T>,
  getSnapshot: () => T,
): SnapshotPersistence {
  return {
    schedule: () => persistence.schedule(getSnapshot),
    dispose: () => persistence.dispose(),
  }
}
