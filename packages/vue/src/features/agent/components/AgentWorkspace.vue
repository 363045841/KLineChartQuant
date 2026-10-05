<template>
  <section ref="workspace" class="agent-workspace" :aria-label="text.agent">
    <AgentHeader
      :locale="locale"
      :sessions-open="sessionDrawerOpen"
      @create="handleCreateSession"
      @toggle-sessions="sessionDrawerOpen = !sessionDrawerOpen"
      @settings="providerSettings.show(state.provider)"
      @close="handleClosePanel"
    />

    <AgentSessionDrawer
      :show="sessionDrawerOpen"
      :sessions="state.sessions"
      :active-session-id="state.activeSessionId"
      :locale="locale"
      @close="sessionDrawerOpen = false"
      @create="handleCreateSession"
      @select="handleSelectSession"
      @rename="renameSession"
      @delete="deleteSession"
    />

    <AgentTimeline
      :messages="state.messages"
      :tool-calls="state.toolCalls"
      :confirmations="state.confirmations"
      :questions="state.questions"
      :run="state.run"
      :runs="[...state.previousRuns, state.run]"
      :error="state.error"
      :can-undo="state.canUndoTurn"
      :collapse-reasoning="collapseReasoning"
      :locale="locale"
      @prompt="draft = $event"
      @confirm="confirmTool"
      @answer="answerQuestion"
      @retry="retry"
      @undo="undoTurn"
    />

    <AgentContextInjectionCard :context-items="contextItems" :locale="locale" />
    <AgentContextBar
      :context-items="contextItems"
      :locale="locale"
      :read-only="readOnly"
      @read-only="setReadOnly"
    />
    <AgentComposer
      v-model:draft="draft"
      :running="isRunning"
      :provider="state.provider"
      :models="models"
      :models-loading="modelsLoading"
      :usage="state.run.usage"
      :locale="locale"
      @send="send"
      @stop="stop"
      @model="setModel"
      @models-open="loadModels"
      @reasoning-effort="setReasoningEffort"
    />

    <p class="sr-only" aria-live="polite" aria-atomic="true">{{ liveAnnouncement }}</p>

    <AgentSettingsDialog
      v-model:locale="locale"
      v-model:collapse-reasoning="collapseReasoning"
      :provider-settings="providerSettings"
      :status="state.provider"
    />
  </section>
</template>

<script setup lang="ts">
  import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
  import type { AgentBridgeClient } from '../agent-contracts.js'
  import { getAgentCopy } from '../agent-copy.js'
  import { useAgentWorkspace } from '../workspace/impl/use-agent-workspace.js'
  import AgentComposer from './AgentComposer.vue'
  import AgentContextBar from './AgentContextBar.vue'
  import AgentContextInjectionCard from './AgentContextInjectionCard.vue'
  import AgentHeader from './AgentHeader.vue'
  import AgentSessionDrawer from './AgentSessionDrawer.vue'
  import AgentSettingsDialog from './AgentSettingsDialog.vue'
  import AgentTimeline from './AgentTimeline.vue'

  const props = defineProps<{ bridge: AgentBridgeClient }>()
  const emit = defineEmits<{ close: [] }>()

  const workspace = ref<HTMLElement | null>(null)
  const sessionDrawerOpen = ref(false)
  const liveAnnouncement = ref('')
  let announcementTimer: ReturnType<typeof setTimeout> | undefined

  const {
    state,
    contextItems,
    draft,
    providerSettings,
    locale,
    readOnly,
    collapseReasoning,
    models,
    modelsLoading,
    isRunning,
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
    setModel,
    loadModels,
    setReasoningEffort,
  } = useAgentWorkspace(props.bridge)

  const text = computed(() => getAgentCopy(locale.value))

  // 新建会话后收起抽屉，让新对话立即可见。
  async function handleCreateSession(): Promise<void> {
    await createSession()
    sessionDrawerOpen.value = false
  }

  // 选中会话后收起抽屉。
  async function handleSelectSession(sessionId: string): Promise<void> {
    await selectSession(sessionId)
    sessionDrawerOpen.value = false
  }

  // 关闭面板前先收起抽屉，避免再次打开时残留旧的抽屉状态。
  function handleClosePanel(): void {
    sessionDrawerOpen.value = false
    emit('close')
  }

  function focusTarget(selector: string): void {
    void nextTick(() => workspace.value?.querySelector<HTMLElement>(selector)?.focus())
  }

  watch(
    () => state.value.announcement,
    (announcement) => {
      if (!announcement) return
      if (announcementTimer) clearTimeout(announcementTimer)
      announcementTimer = setTimeout(() => {
        liveAnnouncement.value = announcement
        announcementTimer = undefined
      }, 180)
    },
  )

  watch(
    () => state.value.confirmations.at(-1)?.status,
    (status) => {
      if (status === 'pending') focusTarget('[data-focus="confirmation"] button')
    },
  )

  watch(
    () => state.value.questions.at(-1)?.status,
    (status) => {
      if (status === 'pending') focusTarget('[data-focus="question"] button')
    },
  )

  watch(
    () => state.value.error,
    (error) => {
      if (error) focusTarget('[data-focus="error"]')
    },
  )

  watch(
    () => state.value.run.status,
    (status) => {
      if (['completed', 'cancelled', 'partial'].includes(status)) {
        focusTarget('[data-focus="completion"]')
      }
    },
  )

  onUnmounted(() => {
    if (announcementTimer) clearTimeout(announcementTimer)
  })
</script>

<style scoped>
  .agent-workspace {
    --agent-bg: var(--klc-color-ui-background);
    --agent-surface: var(--klc-color-ui-surface);
    --agent-card: var(--klc-color-ui-card);
    --agent-control: var(--klc-color-ui-control-background);
    --agent-input: var(--klc-color-ui-input);
    --agent-hover: var(--klc-color-ui-hover);
    --agent-user-message: var(--klc-color-agent-user-message);
    --agent-border: var(--klc-color-ui-border);
    --agent-border-strong: var(--klc-color-ui-border-strong);
    --agent-text: var(--klc-color-ui-text);
    --agent-text-soft: var(--klc-color-ui-text-soft);
    --agent-muted: var(--klc-color-ui-muted);
    --agent-accent: var(--klc-color-ui-accent);
    --agent-accent-strong: var(--klc-color-ui-accent-strong);
    --agent-focus: var(--klc-color-ui-focus);
    --agent-warning-bg: var(--klc-color-ui-warning-background);
    --agent-danger-bg: var(--klc-color-ui-danger-background);

    height: 100%;
    min-width: 0;
    position: relative;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto auto auto;
    overflow: hidden;
    color: var(--agent-text);
    background: var(--agent-bg);
    font-family: var(--klc-typography-font-family);
    letter-spacing: 0;
  }

  .agent-workspace :deep(button:focus-visible),
  .agent-workspace :deep(select:focus-visible) {
    outline: 2px solid var(--agent-focus);
    outline-offset: 1px;
  }

  .sr-only {
    width: 1px;
    height: 1px;
    position: absolute;
    overflow: hidden;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
