/** 管理 Agent Provider 设置弹窗的临时表单状态与异步操作。 */
import { createPinia, defineStore } from 'pinia'
import { computed, ref } from 'vue'

import type {
  AgentBridgeClient,
  AgentErrorView,
  ProviderModelView,
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
  const baseUrl = ref('')
  const apiKey = ref('')
  const model = ref('')
  const models = ref<ProviderModelView[]>([])
  const modelsLoading = ref(false)
  const testResult = ref<ProviderTestResult | null>(null)
  const operationError = ref<AgentErrorView | null>(null)
  let bridge: AgentBridgeClient | undefined
  let refreshRequestId = 0

  const canRefreshModels = computed(() => !modelsLoading.value)
  const canTest = computed(() => !modelsLoading.value)

  /** 绑定当前 Workspace 的 bridge，供 store 操作调用。 */
  function bindBridge(value: AgentBridgeClient): void {
    bridge = value
  }

  /** 打开弹窗并从已保存的 Provider 配置创建全新草稿。 */
  function show(status: ProviderStatusView): void {
    open.value = true
    baseUrl.value = status.baseUrl ?? ''
    apiKey.value = ''
    model.value = status.modelId ?? ''
    models.value = []
    testResult.value = null
    operationError.value = null
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
      const result = await bridge.listProviderModels({
        baseUrl: baseUrl.value,
        apiKey: apiKey.value || undefined,
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
    const input: ProviderTestInput = {
      baseUrl: baseUrl.value,
      apiKey: apiKey.value || undefined,
      model: model.value,
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
      await bridge.saveProvider({
        baseUrl: baseUrl.value,
        apiKey: apiKey.value || undefined,
        model: model.value,
        modelName,
      })
      close()
    } catch (error) {
      operationError.value = toOperationError(error)
    }
  }

  return {
    open,
    baseUrl,
    apiKey,
    model,
    models,
    modelsLoading,
    testResult,
    operationError,
    canRefreshModels,
    canTest,
    bindBridge,
    show,
    close,
    refreshModels,
    testProvider,
    saveProvider,
  }
})

export type AgentProviderSettingsStore = ReturnType<typeof useAgentProviderSettingsStore>
