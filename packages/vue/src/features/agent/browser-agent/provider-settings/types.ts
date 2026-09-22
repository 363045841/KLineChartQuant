// Provider 设置模块的契约层：对外暴露设置弹窗 store 的公共类型；实现位于 impl/。

import type { useAgentProviderSettingsStore } from './impl/agent-provider-settings-store.js'

/** Provider 设置 store 的公共类型：草稿状态、Profile/模型池/工具状态与异步操作。 */
export type AgentProviderSettingsStore = ReturnType<typeof useAgentProviderSettingsStore>
