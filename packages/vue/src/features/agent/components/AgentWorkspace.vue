<template>
  <section ref="workspace" class="agent-workspace" aria-label="Agent Alpha">
    <AgentHeader
      :sessions="state.sessions"
      :active-session-id="state.activeSessionId"
      :provider="state.provider"
      :context="state.context"
      :locale="locale"
      @create="createSession"
      @select="selectSession"
      @rename="renameSession"
      @delete="deleteSession"
      @settings="settingsOpen = true"
      @close="$emit('close')"
      @toggle-locale="toggleLocale"
    />

    <AgentTimeline
      :messages="state.messages"
      :tool-calls="state.toolCalls"
      :confirmations="state.confirmations"
      :run="state.run"
      :error="state.error"
      :can-undo="state.canUndoTurn"
      :locale="locale"
      @prompt="draft = $event"
      @confirm="confirmTool"
      @retry="retry"
      @undo="undoTurn"
    />

    <AgentContextBar :context="state.context" :locale="locale" @read-only="setReadOnly" />
    <AgentComposer
      v-model:draft="draft"
      :running="isRunning"
      :locale="locale"
      @send="send"
      @stop="stop"
    />

    <p class="sr-only" aria-live="polite" aria-atomic="true">{{ liveAnnouncement }}</p>

    <AgentSettingsDialog
      :open="settingsOpen"
      :status="state.provider"
      :locale="locale"
      @close="settingsOpen = false"
      @test="testProvider"
      @delete="deleteProvider"
    />
  </section>
</template>

<script setup lang="ts">
  import { nextTick, onUnmounted, ref, watch } from 'vue'

  import { useAgentWorkspace } from '../use-agent-workspace'

  import AgentComposer from './AgentComposer.vue'
  import AgentContextBar from './AgentContextBar.vue'
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
    draft,
    settingsOpen,
    locale,
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
    testProvider,
    deleteProvider,
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
    --agent-bg: #f4f6f7;
    --agent-surface: #ffffff;
    --agent-card: #fbfcfc;
    --agent-input: #ffffff;
    --agent-hover: #edf1f2;
    --agent-user-message: #e7f2ef;
    --agent-border: #dce1e3;
    --agent-border-strong: #b9c1c5;
    --agent-text: #182126;
    --agent-text-soft: #829097;
    --agent-muted: #607078;
    --agent-accent: #176f68;
    --agent-accent-strong: #115b55;
    --agent-focus: #278e86;
    --agent-warning-bg: #fff8e8;
    --agent-danger-bg: #fff1f1;

    height: 100%;
    min-width: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto auto;
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

  @media (prefers-color-scheme: dark) {
    .agent-workspace {
      --agent-bg: #151a1d;
      --agent-surface: #1b2125;
      --agent-card: #20272b;
      --agent-input: #232b30;
      --agent-hover: #2a3338;
      --agent-user-message: #17312e;
      --agent-border: #323c41;
      --agent-border-strong: #526169;
      --agent-text: #edf2f3;
      --agent-text-soft: #839198;
      --agent-muted: #a4b0b5;
      --agent-accent: #2d948a;
      --agent-accent-strong: #247c74;
      --agent-focus: #48b0a6;
      --agent-warning-bg: #302717;
      --agent-danger-bg: #351d1f;
    }
  }
</style>
