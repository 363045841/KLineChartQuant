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
      const copy = Object.freeze(item.map(snapshot))
      seen.delete(item)
      return copy
    }
    if (item !== null && typeof item === 'object') {
      const prototype = Object.getPrototypeOf(item)
      if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError('State params only support plain objects and arrays')
      }
      if (seen.has(item)) throw new TypeError('State params cannot contain cycles')
      seen.add(item)
      const copy = Object.fromEntries(Object.entries(item).map(([key, value]) => [key, snapshot(value)]))
      seen.delete(item)
      return Object.freeze(copy)
    }
    return item
  }
  return snapshot(value) as T
}
