/** Captures entries without exposing the backing Map to consumers. */
export function immutableMap<K, V>(source?: ReadonlyMap<K, V>): ReadonlyMap<K, V> {
  const copy = new Map(source)
  const rejectMutation = () => {
    throw new TypeError('ReadonlyMap is immutable')
  }
  const view = Object.freeze({
    size: copy.size,
    get: (key: K) => copy.get(key),
    has: (key: K) => copy.has(key),
    keys: () => copy.keys(),
    values: () => copy.values(),
    entries: () => copy.entries(),
    [Symbol.iterator]: () => copy.entries(),
    forEach(callback: (value: V, key: K, map: ReadonlyMap<K, V>) => void, thisArg?: unknown) {
      for (const [key, value] of copy) callback.call(thisArg, value, key, view)
    },
    set: rejectMutation,
    delete: rejectMutation,
    clear: rejectMutation,
  })
  return view
}
