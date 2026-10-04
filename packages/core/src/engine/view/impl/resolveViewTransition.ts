/** 图表视图只由主品种周期决定，比较品种始终是 K 线视图的叠加数据。 */
import { FIVE_DAY_TIME_SHARE_PERIOD, isTimeSharePeriod } from '@/controllers/types.js'
import { ChartDataViewId } from '../../state/modeState.js'
import type { ViewTransition, ViewTransitionInput } from '../types.js'

/** 根据主品种周期返回 K 线或分时视图，不读取比较集合。 */
export function resolveViewTransition(input: ViewTransitionInput): ViewTransition {
  const timeShare = isTimeSharePeriod(input.period)
  return {
    dataView: timeShare
      ? input.period === FIVE_DAY_TIME_SHARE_PERIOD
        ? ChartDataViewId.FiveDayTimeShare
        : ChartDataViewId.TimeShare
      : ChartDataViewId.KLine,
    timeShare,
  }
}
