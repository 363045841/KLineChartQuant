/** 可替换的字符串键值存储后端。 */
export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** 将不可信的 JSON 值转换为领域值，并定义领域值的持久化表示。 */
export interface PersistenceCodec<T> {
  decode(value: unknown): T | null
  encode(value: T): unknown
}

/** 一个已绑定 storage key 的 JSON 持久化实例。 */
export interface Persistence<T> {
  /** 读取、解析和校验持久化值；无值、损坏或不可用时返回 null。 */
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
}

const DEFAULT_DEBOUNCE_MS = 1_000

/**
 * 安全获取浏览器 localStorage。
 *
 * SSR、隐私模式和受限 iframe 中 localStorage 可能不存在或在访问时抛错。
 */
export function getBrowserLocalStorage(): KeyValueStorage | null {
  try {
    return globalThis.localStorage
  } catch {
    return null
  }
}

/** 创建一个具备 JSON 编解码、延迟写入和 pagehide 补写能力的持久化实例。 */
export function createLocalStoragePersistence<T>(
  options: CreateLocalStoragePersistenceOptions<T>,
): Persistence<T> {
  const storage = options.storage === undefined ? getBrowserLocalStorage() : options.storage
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS
  const flushOnPageHide = options.flushOnPageHide ?? true
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: { readonly createValue: () => T } | null = null
  let disposed = false

  function cancelScheduledWrite(): void {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  function write(value: T): boolean {
    if (!storage) return false
    try {
      storage.setItem(options.key, JSON.stringify(options.codec.encode(value)))
      return true
    } catch {
      return false
    }
  }

  function flush(): boolean {
    cancelScheduledWrite()
    if (!pending) return true
    const next = pending
    pending = null
    return write(next.createValue())
  }

  function onPageHide(): void {
    flush()
  }

  if (flushOnPageHide) globalThis.addEventListener?.('pagehide', onPageHide)

  return {
    load(): T | null {
      if (!storage) return null
      try {
        const raw = storage.getItem(options.key)
        if (!raw) return null
        const parsed: unknown = JSON.parse(raw)
        return options.codec.decode(parsed)
      } catch {
        return null
      }
    },
    save(value: T): boolean {
      if (disposed) return false
      cancelScheduledWrite()
      pending = null
      return write(value)
    },
    schedule(createValue: () => T): void {
      if (disposed || !storage) return
      pending = { createValue }
      cancelScheduledWrite()
      timer = setTimeout(flush, debounceMs)
    },
    flush(): boolean {
      if (disposed) return false
      return flush()
    },
    clear(): boolean {
      if (disposed || !storage) return false
      cancelScheduledWrite()
      pending = null
      try {
        storage.removeItem(options.key)
        return true
      } catch {
        return false
      }
    },
    dispose(): void {
      if (disposed) return
      flush()
      disposed = true
      if (flushOnPageHide) globalThis.removeEventListener?.('pagehide', onPageHide)
    },
  }
}
