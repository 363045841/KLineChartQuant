/**
 * 止损价解析：把「止损放在哪里」从回放逻辑里抽出来，云边与结构位可切换对照。
 *
 * 结构位止损的因果性：只用 `confirmedBarIndex <= 信号 bar` 的枢轴，
 * 即信号 bar 收盘时已经确认的摆动点。信号 bar 自己不可能成为它的止损锚，
 * 因为确认它需要之后的 bar。
 */
import { detectPivots, type StructurePivot } from '@363045841yyt/klinechart-core/structure'
import type { Candle, Direction, StopSource } from '../types'

/** 解析止损所需的上文。 */
export interface StopContext {
  /** 信号 bar 索引 */
  readonly barIndex: number
  readonly direction: Direction
  /** 入场价（信号 bar 收盘价） */
  readonly entryPrice: number
  /** 云上沿 */
  readonly cloudTop: number
  /** 云下沿 */
  readonly cloudBottom: number
}

/**
 * 止损解析器：纯函数，同一上下文永远返回同一结果。
 *
 * 返回 null 表示「这个位置放不出止损」，调用方必须把它当作不可开仓，不得静默退回其它口径。
 */
export type StopResolver = (context: StopContext) => number | null

/**
 * 二分查找：`confirmedBarIndex <= barIndex` 的最后一条枢轴下标。
 *
 * @param pivots 按 confirmedBarIndex 升序的枢轴
 * @param barIndex 信号 bar 索引
 * @returns 下标；没有可用枢轴时为 -1
 */
function lastConfirmedIndex(pivots: readonly StructurePivot[], barIndex: number): number {
  let low = 0
  let high = pivots.length - 1
  let found = -1
  while (low <= high) {
    const middle = (low + high) >> 1
    if (pivots[middle].confirmedBarIndex <= barIndex) {
      found = middle
      low = middle + 1
    } else {
      high = middle - 1
    }
  }
  return found
}

/**
 * 构造止损解析器。
 *
 * @param candles 已收盘 K 线（按时间升序）
 * @param stopSource 止损来源
 * @param pivotLookback 枢轴窗口（仅 structure 口径使用）
 * @returns 止损解析器
 * @throws Error 枢轴窗口非法
 */
export function createStopResolver(
  candles: readonly Candle[],
  stopSource: StopSource,
  pivotLookback: number,
): StopResolver {
  if (stopSource === 'cloud') {
    return (context) => (context.direction === 'long' ? context.cloudBottom : context.cloudTop)
  }
  const pivots = detectPivots(candles, pivotLookback, 'swing')
  const highs = pivots.filter((pivot) => pivot.kind === 'high')
  const lows = pivots.filter((pivot) => pivot.kind === 'low')

  return (context) => {
    // 多头止损放在最近一个已确认、且低于入场价的摆动低点；空头反之。
    const pool = context.direction === 'long' ? lows : highs
    let index = lastConfirmedIndex(pool, context.barIndex)
    while (index >= 0) {
      const price = pool[index].price
      if (context.direction === 'long' ? price < context.entryPrice : price > context.entryPrice) {
        return price
      }
      index -= 1
    }
    return null
  }
}
