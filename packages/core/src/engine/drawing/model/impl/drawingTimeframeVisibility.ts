/** 周期可见性规则的唯一求值入口：参考周期在用户选择规则时确定。 */
import type { DrawingTimeframeVisibility } from '@363045841yyt/klinechart-plot-contracts'
import { KLINE_PERIODS } from '@/data/provider/types.js'

/** 标准 K 线周期的由小到大顺序；同一顺序也用于 request.security 的高低周期比较。 */
const PERIOD_RANK: ReadonlyMap<string, number> = new Map(
  KLINE_PERIODS.map((period, index) => [period, index]),
)

/**
 * 判断图元在给定周期是否可见。
 *
 * `all` 或未配置规则时始终可见；`above` / `below` 包含参考周期本身，
 * `current` 只在参考周期显示。未知周期不满足任何受限规则，避免把自定义周期
 * 误判成标准周期的高低关系。
 *
 * @param visibility 图元保存的规则；undefined 等同 all
 * @param period 当前图表周期
 * @returns 当前周期是否可见
 */
export function isDrawingVisibleInPeriod(
  visibility: DrawingTimeframeVisibility | undefined,
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
