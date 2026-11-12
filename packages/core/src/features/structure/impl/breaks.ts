/**
 * 结构破坏检测：BOS / CHoCH。
 *
 * `barIndex` 是**收盘越过枢轴价**的那根 bar，影线穿越不算；因此该 bar 收盘即可确认，
 * `confirmedBarIndex === barIndex`，全程不需要未来数据。
 * （对照 `SMC` #114：它的破位要等事件之后的摆动点确认，实际晚 11 根才可知。）
 *
 * BOS 与 CHoCH 的区分依赖「当前趋势」，趋势由最近一次破坏的方向定义：
 * - 同向破坏 → BOS（趋势延续）
 * - 反向破坏 → CHoCH（趋势可能反转）
 * - 首次破坏之前趋势未定，此时记 CHoCH（从无趋势到有趋势本身就是性格改变）
 *
 * 复杂度：每根 bar 只做一次阈值比较，仅当收盘价越过「最低的未破高点 / 最高的未破低点」
 * 时才做一次线性扫描；每个枢轴最多被破坏一次，因此总代价是 O(bars + pivots)。
 */
import {
  BREAK_DIRECTION,
  BREAK_KIND,
  type BreakDirection,
  type BreakKind,
  PIVOT_KIND,
  type PivotScale,
  type StructureBreak,
  type StructurePivot,
} from '../types.js'
import type { StructureBar } from './pivots.js'

/**
 * 取「最靠近当前时刻、且 barIndex 早于目标」的同级枢轴。
 *
 * 用途：计算 `marginRatio` 的分母（被突破枢轴到反向枢轴的距离）。
 *
 * @param pivots 按 barIndex 升序的全部枢轴
 * @param kind 目标类型
 * @param scale 级别
 * @param beforeBarIndex 必须早于该 bar
 * @returns 找到的枢轴；无则 null
 */
function lastPivotBefore(
  pivots: readonly StructurePivot[],
  kind: StructurePivot['kind'],
  scale: PivotScale,
  beforeBarIndex: number,
): StructurePivot | null {
  for (let index = pivots.length - 1; index >= 0; index -= 1) {
    const pivot = pivots[index]
    if (pivot.barIndex >= beforeBarIndex) {
      continue
    }
    if (pivot.kind === kind && pivot.scale === scale) {
      return pivot
    }
  }
  return null
}

/**
 * 检测结构破坏。
 *
 * @param bars 已收盘 bar，按时间升序
 * @param pivots 已按 barIndex 升序的枢轴（可含多个级别，本函数只处理 `scale` 指定的级别）
 * @param scale 参与判定与归类的级别
 * @returns 按时间升序的破坏事件
 */
export function detectBreaks(
  bars: readonly StructureBar[],
  pivots: readonly StructurePivot[],
  scale: PivotScale,
): StructureBreak[] {
  const scoped = pivots.filter((pivot) => pivot.scale === scale)
  const unbrokenHighs: StructurePivot[] = []
  const unbrokenLows: StructurePivot[] = []
  const breaks: StructureBreak[] = []
  let cursor = 0
  let trend: BreakDirection | null = null
  // 未破枢轴里「最容易被突破」的两个价：最低的未破高点、最高的未破低点。
  // 收盘价没有越过它们时，本根 bar 根本不可能产生破位，直接跳过线性扫描。
  let minUnbrokenHigh = Number.POSITIVE_INFINITY
  let maxUnbrokenLow = Number.NEGATIVE_INFINITY

  for (let index = 0; index < bars.length; index += 1) {
    // 只把「此刻已确认」的枢轴纳入判定，绝不用尚未确认的枢轴。
    while (cursor < scoped.length && scoped[cursor].confirmedBarIndex <= index) {
      const pivot = scoped[cursor]
      if (pivot.kind === PIVOT_KIND.high) {
        unbrokenHighs.push(pivot)
        if (pivot.price < minUnbrokenHigh) minUnbrokenHigh = pivot.price
      } else {
        unbrokenLows.push(pivot)
        if (pivot.price > maxUnbrokenLow) maxUnbrokenLow = pivot.price
      }
      cursor += 1
    }
    const close = bars[index].close
    if (close <= minUnbrokenHigh && close >= maxUnbrokenLow) {
      continue
    }

    // 向上：收盘越过哪些未破高点。取其中价格最高的一条（突破的才是最显著的那道结构）。
    let clearedHigh: StructurePivot | null = null
    for (const pivot of unbrokenHighs) {
      if (pivot.price < close && (clearedHigh === null || pivot.price > clearedHigh.price)) {
        clearedHigh = pivot
      }
    }
    // 向下：收盘跌破哪些未破低点，取价格最低的一条。
    let clearedLow: StructurePivot | null = null
    for (const pivot of unbrokenLows) {
      if (pivot.price > close && (clearedLow === null || pivot.price < clearedLow.price)) {
        clearedLow = pivot
      }
    }
    if (clearedHigh === null && clearedLow === null) {
      continue
    }

    // 理论上收盘价不可能同时越过高点与低点（价格区间不重叠），防御性取幅度更大的那侧。
    const upMargin = clearedHigh === null ? -Infinity : close - clearedHigh.price
    const downMargin = clearedLow === null ? -Infinity : clearedLow.price - close
    const direction: BreakDirection =
      upMargin >= downMargin ? BREAK_DIRECTION.up : BREAK_DIRECTION.down
    const brokenPivot = direction === BREAK_DIRECTION.up ? clearedHigh : clearedLow
    if (brokenPivot === null) {
      continue
    }
    const margin =
      direction === BREAK_DIRECTION.up ? close - brokenPivot.price : brokenPivot.price - close
    const kind: BreakKind = trend === direction ? BREAK_KIND.bos : BREAK_KIND.choch

    // 分母：被突破枢轴到最近一个反向枢轴的距离；没有反向枢轴时记 0（无从归一的力度）。
    const reverse = lastPivotBefore(
      scoped,
      direction === BREAK_DIRECTION.up ? PIVOT_KIND.low : PIVOT_KIND.high,
      scale,
      brokenPivot.barIndex,
    )
    const span = reverse === null ? 0 : Math.abs(brokenPivot.price - reverse.price)
    const marginRatio = span > 0 ? margin / span : 0

    breaks.push({
      kind,
      direction,
      scale,
      brokenPivot,
      barIndex: index,
      time: bars[index].openTime,
      close,
      margin,
      marginRatio,
      confirmedBarIndex: index,
      confirmedTime: bars[index].closeTime,
    })
    trend = direction

    // 已越过的同侧枢轴全部作废：它们是同一波推进中被依次吃掉的结构。
    if (direction === BREAK_DIRECTION.up) {
      removeConsumed(unbrokenHighs, (pivot) => pivot.price < close)
      minUnbrokenHigh = unbrokenHighs.reduce(
        (min, pivot) => Math.min(min, pivot.price),
        Number.POSITIVE_INFINITY,
      )
    } else {
      removeConsumed(unbrokenLows, (pivot) => pivot.price > close)
      maxUnbrokenLow = unbrokenLows.reduce(
        (max, pivot) => Math.max(max, pivot.price),
        Number.NEGATIVE_INFINITY,
      )
    }
  }

  return breaks
}

/**
 * 原地移除满足条件的枢轴（用一个写指针完成，避免 splice 的重复搬移）。
 *
 * @param list 待过滤数组
 * @param consumed 判定该枢轴是否已被吃掉
 */
function removeConsumed(
  list: StructurePivot[],
  consumed: (pivot: StructurePivot) => boolean,
): void {
  let write = 0
  for (let read = 0; read < list.length; read += 1) {
    if (!consumed(list[read])) {
      list[write] = list[read]
      write += 1
    }
  }
  list.length = write
}
