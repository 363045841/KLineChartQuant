/** Connect the stable bridge, event reducer, and Vue interaction state. */
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'

import { createInitialAgentState, reduceAgentUiEvent } from './agent-reducer'
import {
  createAgentProviderSettingsPinia,
  useAgentProviderSettingsStore,
} from './agent-provider-settings-store'

import type {
  AgentBridgeClient,
  AgentContextItem,
  AgentUiEvent,
  ProviderModelView,
  ProviderReasoningEffort,
} from './agent-contracts'

export function useAgentWorkspace(bridge: AgentBridgeClient) {
  const state = shallowRef(createInitialAgentState())
  // UI 与模型请求共享 Bridge 从 Core 投影的同一份上下文项。
  const contextItems = shallowRef<ReadonlyArray<AgentContextItem>>(bridge.getContextItems())
  const draft = ref('')
  const readOnly = ref(false)
  const models = shallowRef<readonly ProviderModelView[]>([])
  const modelsLoading = ref(false)
  const providerSettings = useAgentProviderSettingsStore(createAgentProviderSettingsPinia())
  providerSettings.bindBridge(bridge)
  const locale = ref<'en' | 'zh-CN'>(
    typeof navigator !== 'undefined' && navigator.language.startsWith('zh') ? 'zh-CN' : 'en',
  )
  let unsubscribe: (() => void) | undefined
  let unsubscribeContextItems: (() => void) | undefined
  let bufferedEvents: AgentUiEvent[] | undefined

  const activeSession = computed(() =>
    state.value.sessions.find((session) => session.id === state.value.activeSessionId),
  )
  const isRunning = computed(() => ['running', 'cancelling'].includes(state.value.run.status))
  const providerReady = computed(
    () => state.value.provider.state === 'connected' && Boolean(state.value.provider.modelId),
  )

  function project(event: AgentUiEvent): void {
    state.value = reduceAgentUiEvent(state.value, event)
  }

  function receive(event: AgentUiEvent): void {
    if (bufferedEvents) bufferedEvents.push(event)
    else project(event)
  }

  function flush(buffer: AgentUiEvent[]): void {
    if (bufferedEvents !== buffer) return
    bufferedEvents = undefined
    for (const event of buffer) project(event)
  }

  async function openSession(sessionId: string): Promise<void> {
    const ownsBuffer = bufferedEvents === undefined
    const buffer = bufferedEvents ?? []
    if (ownsBuffer) bufferedEvents = buffer
    try {
      const snapshot = await bridge.openSession(sessionId)
      const currentRun = snapshot.runs.at(-1) ?? createInitialAgentState().run
      state.value = {
        ...state.value,
        lastSequence: Math.max(state.value.lastSequence, snapshot.lastSequence),
        activeSessionId: sessionId,
        messages: snapshot.messages,
        toolCalls: snapshot.toolCalls,
        confirmations: [],
        run: currentRun,
        previousRuns: snapshot.runs.slice(0, -1),
        error: currentRun.error ?? null,
        canUndoTurn: snapshot.toolCalls.some(
          (tool) =>
            tool.runId === currentRun.id && tool.status === 'succeeded' && Boolean(tool.undoToken),
        ),
      }
    } finally {
      if (ownsBuffer) flush(buffer)
    }
  }

  async function initialize(): Promise<void> {
    const buffer: AgentUiEvent[] = []
    bufferedEvents = buffer
    unsubscribe = bridge.subscribe(receive)
    unsubscribeContextItems = bridge.subscribeContextItems((items) => {
      contextItems.value = items
    })
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
    } finally {
      flush(buffer)
    }
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

  async function renameSession(title: string): Promise<void> {
    if (!state.value.activeSessionId || !title.trim()) return
    await bridge.renameSession(state.value.activeSessionId, title.trim())
  }

  async function deleteSession(): Promise<void> {
    const sessionId = state.value.activeSessionId
    if (!sessionId) return
    await bridge.deleteSession(sessionId)
    const sessions = state.value.sessions.filter((session) => session.id !== sessionId)
    state.value = { ...state.value, sessions, activeSessionId: sessions[0]?.id ?? null }
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
      state.value = { ...state.value, activeSessionId: sessionId }
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

  async function retry(): Promise<void> {
    if (state.value.run.id) await bridge.retryRun(state.value.run.id)
  }

  async function confirmTool(
    confirmationId: string,
    decision: 'confirmed' | 'rejected',
  ): Promise<void> {
    await bridge.confirmTool(confirmationId, decision)
  }

  async function undoTurn(): Promise<void> {
    if (state.value.run.id) await bridge.undoTurn(state.value.run.id)
  }

  function setReadOnly(value: boolean): void {
    readOnly.value = value
  }

  /** 加载当前 Provider 的模型目录，配置变更时丢弃旧目录。 */
  async function loadModels(): Promise<void> {
    if (!state.value.provider.configured || modelsLoading.value) return
    modelsLoading.value = true
    try {
      models.value = (await bridge.listProviderModels()).models
    } catch {
      models.value = []
    } finally {
      modelsLoading.value = false
    }
  }

  /** 保存 Composer 中选择的模型，使后续运行使用其能力配置。 */
  async function setModel(id: string): Promise<void> {
    if (isRunning.value) return
    const model = models.value.find((item) => item.id === id)
    if (model) await bridge.setProviderModel(model)
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
    () => [
      state.value.provider.profileName,
      state.value.provider.baseUrl,
      state.value.provider.protocol,
    ],
    () => void loadModels(),
    { immediate: true },
  )
  onUnmounted(() => {
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
    activeSession,
    isRunning,
    providerReady,
    createSession,
    selectSession,
    renameSession,
    deleteSession,
    send,
    stop,
    retry,
    confirmTool,
    undoTurn,
    setReadOnly,
    loadModels,
    setModel,
    setReasoningEffort,
  }
}
