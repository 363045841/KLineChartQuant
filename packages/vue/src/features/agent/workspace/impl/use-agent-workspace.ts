// 组装 Agent 工作区：订阅官方会话读取结果，只维护输入、偏好与宿主提问。
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import type {
  AgentBridgeClient,
  AgentContextItem,
  AgentErrorView,
  AgentRunMode,
  AgentTranscriptView,
  AgentUsageView,
  AgentWorkspaceEvent,
  EntryId,
  ProviderModelView,
  ProviderReasoningEffort,
  QuestionAnswerView,
} from '../../agent-contracts.js'
import { getAgentCopy } from '../../agent-copy.js'
import { toAgentErrorView } from '../../agent-error-view.js'
import {
  createAgentProviderSettingsPinia,
  useAgentProviderSettingsStore,
} from '../../browser-agent/provider-settings/impl/agent-provider-settings-store.js'
import type { AgentWorkspaceAvailability } from '../types.js'
import {
  isRunActive,
  readLiveAnswer,
  readLiveTools,
  readRunFailure,
  readUsage,
} from './agent-live.js'
import {
  agentWorkspacePreferencesPersistence,
  defaultAgentWorkspacePreferences,
} from './agent-workspace-preferences.js'
import {
  activateSession,
  addQuestion,
  applyTranscript,
  clearTranscript,
  createWorkspaceState,
  settleQuestion,
} from './workspace-state.js'

/** 工作区无法启动且错误形状不可识别时的兜底视图。 */
const WORKSPACE_UNAVAILABLE_FALLBACK = {
  code: 'INTERNAL_ERROR',
  message: 'The Agent workspace could not start.',
  retryable: true,
} as const

/** 组装 Agent 工作区的响应式状态与操作，并挂载 Bridge 事件订阅。 */
export function useAgentWorkspace(bridge: AgentBridgeClient) {
  const preferences =
    agentWorkspacePreferencesPersistence.load() ?? defaultAgentWorkspacePreferences()
  const state = shallowRef(createWorkspaceState())
  // 运行时可用性与单次运行错误分离：不可用时展示独立视图而不是时间线错误。
  const availability = ref<AgentWorkspaceAvailability>({ status: 'initializing' })
  // UI 与模型请求共享 Bridge 从 Core 投影的同一份上下文项。
  const contextItems = shallowRef<ReadonlyArray<AgentContextItem>>(bridge.getContextItems())
  const draft = ref('')
  const submitting = ref(false)
  const mode = ref<AgentRunMode>(preferences.mode)
  const collapseReasoning = ref(preferences.collapseReasoning)
  const models = shallowRef<readonly ProviderModelView[]>([])
  const modelsLoading = ref(false)
  const providerSettings = useAgentProviderSettingsStore(createAgentProviderSettingsPinia())
  providerSettings.bindBridge(bridge)
  const locale = ref<'en' | 'zh-CN'>(preferences.locale)
  let unsubscribe: (() => void) | undefined
  let unsubscribeContextItems: (() => void) | undefined
  let selectionGeneration = 0
  let modelLoadGeneration = 0

  const docs = computed(() => state.value.transcript?.docs ?? {})
  const isRunning = computed(() => submitting.value || isRunActive(docs.value))
  const liveAnswer = computed(() => readLiveAnswer(docs.value))
  const liveTools = computed(() => readLiveTools(docs.value))
  const runError = computed<AgentErrorView | null>(() => readRunFailure(docs.value) ?? null)
  const usage = computed<AgentUsageView | undefined>(() => readUsage(docs.value))
  const providerReady = computed(
    () => state.value.provider.state === 'connected' && Boolean(state.value.provider.modelId),
  )

  /** 处理 Bridge 事件：只接收会话读取结果与宿主交互。 */
  function project(event: AgentWorkspaceEvent): void {
    if (event.type === 'session.changed') {
      if (event.sessionId === state.value.activeSessionId) {
        state.value = applyTranscript(state.value, event.transcript)
      }
      return
    }
    if (event.type === 'session.closed') {
      if (event.sessionId === state.value.activeSessionId) {
        state.value = clearTranscript(state.value)
      }
      return
    }
    if (event.type === 'sessions.changed') {
      state.value = { ...state.value, sessions: event.sessions }
      return
    }
    if (event.type === 'provider.status.changed') {
      state.value = { ...state.value, provider: event.status }
      return
    }
    if (event.sessionId !== state.value.activeSessionId) return
    if (event.type === 'tool.question.required') {
      state.value = addQuestion(state.value, event.request)
      return
    }
    state.value = settleQuestion(state.value, event)
  }

  /** 打开会话；只接受最后一次选择的结果。 */
  async function openSession(sessionId: string): Promise<void> {
    const selection = ++selectionGeneration
    state.value = activateSession(state.value, sessionId)
    const transcript = await bridge.openSession(sessionId)
    if (selection === selectionGeneration) {
      state.value = applyTranscript(state.value, transcript)
    }
  }

  async function initialize(): Promise<void> {
    subscribeBridge()
    availability.value = { status: 'initializing' }
    try {
      const [sessions, provider] = await Promise.all([
        bridge.listSessions(),
        bridge.getProviderStatus(),
      ])
      state.value = {
        ...state.value,
        sessions,
        activeSessionId: state.value.activeSessionId ?? sessions[0]?.id ?? null,
        provider,
      }
      const sessionId = state.value.activeSessionId
      if (sessionId) await openSession(sessionId)
      availability.value = { status: 'ready' }
    } catch (error) {
      availability.value = {
        status: 'unavailable',
        error: toAgentErrorView(error, WORKSPACE_UNAVAILABLE_FALLBACK),
      }
    }
  }

  /** 仅首次初始化时订阅桥接事件，重试不会叠加订阅。 */
  function subscribeBridge(): void {
    unsubscribe ??= bridge.subscribe(project)
    unsubscribeContextItems ??= bridge.subscribeContextItems((items) => {
      contextItems.value = items
    })
  }

  /** 运行时不可用时重试初始化；成功后工作区恢复可用。 */
  async function retryInitialize(): Promise<void> {
    if (availability.value.status === 'initializing') return
    await initialize()
  }

  async function createSession(): Promise<void> {
    const session = await bridge.createSession()
    await openSession(session.id)
  }

  async function selectSession(sessionId: string): Promise<void> {
    if (sessionId === state.value.activeSessionId) return
    await openSession(sessionId)
  }

  /** 重命名指定会话；标题为空时忽略。 */
  async function renameSession(sessionId: string, title: string): Promise<void> {
    const nextTitle = title.trim()
    if (!nextTitle) return
    await bridge.renameSession(sessionId, nextTitle)
  }

  /** 删除指定会话；活动会话被删除时切换或重置工作区。 */
  async function deleteSession(sessionId: string): Promise<void> {
    await bridge.deleteSession(sessionId)
    const sessions = state.value.sessions.filter((session) => session.id !== sessionId)
    if (state.value.activeSessionId !== sessionId) {
      state.value = { ...state.value, sessions }
      return
    }
    const nextSessionId = sessions[0]?.id ?? null
    state.value = { ...state.value, sessions }
    if (nextSessionId) {
      await openSession(nextSessionId)
      return
    }
    state.value = { ...createWorkspaceState(), sessions, provider: state.value.provider }
  }

  async function send(): Promise<void> {
    const prompt = draft.value.trim()
    if (!prompt || isRunning.value) return
    if (!providerReady.value) {
      void providerSettings.show(state.value.provider)
      return
    }
    let sessionId = state.value.activeSessionId
    if (!sessionId) {
      const session = await bridge.createSession()
      sessionId = session.id
      await openSession(sessionId)
    }
    draft.value = ''
    await submitRun(() => bridge.startRun({ sessionId, prompt, mode: mode.value }))
  }

  async function stop(): Promise<void> {
    const sessionId = state.value.activeSessionId
    if (sessionId) await bridge.cancelRun(sessionId)
  }

  /** 重新生成：Bridge 会在该输入之前创建分支并返回新的会话标识。 */
  async function retry(entryId: EntryId): Promise<void> {
    const sessionId = state.value.activeSessionId
    if (!sessionId || isRunning.value) return
    const started = await submitRun(() => bridge.retryRun({ sessionId, entryId, mode: mode.value }))
    await openSession(started.sessionId)
  }

  /** 编辑重发：只接受当前读取结果中的用户条目。 */
  async function editMessage(entryId: EntryId, prompt: string): Promise<void> {
    const sessionId = state.value.activeSessionId
    if (!sessionId) throw new Error(getAgentCopy(locale.value).editUnavailable)
    if (isRunning.value) throw new Error(getAgentCopy(locale.value).editBusy)
    const started = await submitRun(() =>
      bridge.editMessage({ sessionId, entryId, prompt, mode: mode.value }),
    )
    await openSession(started.sessionId)
  }

  /** 加载更早的一页条目。 */
  async function loadEarlier(): Promise<void> {
    const sessionId = state.value.activeSessionId
    if (!sessionId) return
    state.value = applyTranscript(state.value, await bridge.loadEarlier(sessionId))
  }

  /** 补齐条目流中的缺失区间。 */
  async function fillGap(after: EntryId, upTo: EntryId): Promise<void> {
    const sessionId = state.value.activeSessionId
    if (!sessionId) return
    state.value = applyTranscript(state.value, await bridge.fillGap(sessionId, after, upTo))
  }

  /** 在官方读取结果到达前锁住提交入口，消除准备阶段的重复点击窗口。 */
  async function submitRun<T>(action: () => Promise<T>): Promise<T> {
    submitting.value = true
    try {
      return await action()
    } finally {
      submitting.value = false
    }
  }

  async function answerQuestion(questionId: string, answer: QuestionAnswerView): Promise<void> {
    await bridge.answerQuestion(questionId, answer)
  }

  /** 用户放弃这次提问；模型收到「用户未作答」。 */
  async function cancelQuestion(questionId: string): Promise<void> {
    await bridge.cancelQuestion(questionId)
  }

  function setMode(value: AgentRunMode): void {
    mode.value = value
  }

  /** 加载当前 Provider 在统一模型池中已加入的模型。 */
  async function loadModels(): Promise<void> {
    if (!state.value.provider.configured) return
    const generation = ++modelLoadGeneration
    modelsLoading.value = true
    try {
      const nextModels = await bridge.listProviderModelPool()
      if (generation === modelLoadGeneration) models.value = nextModels
    } catch {
      if (generation === modelLoadGeneration) models.value = []
    } finally {
      if (generation === modelLoadGeneration) modelsLoading.value = false
    }
  }

  /** 保存 Composer 中选择的模型，使后续运行使用其能力配置。 */
  async function setModel(id: string): Promise<void> {
    if (isRunning.value) return
    if (models.value.some((item) => item.id === id)) await bridge.setProviderModel(id)
  }

  /** 保存当前 Profile 的思考强度。 */
  async function setReasoningEffort(value: string): Promise<void> {
    const efforts = state.value.provider.reasoningEfforts ?? []
    const effort = efforts.includes(value as ProviderReasoningEffort)
      ? (value as ProviderReasoningEffort)
      : undefined
    await bridge.setProviderReasoningEffort(effort)
  }

  onMounted(initialize)
  watch(
    () => state.value.provider,
    () => void loadModels(),
    { immediate: true },
  )
  watch([locale, mode, collapseReasoning], () => {
    agentWorkspacePreferencesPersistence.schedule(() => ({
      locale: locale.value,
      mode: mode.value,
      collapseReasoning: collapseReasoning.value,
    }))
  })
  onUnmounted(() => {
    selectionGeneration++
    unsubscribe?.()
    unsubscribeContextItems?.()
  })

  return {
    state,
    availability,
    contextItems,
    draft,
    mode,
    models,
    modelsLoading,
    providerSettings,
    locale,
    isRunning,
    providerReady,
    collapseReasoning,
    liveAnswer,
    liveTools,
    runError,
    usage,
    createSession,
    selectSession,
    renameSession,
    deleteSession,
    send,
    stop,
    retry,
    retryInitialize,
    editMessage,
    loadEarlier,
    fillGap,
    answerQuestion,
    cancelQuestion,
    setMode,
    loadModels,
    setModel,
    setReasoningEffort,
  }
}
