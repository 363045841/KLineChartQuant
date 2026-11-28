/** 跨 bar 状态：脚本显式登记，运行时按 bar 快照与恢复，不推断变量含义。 */
type ScriptStateValue =
  | number
  | string
  | boolean
  | null
  | ScriptStateValue[]
  | { [key: string]: ScriptStateValue }

/** 所有登记状态按声明顺序排列；检查点恢复依赖同一顺序。 */
const __stateObjects: Record<string, unknown>[] = []

/** 深拷贝纯数据；函数、类实例与其它引用类型在声明期直接拒绝。 */
function __cloneState<T>(value: T): T {
  if (value === null) return value
  if (typeof value !== 'object') {
    if (
      typeof value === 'function' ||
      typeof value === 'symbol' ||
      typeof value === 'bigint' ||
      value === undefined
    )
      throw new TypeError('state 只接受数字、字符串、布尔、null、数组与普通对象')
    return value
  }
  if (Array.isArray(value)) return value.map((item) => __cloneState(item)) as unknown as T
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null)
    throw new TypeError('state 只接受普通对象')
  const next: Record<string, unknown> = {}
  for (const key of Object.keys(value)) next[key] = __cloneState((value as Record<string, unknown>)[key])
  return next as T
}

/** 原地恢复：脚本持有的是同一个对象引用，不能整体替换。 */
function __restoreState(target: unknown, snapshot: unknown): void {
  if (Array.isArray(target) && Array.isArray(snapshot) && !Object.isFrozen(target)) {
    target.length = snapshot.length
    for (let index = 0; index < snapshot.length; index++) {
      const current = target[index]
      const next = snapshot[index]
      if (
        current !== null &&
        typeof current === 'object' &&
        next !== null &&
        typeof next === 'object' &&
        !Object.isFrozen(current)
      )
        __restoreState(current, next)
      else target[index] = next
    }
    return
  }
  const current = target as Record<string, unknown>
  const next = snapshot as Record<string, unknown>
  for (const key of Object.keys(current)) if (!(key in next)) delete current[key]
  for (const key of Object.keys(next)) {
    const value = current[key]
    const targetValue = next[key]
    // 冻结对象（绘图引用）按叶子处理：替换引用，不原地写。
    if (
      value !== null &&
      typeof value === 'object' &&
      targetValue !== null &&
      typeof targetValue === 'object' &&
      !Object.isFrozen(value)
    )
      __restoreState(value, targetValue)
    else current[key] = targetValue
  }
}

/**
 * 登记一个跨 bar 状态对象。
 *
 * @param initial 初始值；只接受纯数据
 * @returns 脚本读写的状态对象；运行时负责快照与回滚
 */
function state<T extends Record<string, unknown>>(initial: T): T {
  const value = __cloneState(initial)
  __stateObjects.push(value)
  return value
}

/** 收集全部状态快照；与绘图、库状态一起进入会话检查点。 */
function __checkpointStates(): readonly unknown[] {
  return __stateObjects.map((value) => __cloneState(value))
}

/** 按声明顺序原地恢复；数量不一致说明脚本状态集合已变化。 */
function __rollbackStates(states: readonly unknown[]): void {
  if (states.length !== __stateObjects.length)
    throw new TypeError('state 检查点与当前状态集合不匹配')
  for (let index = 0; index < __stateObjects.length; index++)
    __restoreState(__stateObjects[index]!, states[index])
}

Object.assign(globalThis, { state })
