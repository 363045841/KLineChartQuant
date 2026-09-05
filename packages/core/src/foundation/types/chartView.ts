// 图表运行时视图的领域标识与分类。

/** 图表数据视图的运行时标识。 */
export const ChartDataViewId = Object.freeze({
  KLine: 'kline',
  TimeShare: 'timeshare',
  FiveDayTimeShare: 'fiveDayTimeShare',
  Comparison: 'comparison',
} as const)

export type ChartDataView = (typeof ChartDataViewId)[keyof typeof ChartDataViewId]

/** 用户指标、pane 布局与绘图的隔离工作区。 */
export const ChartWorkspaceId = Object.freeze({
  KLine: 'kline',
  TimeShare: 'timeshare',
} as const)

export type ChartWorkspaceId = (typeof ChartWorkspaceId)[keyof typeof ChartWorkspaceId]

/** 判断数据视图是否属于分时视图。 */
export function isTimeShareDataView(view: string): boolean {
  return view === ChartDataViewId.TimeShare || view === ChartDataViewId.FiveDayTimeShare
}

/** 将运行时数据视图归并到用户配置工作区。 */
export function resolveChartWorkspaceId(view: ChartDataView): ChartWorkspaceId {
  return isTimeShareDataView(view) ? ChartWorkspaceId.TimeShare : ChartWorkspaceId.KLine
}
