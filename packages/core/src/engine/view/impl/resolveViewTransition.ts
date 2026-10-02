/** 集中裁决周期与对比集合对应的视图；分时周期优先于对比集合。 */
import { FIVE_DAY_TIME_SHARE_PERIOD, isTimeSharePeriod } from '@/controllers/types.js'
import { ChartDataViewId } from '../../state/modeState.js'
import type { ViewTransition, ViewTransitionInput } from '../types.js'

/** 根据目标周期和对比集合返回唯一视图决策，不读取或修改运行时状态。 */
export function resolveViewTransition(input: ViewTransitionInput): ViewTransition {
  const timeShare = isTimeSharePeriod(input.period)
  const comparison = !timeShare && input.comparisonSpecs.length > 0
  const dataView = timeShare
    ? input.period === FIVE_DAY_TIME_SHARE_PERIOD
      ? ChartDataViewId.FiveDayTimeShare
      : ChartDataViewId.TimeShare
    : comparison
      ? ChartDataViewId.Comparison
      : ChartDataViewId.KLine
  return { dataView, timeShare, comparison }
}
