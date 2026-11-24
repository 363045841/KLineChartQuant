import type { TimeframeVisibility } from '@363045841yyt/klinechart-plot-contracts'
import { KLINE_PERIODS } from './types.js'

const PERIOD_RANK: ReadonlyMap<string, number> = new Map(
  KLINE_PERIODS.map((period, index) => [period, index]),
)

/** 上下界包含参考周期；未知周期不满足受限规则。 */
export function isVisibleInPeriod(
  visibility: TimeframeVisibility | undefined,
  period: string,
): boolean {
  if (visibility === undefined || visibility.mode === 'all') return true
  const currentRank = PERIOD_RANK.get(period)
  const referenceRank = PERIOD_RANK.get(visibility.period)
  if (currentRank === undefined || referenceRank === undefined) return false
  switch (visibility.mode) {
    case 'above':
      return currentRank >= referenceRank
    case 'below':
      return currentRank <= referenceRank
    case 'current':
      return currentRank === referenceRank
  }
}
