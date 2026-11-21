/** Agent 工具层的公共出口：契约类型 + 静态清单 + 组装入口。 */
export { CHART_TOOL_METADATA, createChartToolCatalog } from './impl/catalog.js'
export { createUnwiredScripts } from './impl/scripts.js'
export type { ChartToolDefinition, ChartToolMetadata, ChartToolResult } from './types.js'
