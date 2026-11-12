/** 跨帧复用的列表身份比较；路径点遵守只读契约，描述符由各阶段保存快照。 */
export function sameItems<T>(a: readonly T[] | undefined, b: readonly T[] | undefined): boolean {
  return (
    a === b ||
    (a !== undefined &&
      b !== undefined &&
      a.length === b.length &&
      a.every((item, index) => item === b[index]))
  )
}
