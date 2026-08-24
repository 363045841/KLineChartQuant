/** Connect the stable bridge, event reducer, and Vue interaction state. */
import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue'

import { createInitialAgentState, reduceAgentUiEvent } from './agent-reducer'

import type { AgentBridgeClient, ProviderTestInput } from './agent-contracts'

export function useAgentWorkspace(bridge: AgentBridgeClient) {
  const state = shallowRef(createInitialAgentState())
  const draft = ref('')
  const settingsOpen = ref(false)
  const locale = ref<'en' | 'zh-CN'>(
    typeof navigator !== 'undefined' && navigator.language.startsWith('zh') ? 'zh-CN' : 'en',
  )
  let unsubscribe: (() => void) | undefined

  const activeSession = computed(() =>
    state.value.sessions.find((session) => session.id === state.value.activeSessionId),
  )
  const isRunning = computed(() => ['running', 'cancelling'].includes(state.value.run.status))
  const providerReady = computed(() => state.value.provider.state === 'connected')

  function project(event: Parameters<typeof reduceAgentUiEvent>[1]): void {
    state.value = reduceAgentUiEvent(state.value, event)
  }

  async function initialize(): Promise<void> {
    unsubscribe = bridge.subscribe(project)
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
  }

  async function createSession(): Promise<void> {
    const session = await bridge.createSession()
    state.value = { ...state.value, activeSessionId: session.id }
  }

  function selectSession(sessionId: string): void {
    if (state.value.sessions.some((session) => session.id === sessionId)) {
      state.value = { ...state.value, activeSessionId: sessionId }
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
    await bridge.testProvider(input)
    settingsOpen.value = false
  }

  async function deleteProvider(): Promise<void> {
    await bridge.deleteProviderCredential()
  }

  onMounted(initialize)
  onUnmounted(() => unsubscribe?.())

  return {
    state,
    draft,
    settingsOpen,
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
    testProvider,
    deleteProvider,
  }
}
