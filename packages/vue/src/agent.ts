/** 同一产品包内的高级 Agent 接口；普通工作台消费不静态加载此入口。 */
export { default as AgentWorkbenchShell } from './features/agent/AgentWorkbenchShell.vue'
export * from './features/agent/agent-contracts.js'
export { BrowserAgentBridge } from './features/agent/browser-agent/bridge/impl/browser-agent-bridge.js'
export type { BrowserAgentBridgeOptions } from './features/agent/browser-agent/bridge/types.js'
export { default as AgentWorkspace } from './features/agent/components/AgentWorkspace.vue'
export { useAgentWorkspace } from './features/agent/workspace/impl/use-agent-workspace.js'
export {
  createWorkspaceState,
  displayConversation,
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
