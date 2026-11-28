/**
 * Agent 设置契约：宿主文档模型与唯一写入端口。
 *
 * 实现（存储、校验、迁移）在 `impl/agent-settings`，本文件不依赖它。
 */
import type { ProviderApiProtocol, ProviderReasoningEffort } from '../contracts/provider.js'

/** 一个已保存的 Provider 连接。 */
export interface AgentProviderConnection {
  baseUrl: string
  headers: Record<string, string>
  protocol: ProviderApiProtocol
}

/** 模型池中的一条记录；元数据在加入时由宿主校验并固化。 */
export interface AgentProviderModel {
  id: string
  name: string
  contextWindow?: number
  maxOutputTokens: number
  reasoningEfforts: ProviderReasoningEffort[]
  defaultReasoningEffort?: ProviderReasoningEffort
}

/** 一个已保存的 Provider 配置；模型池随配置存储，不再有跨表外键。 */
export interface AgentProviderProfile {
  id: string
  name: string
  apiKey: string
  active: boolean
  connectionRevision: number
  connection?: AgentProviderConnection
  models: AgentProviderModel[]
  selectedModelId?: string
  reasoningEffort?: ProviderReasoningEffort
}

/** 宿主设置文档；唯一事实来源。 */
export interface AgentSettingsDocument {
  version: number
  /** 每次写入递增；跨线程快照用它丢弃过期应答。 */
  revision: number
  profiles: AgentProviderProfile[]
  disabledTools: string[]
  exaApiKey?: string
}

/** 设置文档的持久化端口；`read` 在从未写入时返回 null。 */
export interface AgentSettingsStorage {
  read(): Promise<unknown>
  write(document: unknown): Promise<void>
}

/** 宿主只依赖这一个写入端口；校验、迁移与规范化留在实现里。 */
export interface AgentSettings {
  read(): Promise<AgentSettingsDocument>
  update(change: (draft: AgentSettingsDocument) => void): Promise<AgentSettingsDocument>
  importLegacy(raw: unknown): Promise<void>
}
