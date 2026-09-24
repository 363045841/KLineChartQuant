import type { TradingDate } from '@/data/provider/types.js'
import type { KLineData } from '@/foundation/types/price.js'
import type { AnchorTradingDateResolution } from '../types.js'

export function resolveDrawingTradingDate(
  data: ReadonlyArray<Pick<KLineData, 'date' | 'timestamp'>>,
  tradingDate: TradingDate,
): AnchorTradingDateResolution {
  const dated = data.flatMap((bar) =>
    bar.date === undefined ? [] : [{ date: bar.date, timestamp: bar.timestamp }],
  )
  if (dated.length === 0) return { kind: 'date-unavailable' }
  let earliest = dated[0]!.date
  let latest = dated[0]!.date
  for (const bar of dated) {
    if (bar.date < earliest) earliest = bar.date
    if (bar.date > latest) latest = bar.date
  }
  if (tradingDate < earliest || tradingDate > latest) {
    return { kind: 'out-of-range', earliest, latest }
  }
  const bar = dated.find((item) => item.date === tradingDate)
  return bar === undefined
    ? { kind: 'not-trading' }
    : { kind: 'resolved', timestamp: bar.timestamp }
}
