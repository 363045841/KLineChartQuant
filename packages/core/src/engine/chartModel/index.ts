/** ChartModel 模块入口：视图事实来源、视图状态与视图行为实现。 */

export * from './impl/modes/index.js'
export {
  type ChartModeId,
  type ChartModelModule,
  createChartModel,
} from './impl/view/chartModelState.js'
export {
  CHART_VIEW_DEFINITIONS,
  type ChartDataView,
  ChartDataViewId,
  type ChartViewDefinition,
  ChartWorkspaceId,
  DEFAULT_PRIMARY_RENDERERS,
  isTimeShareDataView,
  type MainInstanceDefinition,
  type PrimaryRendererByView,
  type PrimaryRendererType,
  resolveChartDataView,
  resolveChartDataViewForSpec,
  resolveChartWorkspaceId,
  type ViewCapabilities,
} from './impl/view/chartViews.js'
