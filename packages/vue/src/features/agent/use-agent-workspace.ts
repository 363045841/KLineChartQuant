/** Connect the stable bridge, event reducer, and Vue interaction state. */
import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue'

import { createInitialAgentState, reduceAgentUiEvent } from './agent-reducer'

import type {
  AgentBridgeClient,
  AgentErrorView,
  AgentUiEvent,
  ProviderModelView,
  ProviderModelsInput,
  ProviderTestInput,
  ProviderTestResult,
} from './agent-contracts'

function operationError(error: unknown): AgentErrorView {
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

export function useAgentWorkspace(bridge: AgentBridgeClient) {
  const state = shallowRef(createInitialAgentState())
  const draft = ref('')
  const settingsOpen = ref(false)
  const providerModels = ref<ProviderModelView[]>([])
  const providerModelsLoading = ref(false)
  const providerTestResult = ref<ProviderTestResult | null>(null)
  const providerOperationError = ref<AgentErrorView | null>(null)
  const locale = ref<'en' | 'zh-CN'>(
    typeof navigator !== 'undefined' && navigator.language.startsWith('zh') ? 'zh-CN' : 'en',
  )
  let unsubscribe: (() => void) | undefined
  let bufferedEvents: AgentUiEvent[] | undefined

  const activeSession = computed(() =>
    state.value.sessions.find((session) => session.id === state.value.activeSessionId),
  )
  const isRunning = computed(() => ['running', 'cancelling'].includes(state.value.run.status))
  const providerReady = computed(() => state.value.provider.state === 'connected')

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
      settingsOpen.value = true
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
      readOnly: state.value.context.readOnly,
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

  function setReadOnly(readOnly: boolean): void {
    state.value = { ...state.value, context: { ...state.value.context, readOnly } }
  }

  async function testProvider(input: ProviderTestInput): Promise<void> {
    providerOperationError.value = null
    providerTestResult.value = null
    try {
      providerTestResult.value = await bridge.testProvider(input)
    } catch (error) {
      providerOperationError.value = operationError(error)
    }
  }

  async function refreshProviderModels(input: ProviderModelsInput): Promise<void> {
    providerModelsLoading.value = true
    providerOperationError.value = null
    try {
      providerModels.value = (await bridge.listProviderModels(input)).models
    } catch (error) {
      providerOperationError.value = operationError(error)
    } finally {
      providerModelsLoading.value = false
    }
  }

  async function deleteProvider(): Promise<void> {
    try {
      await bridge.deleteProviderCredential()
      providerTestResult.value = null
      providerOperationError.value = null
    } catch (error) {
      providerOperationError.value = operationError(error)
    }
  }

  onMounted(initialize)
  onUnmounted(() => unsubscribe?.())

  return {
    state,
    draft,
    settingsOpen,
    locale,
    providerModels,
    providerModelsLoading,
    providerTestResult,
    providerOperationError,
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
    testProvider,
    refreshProviderModels,
    deleteProvider,
  }
}
