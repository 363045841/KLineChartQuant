// Provider 设置模块的契约层：定义设置弹窗 store 的公共类型；实现位于 impl/。

import type {
  AgentBridgeClient,
  AgentErrorView,
  AgentToolDebugResult,
  AgentToolView,
  ProviderApiProtocol,
  ProviderModelView,
  ProviderProfileView,
  ProviderStatusView,
} from '../../agent-contracts.js'

/** Provider 设置 store 的公共契约：连接草稿、Profile/模型池/工具状态与异步操作。 */
export interface AgentProviderSettingsStore {
  /** 设置弹窗是否可见。 */
  open: boolean
  /** Provider 基础地址草稿。 */
  baseUrl: string
  /** API Key 草稿；关闭弹窗时立即清除，不进入持久化状态。 */
  apiKey: string
  /** Exa 搜索 API Key 草稿；关闭弹窗时立即清除。 */
  exaApiKey: string
  /** 附加请求头 JSON 草稿。 */
  headers: string
  /** 当前 Provider 协议草稿。 */
  protocol: ProviderApiProtocol
  /** 当前激活的 Profile 名称。 */
  profileName: string
  /** 已保存的 Profile 列表。 */
  profiles: ProviderProfileView[]
  /** 连接与 Profile 操作的错误视图。 */
  operationError: AgentErrorView | null
  /** Profile 命名弹窗的校验错误视图。 */
  profileNameError: AgentErrorView | null
  /** 当前注册的工具列表。 */
  tools: AgentToolView[]
  /** 各工具调试参数的 JSON 草稿。 */
  toolInputs: Record<string, string>
  /** 各工具最近一次调试成功的返回值。 */
  toolResults: Record<string, AgentToolDebugResult>
  /** 各工具最近一次调试失败的错误信息。 */
  toolErrors: Record<string, string>
  /** 正在调试的工具名；无进行中调试时为 null。 */
  runningToolName: string | null
  /** 当前 Provider 的远端模型目录。 */
  modelCatalog: ProviderModelView[]
  /** 当前 Provider 已加入模型池的模型。 */
  modelPool: ProviderModelView[]
  /** 模型目录是否正在刷新。 */
  modelsLoading: boolean

  /** 绑定当前 Workspace 的 bridge，供后续操作调用。 */
  bindBridge(value: AgentBridgeClient): void
  /** 更新协议草稿。 */
  setProtocol(value: string): void
  /** 切换到指定名称的已保存 Profile。 */
  selectProfile(name: string): Promise<void>
  /** 创建并激活新的空 Profile；成功返回 true。 */
  createProfile(name: string): Promise<boolean>
  /** 重命名已保存 Profile；成功返回 true。 */
  renameProfile(name: string, nextProfileName: string): Promise<boolean>
  /** 删除已保存 Profile；成功返回 true。 */
  deleteProfile(name: string): Promise<boolean>
  /** 清除 Profile 命名弹窗的校验错误。 */
  clearProfileNameError(): void
  /** 打开设置弹窗并加载 Profile、模型池与工具状态。 */
  show(status: ProviderStatusView): Promise<void>
  /** 刷新当前 Provider 的远端模型目录。 */
  refreshModelCatalog(): Promise<void>
  /** 持久化当前 Profile 连接；成功返回 true。 */
  persistConnection(): Promise<boolean>
  /** 更新指定目录模型的模型池成员状态。 */
  setModelPoolMembership(modelId: string, enabled: boolean): Promise<void>
  /** 更新工具启用状态。 */
  setToolEnabled(name: string, enabled: boolean): Promise<void>
  /** 保存工具调试参数草稿。 */
  setToolInput(name: string, input: string): void
  /** 执行工具调试。 */
  debugTool(name: string): Promise<void>
  /** 关闭弹窗并清除内存中的 API Key 草稿。 */
  close(): void
  /** 保存连接并关闭弹窗。 */
  saveProvider(): Promise<void>
}
