/** 成交覆盖区间的纯运算；只请求未覆盖的区间，历史按有界时间页读取。 */
import type { TradeRange } from '../types.js'

export const TRADE_HISTORY_PAGE_MS = 60_000

/** 合并重叠或首尾相接的左闭右开区间。 */
export function mergeTradeRanges(ranges: readonly TradeRange[]): TradeRange[] {
  const merged: TradeRange[] = []
  for (const range of [...ranges].sort((a, b) => a.from - b.from)) {
    const last = merged[merged.length - 1]
    if (last && range.from <= last.to)
      merged[merged.length - 1] = { from: last.from, to: Math.max(last.to, range.to) }
    else if (range.to > range.from) merged.push(range)
  }
  return merged
}

/** 从可视需求扣除已有覆盖与已失败区间，避免相同错误随手势重复请求。 */
export function missingTradeRanges(
  range: TradeRange,
  covered: readonly TradeRange[],
): TradeRange[] {
  const missing: TradeRange[] = []
  let from = range.from
  for (const item of mergeTradeRanges(covered)) {
    if (item.to <= from) continue
    if (item.from >= range.to) break
    if (item.from > from) missing.push({ from, to: Math.min(item.from, range.to) })
    from = Math.max(from, item.to)
    if (from >= range.to) break
  }
  if (from < range.to) missing.push({ from, to: range.to })
  return missing
}
