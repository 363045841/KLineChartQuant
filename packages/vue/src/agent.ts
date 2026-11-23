/** 同一产品内的高级 Agent 接口；通用后台入口不动态加载。 */
export { default as AgentWorkbenchShell } from './features/agent/AgentWorkbenchShell.vue'
export * from './features/agent/agent-contracts.js'
export {
  __setAgentTransportFactory,
  getChartAgentClient,
} from './features/agent/browser-agent/host/impl/agent-client.js'
export type { ChartAgentClient } from './features/agent/browser-agent/host/impl/chart-agent-client.js'
export { default as AgentWorkspace } from './features/agent/components/AgentWorkspace.vue'
export { useAgentWorkspace } from './features/agent/workspace/impl/use-agent-workspace.js'
export {
  applyTranscript,
  createWorkspaceState,
} from './features/agent/workspace/impl/workspace-state.js'
export type {
  AgentWorkspaceAvailability,
  AgentWorkspaceState,
} from './features/agent/workspace/types.js'
export type {
  SidePanelSide,
  SidePanelSideStorage,
  SidePanelWidthStorage,
} from './features/side-panel/types.js'
