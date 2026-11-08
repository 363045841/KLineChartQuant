/** VM 库注册协议：每个 Context 独立，库显式加载并绑定到 VM 全局。 */

const __libraries = new Map<string, object>()
/** 有状态库的检查点入口；会话回滚时与 series/绘图一起恢复。 */
const __libraryStates: LibraryState[] = []

/** 注册一个库并绑定到 VM 全局；可选 state 让库参与会话检查点。 */
function defineLibrary(name: unknown, members: unknown, state?: LibraryState): object {
  if (typeof name !== 'string' || !name || __libraries.has(name) || name in globalThis) {
    throw new TypeError('库名无效或已注册：' + name)
  }
  if (!members || typeof members !== 'object') throw new TypeError('库需要公开成员对象')
  const library = Object.freeze(members)
  __libraries.set(name, library)
  if (state !== undefined) __libraryStates.push(state)
  Object.defineProperty(globalThis, name, { value: library, enumerable: true })
  return library
}

/** 收集所有有状态库的检查点；顺序与注册顺序一致。 */
function __checkpointLibraries(): readonly unknown[] {
  return __libraryStates.map((state) => state.checkpoint())
}

/** 恢复所有有状态库；数量不匹配说明库集合已变化，直接拒绝。 */
function __rollbackLibraries(states: readonly unknown[]): void {
  if (states.length !== __libraryStates.length) throw new TypeError('库检查点与当前库集合不匹配')
  for (let index = 0; index < __libraryStates.length; index++)
    __libraryStates[index]!.rollback(states[index])
}

/** 读取已加载的库；未加载时抛出。 */
function importLibrary(name: string): object {
  const library = __libraries.get(name)
  if (!library) throw new TypeError('库未加载：' + name)
  return library
}
