/** VM 库注册协议：每个 Context 独立，库显式加载并绑定到 VM 全局。 */

const __libraries = new Map<string, object>()

/** 注册一个库并绑定到 VM 全局；名称空、重复或与已有全局冲突时拒绝。脚本无类型，入参按未知值校验。 */
function defineLibrary(name: unknown, members: unknown): object {
  if (typeof name !== 'string' || !name || __libraries.has(name) || name in globalThis) {
    throw new TypeError('库名无效或已注册：' + name)
  }
  if (!members || typeof members !== 'object') throw new TypeError('库需要公开成员对象')
  const library = Object.freeze(members)
  __libraries.set(name, library)
  Object.defineProperty(globalThis, name, { value: library, enumerable: true })
  return library
}

/** 读取已加载的库；未加载时抛出。 */
function importLibrary(name: string): object {
  const library = __libraries.get(name)
  if (!library) throw new TypeError('库未加载：' + name)
  return library
}
