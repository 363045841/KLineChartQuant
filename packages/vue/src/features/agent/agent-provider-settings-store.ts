/** 管理 Agent Provider 设置弹窗的临时表单状态与异步操作。 */
import { createPinia, defineStore } from 'pinia'
import { computed, ref } from 'vue'

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
  ProviderTestInput,
  ProviderTestResult,
} from './agent-contracts'

/** 将 bridge 错误收敛为 UI 可直接展示的错误视图。 */
function toOperationError(error: unknown): AgentErrorView {
  if (typeof error === 'object' && error !== null) {
    const value = error as Record<string, unknown>
    if (typeof value.code === 'string' && typeof value.message === 'string') {
      return {
        code: value.code,
        message: value.message,
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
  const toolsOpen = ref(false)
  const baseUrl = ref('')
  const apiKey = ref('')
  const headers = ref('{}')
  const protocol = ref<ProviderApiProtocol>(PROVIDER_API_PROTOCOLS[0])
  const profileName = ref('')
  const profiles = ref<ProviderProfileView[]>([])
  const model = ref('')
  const models = ref<ProviderModelView[]>([])
  const modelsLoading = ref(false)
  const testResult = ref<ProviderTestResult | null>(null)
  const operationError = ref<AgentErrorView | null>(null)
  const tools = ref<AgentToolView[]>([])
  const toolInputs = ref<Record<string, string>>({})
  const toolResults = ref<Record<string, AgentToolDebugResult>>({})
  const toolErrors = ref<Record<string, string>>({})
  const runningToolName = ref<string | null>(null)
  let bridge: AgentBridgeClient | undefined
  let refreshRequestId = 0

  const canRefreshModels = computed(() => !modelsLoading.value)
  const canTest = computed(() => !modelsLoading.value)

  /** 绑定当前 Workspace 的 bridge，供 store 操作调用。 */
  function bindBridge(value: AgentBridgeClient): void {
    bridge = value
  }

  /** 更新协议草稿并使旧测试结果失效。 */
  function setProtocol(value: string): void {
    if (!PROVIDER_API_PROTOCOLS.includes(value as ProviderApiProtocol)) return
    protocol.value = value as ProviderApiProtocol
    testResult.value = null
  }

  /** 切换到指定名称的已保存配置，并用其内容重建表单草稿。 */
  async function selectProfile(name: string): Promise<void> {
    if (!bridge || name === profileName.value) return
    operationError.value = null
    try {
      await bridge.selectProviderProfile(name)
      const [status, nextProfiles] = await Promise.all([
        bridge.getProviderStatus(),
        bridge.listProviderProfiles(),
      ])
      profiles.value = nextProfiles
      profileName.value = name
      baseUrl.value = status.baseUrl ?? ''
      apiKey.value = ''
      headers.value = JSON.stringify(status.headers ?? {}, null, 2)
      protocol.value = status.protocol ?? PROVIDER_API_PROTOCOLS[0]
      model.value = status.modelId ?? ''
      models.value = []
      testResult.value = null
    } catch (error) {
      operationError.value = toOperationError(error)
    }
  }

  /** 创建并激活一个空配置，再重置其编辑表单。 */
  async function createProfile(name: string): Promise<boolean> {
    const normalizedName = name.trim()
    if (!bridge || !normalizedName) return false
    operationError.value = null
    try {
      await bridge.createProviderProfile(normalizedName)
      profiles.value = await bridge.listProviderProfiles()
      profileName.value = normalizedName
      baseUrl.value = ''
      apiKey.value = ''
      headers.value = '{}'
      protocol.value = PROVIDER_API_PROTOCOLS[0]
      model.value = ''
      models.value = []
      testResult.value = null
      return true
    } catch (error) {
      operationError.value = toOperationError(error)
      return false
    }
  }

  /** 打开弹窗并按当前生效配置名称恢复表单草稿。 */
  async function show(status: ProviderStatusView): Promise<void> {
    open.value = true
    operationError.value = null
    baseUrl.value = status.baseUrl ?? ''
    apiKey.value = ''
    headers.value = JSON.stringify(status.headers ?? {}, null, 2)
    protocol.value = status.protocol ?? PROVIDER_API_PROTOCOLS[0]
    model.value = status.modelId ?? ''
    try {
      const nextProfiles = bridge ? await bridge.listProviderProfiles() : []
      profiles.value = nextProfiles
    } catch (error) {
      profiles.value = []
      operationError.value = toOperationError(error)
    }
    profileName.value = status.profileName ?? ''
    models.value = []
    testResult.value = null
  }

  /** 打开工具管理弹窗并读取当前持久化的启用状态。 */
  async function showTools(): Promise<void> {
    toolsOpen.value = true
    operationError.value = null
    try {
      tools.value = bridge ? await bridge.listTools() : []
      for (const tool of tools.value) {
        toolInputs.value[tool.name] ??= '{\n  \n}'
      }
    } catch (error) {
      tools.value = []
      operationError.value = toOperationError(error)
    }
  }

  /** 关闭工具管理弹窗。 */
  function closeTools(): void {
    toolsOpen.value = false
    operationError.value = null
  }

  /** 保存工具开关后更新弹窗中的当前状态。 */
  async function setToolEnabled(name: string, enabled: boolean): Promise<void> {
    if (!bridge) return
    operationError.value = null
    try {
      await bridge.setToolEnabled(name, enabled)
      tools.value = await bridge.listTools()
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
    open.value = false
    apiKey.value = ''
    operationError.value = null
  }

  /** 刷新当前端点的模型目录，忽略较早请求的迟到响应。 */
  async function refreshModels(): Promise<void> {
    if (!bridge || modelsLoading.value) return
    const requestId = ++refreshRequestId
    modelsLoading.value = true
    operationError.value = null
    try {
      const customHeaders = parseHeaders()
      if (!customHeaders) return
      const result = await bridge.listProviderModels({
        baseUrl: baseUrl.value,
        apiKey: apiKey.value || undefined,
        headers: customHeaders,
        protocol: protocol.value,
      })
      if (requestId !== refreshRequestId) return
      models.value = result.models
      if (!models.value.some((item) => item.id === model.value)) {
        model.value = models.value[0]?.id ?? ''
      }
    } catch (error) {
      if (requestId === refreshRequestId) operationError.value = toOperationError(error)
    } finally {
      if (requestId === refreshRequestId) modelsLoading.value = false
    }
  }

  /** 测试当前草稿并保留结果供用户参考。 */
  async function testProvider(): Promise<void> {
    if (!bridge || modelsLoading.value) return
    operationError.value = null
    testResult.value = null
    const customHeaders = parseHeaders()
    if (!customHeaders) return
    const input: ProviderTestInput = {
      baseUrl: baseUrl.value,
      apiKey: apiKey.value || undefined,
      headers: customHeaders,
      model: model.value,
      protocol: protocol.value,
    }
    try {
      testResult.value = await bridge.testProvider(input)
    } catch (error) {
      operationError.value = toOperationError(error)
    }
  }

  /** 保存当前 Provider 草稿，并由 bridge 持久化到浏览器存储。 */
  async function saveProvider(): Promise<void> {
    if (!bridge) return
    const modelName = models.value.find((item) => item.id === model.value)?.name ?? model.value
    operationError.value = null
    try {
      const customHeaders = parseHeaders()
      if (!customHeaders) return
      await bridge.saveProvider({
        baseUrl: baseUrl.value,
        apiKey: apiKey.value || undefined,
        headers: customHeaders,
        model: model.value,
        modelName,
        protocol: protocol.value,
        profileName: profileName.value,
      })
      profiles.value = await bridge.listProviderProfiles()
      profileName.value = profileName.value.trim()
      close()
    } catch (error) {
      operationError.value = toOperationError(error)
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
    toolsOpen,
    baseUrl,
    apiKey,
    headers,
    protocol,
    profileName,
    profiles,
    model,
    models,
    modelsLoading,
    testResult,
    operationError,
    tools,
    toolInputs,
    toolResults,
    toolErrors,
    runningToolName,
    canRefreshModels,
    canTest,
    bindBridge,
    setProtocol,
    selectProfile,
    createProfile,
    show,
    showTools,
    closeTools,
    setToolEnabled,
    setToolInput,
    debugTool,
    close,
    refreshModels,
    testProvider,
    saveProvider,
  }
})

export type AgentProviderSettingsStore = ReturnType<typeof useAgentProviderSettingsStore>
