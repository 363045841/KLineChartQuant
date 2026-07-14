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
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value
    },
  }) as ReadonlyMap<K, V>
}

/** 浅冻结对象副本 */
export function freezeRecord<T extends Record<string, unknown>>(value: T): Readonly<T> {
  return Object.freeze({ ...value })
}
