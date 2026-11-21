/**
 * Agent Provider 设置弹窗的状态：宿主快照是唯一事实，页面只持有未提交的连接草稿。
 *
 * 所有读写都经 `ProviderAdmin` 命令完成；这里不做状态拼装、不做失效推断，
 * 快照落后于当前版本时直接丢弃。
 */

import { createPinia, defineStore, type Pinia } from 'pinia'
import { computed, reactive, ref, shallowRef } from 'vue'
import type {
  AgentErrorView,
  AgentToolDebugResult,
  AgentToolView,
  ProviderAdmin,
  ProviderCatalogView,
  ProviderModelView,
  ProviderReasoningEffort,
  ProviderSnapshot,
} from '../../../agent-contracts.js'
import { PROVIDER_API_PROTOCOLS, PROVIDER_REASONING_EFFORTS } from '../../../agent-contracts.js'
import { toAgentErrorView } from '../../../agent-error-view.js'
import type { AgentProviderSettingsStore, AgentToolAdmin, ProviderDraft } from '../types.js'

/** 连接保存时禁止覆盖的协议头；由运行时统一生成。 */
const MANAGED_HEADERS = ['accept', 'authorization', 'content-type']

/** 创建独立 Pinia 容器，避免多个图表实例共享 Provider 弹窗草稿。 */
export function createAgentProviderSettingsPinia(): Pinia {
  return createPinia()
}

/** 管理单个 Agent Workspace 的 Provider 设置快照与草稿。 */
function setupAgentProviderSettingsStore() {
  const open = ref(false)
  const snapshot = shallowRef<ProviderSnapshot | null>(null)
  const catalog = shallowRef<ProviderCatalogView | null>(null)
  const catalogLoading = ref(false)
  const error = ref<AgentErrorView | null>(null)
  const profileNameError = ref<AgentErrorView | null>(null)
  const exaApiKey = ref('')
  const draft = reactive<ProviderDraft>({
    profileId: '',
    name: '',
    baseUrl: '',
    apiKey: '',
    headers: '{}',
    protocol: PROVIDER_API_PROTOCOLS[0],
  })
  const tools = shallowRef<AgentToolView[]>([])
  const toolInputs = ref<Record<string, string>>({})
  const toolResults = ref<Record<string, AgentToolDebugResult>>({})
  const toolErrors = ref<Record<string, string>>({})
  const runningToolName = ref<string | null>(null)
  let admin: ProviderAdmin | undefined
  let toolAdmin: AgentToolAdmin | undefined

  /** 派生：已保存配置。 */
  const profiles = computed(() => snapshot.value?.profiles ?? [])
  /** 派生：模型池。 */
  const models = computed(() => snapshot.value?.models ?? [])
  /** 派生：模型池成员 id。 */
  const poolIds = computed(() => new Set(models.value.map((model) => model.id)))
  /** 派生：连接、凭据与模型都已就绪。 */
  const ready = computed(() => {
    const current = snapshot.value
    return Boolean(current?.connection && current.selectedModelId && current.credentialPresent)
  })

  /** 绑定当前 Workspace 的 Provider 与工具 API。 */
  function bindAdmin(provider: ProviderAdmin, toolsApi: AgentToolAdmin): void {
    admin = provider
    toolAdmin = toolsApi
  }

  /** 替换快照；版本落后的应答直接丢弃，连接或配置变化后丢弃目录。 */
  function applySnapshot(next: ProviderSnapshot): void {
    const current = snapshot.value
    if (current !== null && next.revision < current.revision) return
    snapshot.value = next
    const fetched = catalog.value
    if (
      fetched !== null &&
      (fetched.profileId !== next.activeProfileId ||
        fetched.connectionRevision !== next.connectionRevision)
    ) {
      catalog.value = null
    }
  }

  /** 执行一次读写命令；错误统一落到可见错误，不让界面崩溃。 */
  async function run<T>(operation: (api: ProviderAdmin) => Promise<T>): Promise<T | undefined> {
    if (!admin) return undefined
    const api = admin
    error.value = null
    try {
      return await operation(api)
    } catch (caught) {
      error.value = toAgentErrorView(caught)
      return undefined
    }
  }

  /** 执行一次写命令并应用返回的快照。 */
  async function write(
    operation: (api: ProviderAdmin) => Promise<ProviderSnapshot>,
  ): Promise<ProviderSnapshot | undefined> {
    const next = await run(operation)
    if (next) applySnapshot(next)
    return next
  }

  /** 读取宿主快照。 */
  async function loadSnapshot(): Promise<void> {
    const next = await run((api) => api.snapshot())
    if (next) applySnapshot(next)
  }

  /** 用最近一次快照重建连接草稿。 */
  function resetDraft(): void {
    const current = snapshot.value
    const profile = current?.profiles.find((item) => item.id === current.activeProfileId)
    draft.profileId = profile?.id ?? ''
    draft.name = profile?.name ?? ''
    draft.baseUrl = current?.connection?.baseUrl ?? ''
    draft.headers = JSON.stringify(current?.connection?.headers ?? {}, null, 2)
    draft.protocol = current?.connection?.protocol ?? PROVIDER_API_PROTOCOLS[0]
    draft.apiKey = ''
  }

  /**
   * 现拉远端模型目录。
   *
   * 没有连接或凭据时不发请求，直接清空目录——没有可读的远端数据。
   */
  async function refreshCatalog(): Promise<void> {
    const current = snapshot.value
    const profileId = current?.activeProfileId
    if (!admin || !profileId || !current?.credentialPresent) {
      catalog.value = null
      return
    }
    catalogLoading.value = true
    error.value = null
    try {
      catalog.value = await admin.refreshCatalog(profileId)
    } catch (caught) {
      error.value = toAgentErrorView(caught)
      catalog.value = null
    } finally {
      catalogLoading.value = false
    }
  }

  /** 读取宿主工具状态并初始化调试参数草稿。 */
  async function loadTools(): Promise<void> {
    if (!toolAdmin) return
    try {
      const next = await toolAdmin.listTools()
      tools.value = next
      for (const tool of next) toolInputs.value[tool.name] ??= '{\n  \n}'
    } catch (caught) {
      error.value = toAgentErrorView(caught)
    }
  }

  /** 读取一次宿主快照；不打开弹窗、不访问远端。 */
  async function load(): Promise<void> {
    await loadSnapshot()
  }

  /** 打开设置：读取快照、现拉目录并载入工具。 */
  async function show(): Promise<void> {
    open.value = true
    error.value = null
    profileNameError.value = null
    await loadSnapshot()
    resetDraft()
    await loadTools()
    await refreshCatalog()
  }

  /** 关闭弹窗并清除只应存在于内存中的凭据草稿。 */
  function close(): void {
    open.value = false
    draft.apiKey = ''
    exaApiKey.value = ''
    error.value = null
    profileNameError.value = null
  }

  /** 更新协议草稿；非法值忽略。 */
  function setProtocol(value: string): void {
    const protocol = PROVIDER_API_PROTOCOLS.find((candidate) => candidate === value)
    if (protocol) draft.protocol = protocol
  }

  /** 解析附加请求头草稿；非法输入直接落到可见错误。 */
  function parseHeaders(): Record<string, string> | undefined {
    let value: unknown
    try {
      value = JSON.parse(draft.headers)
    } catch {
      error.value = {
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
          MANAGED_HEADERS.includes(name.toLowerCase()),
      )
    ) {
      error.value = {
        code: 'INVALID_PAYLOAD',
        message:
          'Additional headers must have string values and cannot override authentication or protocol headers.',
        retryable: false,
      }
      return undefined
    }
    return value as Record<string, string>
  }

  /** 保存连接；成功后重建草稿并现拉目录。 */
  async function saveConnection(): Promise<boolean> {
    if (!draft.profileId) return false
    const headers = parseHeaders()
    if (!headers) return false
    const apiKey = draft.apiKey.trim()
    const saved = await write((api) =>
      api.saveConnection({
        profileId: draft.profileId,
        baseUrl: draft.baseUrl,
        headers,
        protocol: draft.protocol,
        ...(apiKey ? { apiKey } : {}),
      }),
    )
    if (!saved) return false
    resetDraft()
    await refreshCatalog()
    return true
  }

  /** 切换激活配置并现拉它的目录。 */
  async function selectProfile(profileId: string): Promise<void> {
    if (profileId === snapshot.value?.activeProfileId) return
    const next = await write((api) => api.selectProfile(profileId))
    if (!next) return
    resetDraft()
    await refreshCatalog()
  }

  /** 新建并激活配置。 */
  async function createProfile(name: string): Promise<boolean> {
    profileNameError.value = null
    const next = await write((api) => api.createProfile(name))
    if (!next) {
      profileNameError.value = error.value
      error.value = null
      return false
    }
    resetDraft()
    await refreshCatalog()
    return true
  }

  /** 重命名配置。 */
  async function renameProfile(profileId: string, name: string): Promise<boolean> {
    profileNameError.value = null
    const next = await write((api) => api.renameProfile(profileId, name))
    if (!next) {
      profileNameError.value = error.value
      error.value = null
      return false
    }
    resetDraft()
    return true
  }

  /** 删除配置及其凭据与模型池。 */
  async function deleteProfile(profileId: string): Promise<boolean> {
    const next = await write((api) => api.deleteProfile(profileId))
    if (!next) return false
    resetDraft()
    await refreshCatalog()
    return true
  }

  /** 清除配置命名的校验错误。 */
  function clearProfileNameError(): void {
    profileNameError.value = null
  }

  /** 把模型加入模型池。 */
  async function addModel(model: ProviderModelView): Promise<void> {
    const profileId = snapshot.value?.activeProfileId
    if (!profileId) return
    await write((api) => api.addModel(profileId, model))
  }

  /** 从模型池移除模型。 */
  async function removeModel(modelId: string): Promise<void> {
    const profileId = snapshot.value?.activeProfileId
    if (!profileId) return
    await write((api) => api.removeModel(profileId, modelId))
  }

  /** 选择运行使用的模型。 */
  async function selectModel(modelId: string): Promise<void> {
    const profileId = snapshot.value?.activeProfileId
    if (!profileId) return
    await write((api) => api.selectModel(profileId, modelId))
  }

  /** 设置思考强度；超出模型声明范围的取值忽略。 */
  async function setReasoningEffort(effort: string | undefined): Promise<void> {
    const profileId = snapshot.value?.activeProfileId
    if (!profileId) return
    const value: ProviderReasoningEffort | undefined =
      effort === undefined
        ? undefined
        : PROVIDER_REASONING_EFFORTS.find((candidate) => candidate === effort)
    if (effort !== undefined && value === undefined) return
    await write((api) => api.setReasoningEffort(profileId, value))
  }

  /** 保存全局 Web Search 凭据；空值表示清除。 */
  async function saveExaKey(): Promise<void> {
    const apiKey = exaApiKey.value.trim()
    const next = await write((api) => api.saveExaKey(apiKey))
    if (next) exaApiKey.value = ''
  }

  /** 更新工具启用状态并刷新工具表。 */
  async function setToolEnabled(name: string, enabled: boolean): Promise<void> {
    if (!toolAdmin) return
    error.value = null
    try {
      await toolAdmin.setToolEnabled(name, enabled)
      await loadTools()
    } catch (caught) {
      error.value = toAgentErrorView(caught)
    }
  }

  /** 保存工具调试参数草稿。 */
  function setToolInput(name: string, input: string): void {
    toolInputs.value = { ...toolInputs.value, [name]: input }
  }

  /** 执行一次工具调试，并保留最近一次结果或错误。 */
  async function debugTool(name: string): Promise<void> {
    if (!toolAdmin || runningToolName.value) return
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
      const result = await toolAdmin.debugTool(name, input)
      toolResults.value = { ...toolResults.value, [name]: result }
    } catch (caught) {
      toolErrors.value = { ...toolErrors.value, [name]: toAgentErrorView(caught).message }
    } finally {
      runningToolName.value = null
    }
  }

  return {
    open,
    snapshot,
    catalog,
    catalogLoading,
    error,
    profileNameError,
    draft,
    profiles,
    models,
    poolIds,
    ready,
    tools,
    toolInputs,
    toolResults,
    toolErrors,
    runningToolName,
    exaApiKey,
    bindAdmin,
    load,
    show,
    close,
    setProtocol,
    saveConnection,
    refreshCatalog,
    selectProfile,
    createProfile,
    renameProfile,
    deleteProfile,
    clearProfileNameError,
    addModel,
    removeModel,
    selectModel,
    setReasoningEffort,
    saveExaKey,
    setToolEnabled,
    setToolInput,
    debugTool,
  }
}

/** 管理单个 Agent Workspace 的 Provider 设置；返回类型受公共契约约束。 */
export const useAgentProviderSettingsStore: (pinia?: Pinia) => AgentProviderSettingsStore =
  defineStore('agent-provider-settings', setupAgentProviderSettingsStore)
