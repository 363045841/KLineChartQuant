/** 行情增量范围：按值比较找出第一根变化的 bar，不依赖引用相等。 */
import type { Bar } from '@363045841yyt/klinechart-plot-contracts'

/** 单根行情逐字段比较；closed 的缺省与显式 undefined 保持不同语义。 */
function sameBar(previous: Bar, next: Bar): boolean {
  return (
    previous.time === next.time &&
    previous.open === next.open &&
    previous.high === next.high &&
    previous.low === next.low &&
    previous.close === next.close &&
    previous.volume === next.volume &&
    previous.closed === next.closed &&
    Object.hasOwn(previous, 'closed') === Object.hasOwn(next, 'closed')
  )
}

/**
 * 返回第一根发生变化的 bar 下标。
 * 追加时返回旧长度；截断或历史修正时返回首个差异位置；完全相同返回新长度。
 */
export function firstChangedBar(previous: readonly Bar[], next: readonly Bar[]): number {
  const common = Math.min(previous.length, next.length)
  for (let index = 0; index < common; index++) {
    if (!sameBar(previous[index]!, next[index]!)) return index
  }
  return common
}
