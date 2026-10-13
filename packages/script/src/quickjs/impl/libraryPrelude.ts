/** VM 库注册协议：每个 Context 独立，库显式加载并绑定到 VM 全局。 */
export const LIBRARY_PRELUDE = `
const __libraries = new Map()
function defineLibrary(name, members) {
  if (typeof name !== 'string' || !name || __libraries.has(name) || name in globalThis) {
    throw new TypeError('库名无效或已注册：' + name)
  }
  if (!members || typeof members !== 'object') throw new TypeError('库需要公开成员对象')
  const library = Object.freeze(members)
  __libraries.set(name, library)
  Object.defineProperty(globalThis, name, { value: library, enumerable: true })
  return library
}
function importLibrary(name) {
  if (!__libraries.has(name)) throw new TypeError('库未加载：' + name)
  return __libraries.get(name)
}
`
