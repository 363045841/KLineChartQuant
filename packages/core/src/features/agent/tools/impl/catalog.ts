/** 工具目录：把当前图表能力组装成一组纯数据的工具定义。 */
import type { ChartAgentToolDeps } from '../../types.js'
import type { ChartToolDefinition, ChartToolMetadata } from '../types.js'
import {
  COMPARISONS_LIST_METADATA,
  COMPARISONS_WRITE_METADATA,
  createComparisonsListTool,
  createComparisonsWriteTool,
} from './comparisons.js'
import {
  createDrawingsListTool,
  createDrawingsWriteTool,
  DRAWINGS_LIST_METADATA,
  DRAWINGS_WRITE_METADATA,
} from './drawings.js'
import {
  createIndicatorsListTool,
  createIndicatorsWriteTool,
  INDICATORS_LIST_METADATA,
  INDICATORS_WRITE_METADATA,
} from './indicators.js'
import {
  createIndicatorValuesQueryTool,
  createInstrumentsQueryTool,
  createMarketBarsQueryTool,
  createMarketTimeShareQueryTool,
  INDICATOR_VALUES_QUERY_METADATA,
  INSTRUMENTS_QUERY_METADATA,
  MARKET_BARS_QUERY_METADATA,
  MARKET_TIMESHARE_QUERY_METADATA,
} from './market.js'

/** 图表工具的静态契约清单，供设置界面在不绑定图表时也能列出。 */
export const CHART_TOOL_METADATA: readonly ChartToolMetadata[] = Object.freeze([
  INDICATORS_LIST_METADATA,
  INDICATORS_WRITE_METADATA,
  DRAWINGS_LIST_METADATA,
  DRAWINGS_WRITE_METADATA,
  COMPARISONS_LIST_METADATA,
  COMPARISONS_WRITE_METADATA,
  INSTRUMENTS_QUERY_METADATA,
  MARKET_BARS_QUERY_METADATA,
  MARKET_TIMESHARE_QUERY_METADATA,
  INDICATOR_VALUES_QUERY_METADATA,
])

/**
 * 组装当前图表的工具定义。
 *
 * 读写按资源分开：读工具只依赖查询面，写工具只依赖命令面，因此运行模式
 * 可以直接按 effect 过滤，不需要在工具内部再判断权限。
 */
export function createChartToolCatalog(deps: ChartAgentToolDeps): readonly ChartToolDefinition[] {
  return Object.freeze([
    createIndicatorsListTool(deps.indicators),
    createIndicatorsWriteTool(deps.indicators),
    createDrawingsListTool(deps.drawings),
    createDrawingsWriteTool(deps.drawings),
    createComparisonsListTool(deps.comparisons),
    createComparisonsWriteTool(deps.comparisons),
    createInstrumentsQueryTool(deps.market),
    createMarketBarsQueryTool(deps.market),
    createMarketTimeShareQueryTool(deps.market),
    createIndicatorValuesQueryTool(deps.market),
  ])
}
