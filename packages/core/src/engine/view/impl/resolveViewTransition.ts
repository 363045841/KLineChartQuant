/** 图表视图只由主品种周期决定，比较品种始终是 K 线视图的叠加数据。 */
import { isTimeShareDataView, resolveChartDataView } from '../../chartModel/index.js'
import type { ViewTransition, ViewTransitionInput } from '../types.js'

/** 委托 ChartModel 的视图推导，本模块只表达切换结果的对外形状。 */
export function resolveViewTransition(input: ViewTransitionInput): ViewTransition {
  const dataView = resolveChartDataView(input.period)
  return { dataView, timeShare: isTimeShareDataView(dataView) }
}
