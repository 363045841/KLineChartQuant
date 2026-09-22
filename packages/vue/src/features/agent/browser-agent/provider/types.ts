// Provider 配置、模型池与凭据持久化的数据契约层；实现位于 impl/。

import type {
  OpenAiCompatibleProviderSettings,
  ProviderModelPoolEntry,
} from '@363045841yyt/klinechart-agent-runtime'
import type { ProviderApiProtocol } from '../../agent-contracts.js'

/** Provider 连接配置独立于运行模型保存，便于在 Composer 中切换模型。 */
export interface BrowserProviderConnection {
  baseUrl: string
  headers: Record<string, string>
  protocol: ProviderApiProtocol
}

/** 浏览器端 Provider 配置档案；apiKey 实际由凭据存储持有，此字段仅为旧设置文档兼容。 */
export interface BrowserProviderProfile {
  name: string
  apiKey: string
  exaApiKey?: string
  settings?: OpenAiCompatibleProviderSettings
  connection?: BrowserProviderConnection
  active: boolean
}

/** LocalStorage 中 Agent 模型设置的持久化文档。 */
export interface BrowserAgentModelSettings {
  profiles: BrowserProviderProfile[]
  modelPool: ProviderModelPoolEntry[]
  enabledTools: string[]
}
