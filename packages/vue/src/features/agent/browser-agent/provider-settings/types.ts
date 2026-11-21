// Provider 设置模块的契约层：页面消费的唯一快照、命令集合与工具调试状态。

import type {
  AgentErrorView,
  AgentToolDebugResult,
  AgentToolView,
  ProviderAdmin,
  ProviderApiProtocol,
  ProviderCatalogView,
  ProviderModelView,
  ProviderProfileView,
  ProviderSnapshot,
} from '../../agent-contracts.js'

/** 尚未提交的连接输入；页面唯一的本地可写状态。 */
export interface ProviderDraft {
  profileId: string
  name: string
  baseUrl: string
  apiKey: string
  headers: string
  protocol: ProviderApiProtocol
}

/** 设置弹窗需要的工具能力；与图表/宿主工具同源。 */
export interface AgentToolAdmin {
  listTools(): Promise<AgentToolView[]>
  setToolEnabled(name: string, enabled: boolean): Promise<void>
  debugTool(name: string, input: unknown): Promise<AgentToolDebugResult>
}

/** Provider 设置弹窗的公共契约：快照、草稿、命令与工具调试。 */
export interface AgentProviderSettingsStore {
  /** 设置弹窗是否可见。 */
  open: boolean
  /** 宿主文档的最近一次完整快照；页面渲染 Provider 的唯一事实。 */
  snapshot: ProviderSnapshot | null
  /** 最近一次远端目录读取结果；连接或配置变化后自动丢弃。 */
  catalog: ProviderCatalogView | null
  /** 目录是否正在读取。 */
  catalogLoading: boolean
  /** 最近一次操作错误。 */
  error: AgentErrorView | null
  /** 配置命名弹窗的校验错误。 */
  profileNameError: AgentErrorView | null
  /** 连接表单草稿。 */
  draft: ProviderDraft
  /** 派生：已保存配置。 */
  profiles: readonly ProviderProfileView[]
  /** 派生：模型池。 */
  models: readonly ProviderModelView[]
  /** 派生：模型池成员 id。 */
  poolIds: ReadonlySet<string>
  /** 派生：连接、凭据与模型都已就绪，可以发起运行。 */
  ready: boolean
  /** 工具域：可配置的宿主与图表工具。 */
  tools: AgentToolView[]
  toolInputs: Record<string, string>
  toolResults: Record<string, AgentToolDebugResult>
  toolErrors: Record<string, string>
  runningToolName: string | null
  /** Web Search 凭据草稿。 */
  exaApiKey: string

  /** 绑定当前 Workspace 的 Provider 与工具 API。 */
  bindAdmin(admin: ProviderAdmin, tools: AgentToolAdmin): void
  /** 读取一次宿主快照；不打开弹窗、不访问远端。 */
  load(): Promise<void>
  /** 打开弹窗：读取快照、现拉目录并载入工具。 */
  show(): Promise<void>
  /** 关闭弹窗并清除内存中的凭据草稿。 */
  close(): void
  /** 更新协议草稿；非法值忽略。 */
  setProtocol(value: string): void
  /** 保存连接；成功后刷新目录。 */
  saveConnection(): Promise<boolean>
  /** 现拉远端模型目录。 */
  refreshCatalog(): Promise<void>
  /** 切换激活配置。 */
  selectProfile(profileId: string): Promise<void>
  /** 新建并激活配置；名称非法或重复时返回 false。 */
  createProfile(name: string): Promise<boolean>
  /** 重命名配置；失败返回 false。 */
  renameProfile(profileId: string, name: string): Promise<boolean>
  /** 删除配置及其凭据与模型池。 */
  deleteProfile(profileId: string): Promise<boolean>
  /** 清除配置命名的校验错误。 */
  clearProfileNameError(): void
  /** 把模型加入模型池。 */
  addModel(model: ProviderModelView): Promise<void>
  /** 从模型池移除模型。 */
  removeModel(modelId: string): Promise<void>
  /** 选择运行使用的模型。 */
  selectModel(modelId: string): Promise<void>
  /** 设置思考强度。 */
  setReasoningEffort(effort: string | undefined): Promise<void>
  /** 保存全局 Web Search 凭据；空值表示清除。 */
  saveExaKey(): Promise<void>
  /** 更新工具启用状态。 */
  setToolEnabled(name: string, enabled: boolean): Promise<void>
  /** 保存工具调试参数草稿。 */
  setToolInput(name: string, input: string): void
  /** 执行一次工具调试。 */
  debugTool(name: string): Promise<void>
}
