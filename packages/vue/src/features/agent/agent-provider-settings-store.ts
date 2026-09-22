/**
 * Provider 设置模块的兼容入口：保持既有 `agent-provider-settings-store` 导入路径可用，
 * 实现与类型已迁至 `browser-agent/provider-settings/`。
 */
export {
  createAgentProviderSettingsPinia,
  useAgentProviderSettingsStore,
} from './browser-agent/provider-settings/impl/agent-provider-settings-store.js'
export type { AgentProviderSettingsStore } from './browser-agent/provider-settings/types.js'
