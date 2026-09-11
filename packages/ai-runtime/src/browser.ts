/**
 * @deprecated 本包已废弃，不再维护。Agent 运行时请使用 `@363045841yyt/klinechart-agent-runtime`，
 * 图表原生 Agent 工具通过 core 的 `@Tool` 注册表提供。
 */
export type * from './types'

export {
  ALL_TOOLS,
  TOOL_GROUPS,
  CHART_NAVIGATION_TOOLS,
  INDICATOR_TOOLS,
  ALERT_TOOLS,
  REPLAY_TOOLS,
  findTool,
} from './toolSchemas'

export {
  describeVolumeProfileState,
  describeAnchoredVwap,
  describeFootprintLatestBar,
  describeAlerts,
  type VolumeProfileSnapshot,
  type AnchoredVwapSeriesSnapshot,
  type FootprintLatestBarSnapshot,
  type AlertSnapshot,
} from './describeControllers'

export {
  serialize,
  deserialize,
  ChartSerializationError,
  type ChartSnapshotInput,
} from './serialization'

export { executeTool, type ToolCall, type ToolResult } from './executeTool'
