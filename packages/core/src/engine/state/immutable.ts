/**
 * 将 Map 包装为运行时不可变：set/delete/clear 抛错。
 * 返回新 Map 副本，避免外部持有同一可变引用。
 */
export function immutableMap<K, V>(source: ReadonlyMap<K, V>): ReadonlyMap<K, V> {
  const copy = new Map(source)
  return new Proxy(copy, {
    get(target, prop) {
      if (prop === 'set' || prop === 'delete' || prop === 'clear') {
        return () => {
          throw new TypeError('ReadonlyMap is immutable')
        }
      }
      const value = (target as unknown as Record<string | symbol, unknown>)[prop]
      return typeof value === 'function'
        ? (value as (...args: unknown[]) => unknown).bind(target)
        : value
    },
  }) as ReadonlyMap<K, V>
}

/** 浅冻结对象副本 */
export function freezeRecord<T extends Record<string, unknown>>(value: T): Readonly<T> {
  return Object.freeze({ ...value })
}

/** 递归复制并冻结 JSON-like 配置值，阻断嵌套对象绕过 Action 修改。 */
export function deepFreezeSnapshot<T>(value: T): T {
  const seen = new WeakSet<object>()
  const snapshot = (item: unknown): unknown => {
    if (typeof item === 'function' || typeof item === 'bigint' || typeof item === 'symbol') {
      throw new TypeError('State params only support JSON-like values')
    }
    if (Array.isArray(item)) {
      if (seen.has(item)) throw new TypeError('State params cannot contain cycles')
      seen.add(item)
      return Object.freeze(item.map(snapshot))
    }
    if (item !== null && typeof item === 'object') {
      const prototype = Object.getPrototypeOf(item)
      if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError('State params only support plain objects and arrays')
      }
      if (seen.has(item)) throw new TypeError('State params cannot contain cycles')
      seen.add(item)
      const copy: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(item as Record<string, unknown>)) {
        copy[key] = snapshot(value)
      }
      return Object.freeze(copy)
    }
    return item
  }
  return snapshot(value) as T
}
