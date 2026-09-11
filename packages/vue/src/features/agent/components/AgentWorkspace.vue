<template>
  <section ref="workspace" class="agent-workspace" aria-label="Agent Alpha">
    <AgentHeader
      :sessions="state.sessions"
      :active-session-id="state.activeSessionId"
      :locale="locale"
      @create="createSession"
      @select="selectSession"
      @rename="renameSession"
      @delete="deleteSession"
      @settings="providerSettings.show(state.provider)"
      @close="$emit('close')"
      @toggle-locale="toggleLocale"
    />

    <AgentTimeline
      :messages="state.messages"
      :tool-calls="state.toolCalls"
      :confirmations="state.confirmations"
      :run="state.run"
      :runs="[...state.previousRuns, state.run]"
      :error="state.error"
      :can-undo="state.canUndoTurn"
      :locale="locale"
      @prompt="draft = $event"
      @confirm="confirmTool"
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
      :provider-settings="providerSettings"
      :status="state.provider"
      :locale="locale"
    />
  </section>
</template>

<script setup lang="ts">
  import { nextTick, onUnmounted, ref, watch } from 'vue'

  import { useAgentWorkspace } from '../use-agent-workspace'

  import AgentComposer from './AgentComposer.vue'
  import AgentContextBar from './AgentContextBar.vue'
  import AgentContextInjectionCard from './AgentContextInjectionCard.vue'
  import AgentHeader from './AgentHeader.vue'
  import AgentSettingsDialog from './AgentSettingsDialog.vue'
  import AgentTimeline from './AgentTimeline.vue'

  import type { AgentBridgeClient } from '../agent-contracts'

  const props = defineProps<{ bridge: AgentBridgeClient }>()
  defineEmits<{ close: [] }>()

  const workspace = ref<HTMLElement | null>(null)
  const liveAnnouncement = ref('')
  let announcementTimer: ReturnType<typeof setTimeout> | undefined

  const {
    state,
    contextItems,
    draft,
    providerSettings,
    locale,
    readOnly,
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
    undoTurn,
    setReadOnly,
    setModel,
    loadModels,
    setReasoningEffort,
  } = useAgentWorkspace(props.bridge)

  function toggleLocale(): void {
    locale.value = locale.value === 'en' ? 'zh-CN' : 'en'
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
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto auto auto;
    overflow: hidden;
    color: var(--agent-text);
    background: var(--agent-bg);
    font-family:
      Inter,
      ui-sans-serif,
      system-ui,
      -apple-system,
      BlinkMacSystemFont,
      'Segoe UI',
      sans-serif;
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
