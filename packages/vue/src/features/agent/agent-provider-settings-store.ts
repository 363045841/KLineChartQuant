/** 管理 Agent Provider 设置弹窗的临时表单状态与异步操作。 */
import { createPinia, defineStore } from 'pinia'
import { ref } from 'vue'

import { PROVIDER_API_PROTOCOLS } from './agent-contracts'

import type {
  AgentBridgeClient,
  AgentErrorView,
  ProviderApiProtocol,
  AgentToolView,
  AgentToolDebugResult,
  ProviderModelView,
  ProviderProfileView,
  ProviderStatusView,
} from './agent-contracts'

/** 将 bridge 错误收敛为 UI 可直接展示的错误视图。 */
function toOperationError(error: unknown): AgentErrorView {
  if (typeof error === 'object' && error !== null) {
    const value = error as Record<string, unknown>
    if (typeof value.code === 'string' && typeof value.message === 'string') {
      return {
        code: value.code,
        message: value.message,
        providerCode: typeof value.providerCode === 'string' ? value.providerCode : undefined,
        raw: typeof value.raw === 'string' ? value.raw : undefined,
        retryable: value.retryable === true,
        recommendedAction:
          typeof value.recommendedAction === 'string' ? value.recommendedAction : undefined,
      }
    }
  }
  return {
    code: 'PROVIDER_ERROR',
    message: 'The Provider operation failed.',
    retryable: true,
  }
}

/** 创建独立 Pinia 容器，防止多个图表实例共享 Provider 弹窗草稿。 */
export function createAgentProviderSettingsPinia() {
  return createPinia()
}

/** 管理单个 Agent Workspace 的 Provider 设置草稿与请求状态。 */
export const useAgentProviderSettingsStore = defineStore('agent-provider-settings', () => {
  const open = ref(false)
  const baseUrl = ref('')
  const apiKey = ref('')
  const exaApiKey = ref('')
  const headers = ref('{}')
  const protocol = ref<ProviderApiProtocol>(PROVIDER_API_PROTOCOLS[0])
  const profileName = ref('')
  const profiles = ref<ProviderProfileView[]>([])
  const operationError = ref<AgentErrorView | null>(null)
  const tools = ref<AgentToolView[]>([])
  const toolInputs = ref<Record<string, string>>({})
  const toolResults = ref<Record<string, AgentToolDebugResult>>({})
  const toolErrors = ref<Record<string, string>>({})
  const runningToolName = ref<string | null>(null)
  const modelCatalog = ref<ProviderModelView[]>([])
  const modelPool = ref<ProviderModelView[]>([])
  const modelsLoading = ref(false)
  let bridge: AgentBridgeClient | undefined
  let modelCatalogRequestGeneration = 0
  let savedConnectionIdentity = ''

  /** 使当前模型目录请求失效，避免旧 Profile 的结果覆盖新配置。 */
  function invalidateModelCatalogRequest(): void {
    modelCatalogRequestGeneration += 1
    modelsLoading.value = false
  }

  /** 绑定当前 Workspace 的 bridge，供 store 操作调用。 */
  function bindBridge(value: AgentBridgeClient): void {
    bridge = value
  }

  /** 更新协议草稿并使旧测试结果失效。 */
  function setProtocol(value: string): void {
    if (!PROVIDER_API_PROTOCOLS.includes(value as ProviderApiProtocol)) return
    protocol.value = value as ProviderApiProtocol
  }

  /** 返回会影响远端模型目录有效性的连接标识。 */
  function connectionIdentity(): string {
    return `${protocol.value}\n${baseUrl.value.trim()}`
  }

  /** 将当前状态投影为设置表单草稿。 */
  function applyProfileStatus(status: ProviderStatusView): void {
    profileName.value = status.profileName ?? ''
    baseUrl.value = status.baseUrl ?? ''
    apiKey.value = ''
    exaApiKey.value = ''
    headers.value = JSON.stringify(status.headers ?? {}, null, 2)
    protocol.value = status.protocol ?? PROVIDER_API_PROTOCOLS[0]
    savedConnectionIdentity = connectionIdentity()
  }

  /** 切换到指定名称的已保存配置，并用其内容重建表单草稿。 */
  async function selectProfile(name: string): Promise<void> {
    if (!bridge || name === profileName.value) return
    invalidateModelCatalogRequest()
    operationError.value = null
    try {
      await bridge.selectProviderProfile(name)
      const [status, nextProfiles] = await Promise.all([
        bridge.getProviderStatus(),
        bridge.listProviderProfiles(),
      ])
      profiles.value = nextProfiles
      applyProfileStatus(status)
      modelCatalog.value = []
      await loadModelPool()
    } catch (error) {
      operationError.value = toOperationError(error)
    }
  }

  /** 创建并激活一个空配置，再重置其编辑表单。 */
  async function createProfile(name: string): Promise<boolean> {
    const normalizedName = name.trim()
    if (!bridge || !normalizedName) return false
    invalidateModelCatalogRequest()
    operationError.value = null
    try {
      await bridge.createProviderProfile(normalizedName)
      profiles.value = await bridge.listProviderProfiles()
      profileName.value = normalizedName
      baseUrl.value = ''
      apiKey.value = ''
      exaApiKey.value = ''
      headers.value = '{}'
      protocol.value = PROVIDER_API_PROTOCOLS[0]
      savedConnectionIdentity = ''
      modelCatalog.value = []
      modelPool.value = []
      return true
    } catch (error) {
      operationError.value = toOperationError(error)
      return false
    }
  }

  /** 打开 Agent 设置并读取当前 Profile、模型池和工具状态。 */
  async function show(status: ProviderStatusView): Promise<void> {
    open.value = true
    operationError.value = null
    applyProfileStatus(status)
    modelCatalog.value = []
    try {
      const [nextProfiles, nextTools] = await Promise.all([
        bridge ? bridge.listProviderProfiles() : [],
        bridge ? bridge.listTools() : [],
      ])
      profiles.value = nextProfiles
      setTools(nextTools)
      await loadModelPool()
    } catch (error) {
      profiles.value = []
      tools.value = []
      operationError.value = toOperationError(error)
    }
  }

  /** 加载当前 Provider 已保存的模型池。 */
  async function loadModelPool(): Promise<void> {
    if (!bridge) return
    modelPool.value = await bridge.listProviderModelPool()
  }

  /** 显式刷新当前已保存 Provider 的远端模型目录。 */
  async function refreshModelCatalog(): Promise<void> {
    if (!bridge || modelsLoading.value) return
    const requestGeneration = ++modelCatalogRequestGeneration
    modelsLoading.value = true
    operationError.value = null
    try {
      const [catalog, pool] = await Promise.all([
        bridge.listProviderModelCatalog(),
        bridge.listProviderModelPool(),
      ])
      if (requestGeneration !== modelCatalogRequestGeneration) return
      modelCatalog.value = catalog.models
      modelPool.value = pool
    } catch (error) {
      if (requestGeneration === modelCatalogRequestGeneration)
        operationError.value = toOperationError(error)
    } finally {
      if (requestGeneration === modelCatalogRequestGeneration) modelsLoading.value = false
    }
  }

  /** 更新目录模型在当前 Provider 模型池中的成员状态。 */
  async function setModelPoolMembership(modelId: string, enabled: boolean): Promise<void> {
    if (!bridge) return
    const model = modelCatalog.value.find((item) => item.id === modelId)
    const included = modelPool.value.some((item) => item.id === modelId)
    if (!model || included === enabled) return
    operationError.value = null
    try {
      await bridge.saveProviderModelPool(
        enabled ? [...modelPool.value, model] : modelPool.value.filter((item) => item.id !== modelId),
      )
      await loadModelPool()
    } catch (error) {
      operationError.value = toOperationError(error)
    }
  }

  /** 用当前注册工具刷新面板状态并初始化调试参数。 */
  function setTools(nextTools: AgentToolView[]): void {
    tools.value = nextTools
    for (const tool of nextTools) {
      toolInputs.value[tool.name] ??= '{\n  \n}'
    }
  }

  /** 保存工具开关后更新弹窗中的当前状态。 */
  async function setToolEnabled(name: string, enabled: boolean): Promise<void> {
    if (!bridge) return
    operationError.value = null
    try {
      await bridge.setToolEnabled(name, enabled)
      setTools(await bridge.listTools())
    } catch (error) {
      operationError.value = toOperationError(error)
    }
  }

  /** 更新工具调试 JSON 草稿。 */
  function setToolInput(name: string, input: string): void {
    toolInputs.value = { ...toolInputs.value, [name]: input }
  }

  /** 执行手动工具调试，并保留该工具最近一次结果或错误。 */
  async function debugTool(name: string): Promise<void> {
    if (!bridge || runningToolName.value) return
    let input: unknown
    try {
      input = JSON.parse(toolInputs.value[name] ?? '{}')
    } catch {
      toolErrors.value = { ...toolErrors.value, [name]: 'Parameters must be valid JSON.' }
      return
    }

    runningToolName.value = name
    toolErrors.value = { ...toolErrors.value, [name]: '' }
    try {
      const result = await bridge.debugTool(name, input)
      toolResults.value = { ...toolResults.value, [name]: result }
    } catch (error) {
      toolErrors.value = { ...toolErrors.value, [name]: toOperationError(error).message }
    } finally {
      runningToolName.value = null
    }
  }

  /** 关闭弹窗并立即清除仅应存在于内存中的 API Key 草稿。 */
  function close(): void {
    invalidateModelCatalogRequest()
    open.value = false
    apiKey.value = ''
    exaApiKey.value = ''
    operationError.value = null
  }

  /** 保存当前 Provider 连接后关闭设置弹窗。 */
  async function saveProvider(): Promise<void> {
    if (await persistConnection()) close()
  }

  /** 持久化当前 Profile 连接；不触发模型目录或模型池读取。 */
  async function persistConnection(): Promise<boolean> {
    if (!bridge) return false
    if (!profileName.value.trim() || !baseUrl.value.trim()) return false
    operationError.value = null
    try {
      const customHeaders = parseHeaders()
      if (!customHeaders) return false
      await bridge.saveProvider({
        baseUrl: baseUrl.value,
        apiKey: apiKey.value || undefined,
        exaApiKey: exaApiKey.value || undefined,
        headers: customHeaders,
        protocol: protocol.value,
        profileName: profileName.value,
      })
      profiles.value = await bridge.listProviderProfiles()
      profileName.value = profileName.value.trim()
      const nextIdentity = connectionIdentity()
      if (savedConnectionIdentity && savedConnectionIdentity !== nextIdentity) {
        invalidateModelCatalogRequest()
        modelCatalog.value = []
        modelPool.value = []
      }
      savedConnectionIdentity = nextIdentity
      return true
    } catch (error) {
      operationError.value = toOperationError(error)
      return false
    }
  }

  /** 解析附加请求头 JSON，并阻止覆盖运行时管理的协议头。 */
  function parseHeaders(): Record<string, string> | undefined {
    let value: unknown
    try {
      value = JSON.parse(headers.value)
    } catch {
      operationError.value = {
        code: 'INVALID_PAYLOAD',
        message: 'Additional headers must be a JSON object with string values.',
        retryable: false,
      }
      return undefined
    }
    if (
      typeof value !== 'object' ||
      value === null ||
      Array.isArray(value) ||
      Object.entries(value).some(
        ([name, header]) =>
          !name.trim() ||
          typeof header !== 'string' ||
          ['accept', 'authorization', 'content-type'].includes(name.toLowerCase()),
      )
    ) {
      operationError.value = {
        code: 'INVALID_PAYLOAD',
        message:
          'Additional headers must have string values and cannot override authentication or protocol headers.',
        retryable: false,
      }
      return undefined
    }
    return value as Record<string, string>
  }

  return {
    open,
    baseUrl,
    apiKey,
    exaApiKey,
    headers,
    protocol,
    profileName,
    profiles,
    operationError,
    tools,
    toolInputs,
    toolResults,
    toolErrors,
    runningToolName,
    modelCatalog,
    modelPool,
    modelsLoading,
    bindBridge,
    setProtocol,
    selectProfile,
    createProfile,
    show,
    refreshModelCatalog,
    persistConnection,
    setModelPoolMembership,
    setToolEnabled,
    setToolInput,
    debugTool,
    close,
    saveProvider,
  }
})

export type AgentProviderSettingsStore = ReturnType<typeof useAgentProviderSettingsStore>
