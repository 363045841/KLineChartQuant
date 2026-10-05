// 订阅官方会话的完整快照，Vue 只维护输入、偏好与交互状态。

import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import type {
  AgentBridgeClient,
  AgentContextItem,
  AgentWorkspaceEvent,
  ProviderModelView,
  ProviderReasoningEffort,
  QuestionAnswerView,
} from '../../agent-contracts.js'
import {
  createAgentProviderSettingsPinia,
  useAgentProviderSettingsStore,
} from '../../browser-agent/provider-settings/impl/agent-provider-settings-store.js'
import {
  agentWorkspacePreferencesPersistence,
  defaultAgentWorkspacePreferences,
} from './agent-workspace-preferences.js'
import { createWorkspaceState, displayConversation } from './workspace-state.js'

/** 组装 Agent 工作区的响应式状态与操作，并挂载 Bridge 事件订阅。 */
export function useAgentWorkspace(bridge: AgentBridgeClient) {
  const preferences =
    agentWorkspacePreferencesPersistence.load() ?? defaultAgentWorkspacePreferences()
  const state = shallowRef(createWorkspaceState())
  // UI 与模型请求共享 Bridge 从 Core 投影的同一份上下文项。
  const contextItems = shallowRef<ReadonlyArray<AgentContextItem>>(bridge.getContextItems())
  const draft = ref('')
  const readOnly = ref(preferences.readOnly)
  const collapseReasoning = ref(preferences.collapseReasoning)
  const models = shallowRef<readonly ProviderModelView[]>([])
  const modelsLoading = ref(false)
  const providerSettings = useAgentProviderSettingsStore(createAgentProviderSettingsPinia())
  providerSettings.bindBridge(bridge)
  const locale = ref<'en' | 'zh-CN'>(preferences.locale)
  let unsubscribe: (() => void) | undefined
  let unsubscribeContextItems: (() => void) | undefined
  let selectionGeneration = 0
  let snapshotDelivery = 0
  let modelLoadGeneration = 0

  const isRunning = computed(() => ['running', 'cancelling'].includes(state.value.run.status))
  const providerReady = computed(
    () => state.value.provider.state === 'connected' && Boolean(state.value.provider.modelId),
  )

  function project(event: AgentWorkspaceEvent): void {
    if (event.type === 'session.snapshot') {
      if (event.snapshot.session.id === state.value.activeSessionId) {
        snapshotDelivery++
        state.value = displayConversation(state.value, event.snapshot)
      }
    } else if (event.type === 'sessions.changed') {
      state.value = { ...state.value, sessions: event.sessions }
    } else if (event.type === 'provider.status.changed') {
      state.value = { ...state.value, provider: event.status }
    } else if ('sessionId' in event && event.sessionId === state.value.activeSessionId) {
      // 提问是宿主交互，不是模型流式状态；由 Bridge 管理待答 Promise。
      if (event.type === 'tool.question.required')
        state.value = { ...state.value, questions: [...state.value.questions, event.request] }
      if (event.type === 'tool.question.resolved')
        state.value = {
          ...state.value,
          questions: state.value.questions.map((question) =>
            question.id === event.questionId
              ? { ...question, status: event.status, answer: event.answer }
              : question,
          ),
        }
    }
  }

  async function openSession(sessionId: string): Promise<void> {
    const selection = ++selectionGeneration
    const delivered = snapshotDelivery
    if (state.value.activeSessionId !== sessionId) {
      state.value = {
        ...state.value,
        activeSessionId: sessionId,
        messages: [],
        toolCalls: [],
        questions: [],
        confirmations: [],
        run: { id: null, sessionId, status: 'idle' },
        previousRuns: [],
        error: null,
        canUndoTurn: false,
      }
    }
    const snapshot = await bridge.openSession(sessionId)
    // 异步切换只接受最新选择；加载期间收到的官方新快照不能被较早读取覆盖。
    if (selection === selectionGeneration && delivered === snapshotDelivery)
      state.value = displayConversation(state.value, snapshot)
  }

  async function initialize(): Promise<void> {
    unsubscribe = bridge.subscribe(project)
    unsubscribeContextItems = bridge.subscribeContextItems((items) => {
      contextItems.value = items
    })
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
  }

  async function createSession(): Promise<void> {
    const session = await bridge.createSession()
    await openSession(session.id)
  }

  async function selectSession(sessionId: string): Promise<void> {
    if (state.value.sessions.some((session) => session.id === sessionId)) {
      await openSession(sessionId)
    }
  }

  // 重命名指定会话；标题为空时忽略。
  async function renameSession(sessionId: string, title: string): Promise<void> {
    const nextTitle = title.trim()
    if (!nextTitle) return
    await bridge.renameSession(sessionId, nextTitle)
  }

  // 删除指定会话；仅当删除的是活动会话时才切换或重置工作区。
  async function deleteSession(sessionId: string): Promise<void> {
    await bridge.deleteSession(sessionId)
    const sessions = state.value.sessions.filter((session) => session.id !== sessionId)
    if (state.value.activeSessionId !== sessionId) {
      state.value = { ...state.value, sessions }
      return
    }
    const nextSessionId = sessions[0]?.id ?? null
    if (nextSessionId) {
      state.value = { ...state.value, sessions }
      await openSession(nextSessionId)
      return
    }
    state.value = { ...createWorkspaceState(), provider: state.value.provider }
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
    await bridge.startRun({
      sessionId,
      prompt,
      readOnly: readOnly.value,
    })
  }

  async function stop(): Promise<void> {
    if (state.value.run.id) await bridge.cancelRun(state.value.run.id)
  }

  async function retry(runId = state.value.run.id): Promise<void> {
    if (runId && !isRunning.value) await bridge.retryRun(runId)
  }

  async function confirmTool(
    confirmationId: string,
    decision: 'confirmed' | 'rejected',
  ): Promise<void> {
    await bridge.confirmTool(confirmationId, decision)
  }

  async function answerQuestion(questionId: string, answer: QuestionAnswerView): Promise<void> {
    await bridge.answerQuestion(questionId, answer)
  }

  async function undoTurn(): Promise<void> {
    if (state.value.run.id) await bridge.undoTurn(state.value.run.id)
  }

  function setReadOnly(value: boolean): void {
    readOnly.value = value
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
  watch([locale, readOnly, collapseReasoning], () => {
    agentWorkspacePreferencesPersistence.schedule(() => ({
      locale: locale.value,
      readOnly: readOnly.value,
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
    contextItems,
    draft,
    readOnly,
    models,
    modelsLoading,
    providerSettings,
    locale,
    isRunning,
    providerReady,
    collapseReasoning,
    createSession,
    selectSession,
    renameSession,
    deleteSession,
    send,
    stop,
    retry,
    confirmTool,
    answerQuestion,
    undoTurn,
    setReadOnly,
    loadModels,
    setModel,
    setReasoningEffort,
  }
}
