// 本文件是 Agent 功能模块的公共出口，仅重导出契约、工具目录与实现入口。
export { CHART_AGENT_ERROR_CODES } from '../../errors.js'
export { createChartAgentController } from './impl/chartAgentController.js'
export {
  createChartAgentDrawingCommands,
  createChartAgentIndicatorCommands,
  createChartAgentMarketQueries,
  createChartAgentToolDeps,
} from './impl/chartToolDeps.js'
export { createMarketDataTextFormatter } from './impl/marketDataTextFormatter.js'
export type { ChartToolDefinition, ChartToolMetadata, ChartToolResult } from './tools/index.js'
export { CHART_TOOL_METADATA, createChartToolCatalog } from './tools/index.js'
export type {
  BarsQueryInput,
  ChartAgentActiveIndicator,
  ChartAgentContextSnapshot,
  ChartAgentController,
  ChartAgentControllerDependencies,
  ChartAgentDataRange,
  ChartAgentDrawingCommands,
  ChartAgentDrawingSelection,
  ChartAgentDrawingSnapshot,
  ChartAgentIndicatorCommands,
  ChartAgentIndicatorDefinition,
  ChartAgentIndicatorTarget,
  ChartAgentIndicatorView,
  ChartAgentMarketQueries,
  ChartAgentTimeRange,
  ChartAgentToolDeps,
  IndicatorQueryInput,
  InstrumentLookupInput,
} from './types.js'
