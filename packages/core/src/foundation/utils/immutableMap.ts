/**
 * 不可变 Map 视图：返回真实 Map 实例，写方法在运行时一律抛错。
 *
 * 必须是 Map 实例而不是普通对象：`ReadonlyMap` 只是 TS 结构类型，宿主框架会在运行时做
 * 品牌校验（Vue 把 `ReadonlyMap` prop 编译成 `Map`），普通对象会触发类型不匹配告警。
 * 快照隔离由构造时复制保证；禁止写入由实例级覆写的 set/delete/clear 保证——`Object.freeze`
 * 冻结不了 Map 的内部条目，只会给出错误的安全感。
 */
export function immutableMap<K, V>(source?: ReadonlyMap<K, V>): ReadonlyMap<K, V> {
  const copy = new Map(source)
  const rejectMutation = (): never => {
    throw new TypeError('ReadonlyMap is immutable')
  }
  // 只覆写实例上的写方法，原型链上的读方法（get/has/size/entries 等）保持原生语义。
  Object.defineProperties(copy, {
    set: { value: rejectMutation },
    delete: { value: rejectMutation },
    clear: { value: rejectMutation },
  })
  return copy
}
