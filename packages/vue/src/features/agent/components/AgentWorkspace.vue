<template>
  <section ref="workspace" class="agent-workspace" :aria-label="text.agent">
    <AgentHeader
      :locale="locale"
      :sessions-open="sessionDrawerOpen"
      :available="available"
      :panel-side="panelSide"
      @create="handleCreateSession"
      @toggle-sessions="sessionDrawerOpen = !sessionDrawerOpen"
      @settings="providerSettings.show(state.provider)"
      @close="handleClosePanel"
    />

    <template v-if="available">
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
        :transcript="state.transcript"
        :live-answer="liveAnswer"
        :live-tools="liveTools"
        :questions="state.questions"
        :error="runError"
        :collapse-reasoning="collapseReasoning"
        :locale="locale"
        :edit-message="editMessage"
        :actions-disabled="isRunning"
        @prompt="draft = $event"
        @answer="answerQuestion"
        @cancel="cancelQuestion"
        @retry="retry"
        @retry-last="retry"
        @load-earlier="loadEarlier"
        @fill-gap="fillGap"
      />

      <AgentContextBar
        :context-items="contextItems"
        :locale="locale"
        :mode="mode"
        @mode-change="setMode"
      />
      <AgentComposer
        v-model:draft="draft"
        :running="isRunning"
        :provider="state.provider"
        :models="models"
        :models-loading="modelsLoading"
        :usage="usage"
        :locale="locale"
        @send="send"
        @stop="stop"
        @model="setModel"
        @models-open="loadModels"
        @reasoning-effort="setReasoningEffort"
      />
    </template>

    <AgentUnavailableNotice
      v-else-if="availability.status === 'unavailable'"
      :error="availability.error"
      :locale="locale"
      @retry="retryInitialize"
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
  import type { SidePanelSide } from '../../side-panel/types.js'
  import type { AgentBridgeClient } from '../agent-contracts.js'
  import { getAgentCopy } from '../agent-copy.js'
  import { useAgentWorkspace } from '../workspace/impl/use-agent-workspace.js'
  import AgentComposer from './AgentComposer.vue'
  import AgentContextBar from './AgentContextBar.vue'
  import AgentHeader from './AgentHeader.vue'
  import AgentSessionDrawer from './AgentSessionDrawer.vue'
  import AgentSettingsDialog from './AgentSettingsDialog.vue'
  import AgentTimeline from './AgentTimeline.vue'
  import AgentUnavailableNotice from './AgentUnavailableNotice.vue'

  const props = withDefaults(
    defineProps<{ bridge: AgentBridgeClient; panelSide?: SidePanelSide }>(),
    { panelSide: 'right' },
  )
  const emit = defineEmits<{ close: [] }>()

  const workspace = ref<HTMLElement | null>(null)
  const sessionDrawerOpen = ref(false)
  const liveAnnouncement = ref('')
  let announcementTimer: ReturnType<typeof setTimeout> | undefined

  const {
    state,
    availability,
    contextItems,
    draft,
    providerSettings,
    locale,
    collapseReasoning,
    models,
    modelsLoading,
    isRunning,
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
    mode,
    setMode,
    setModel,
    loadModels,
    setReasoningEffort,
  } = useAgentWorkspace(props.bridge)

  const text = computed(() => getAgentCopy(locale.value))
  const available = computed(() => availability.value.status === 'ready')

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

  // 提问卡片内联在回答里，焦点与播报按同一条待答提问推进。
  const pendingQuestion = computed(() =>
    state.value.questions.find((question) => question.status === 'pending'),
  )

  watch(
    () => [runError.value?.message, pendingQuestion.value?.id],
    ([errorMessage, questionId]) => {
      const announcement =
        errorMessage ?? (questionId ? text.value.question.required : '')
      if (!announcement) return
      if (announcementTimer) clearTimeout(announcementTimer)
      announcementTimer = setTimeout(() => {
        liveAnnouncement.value = announcement
        announcementTimer = undefined
      }, 180)
      if (errorMessage) focusTarget('[data-focus="error"]')
      else focusTarget('[data-focus="question"] button')
    },
  )

  watch(
    () => availability.value.status,
    (status) => {
      if (status === 'unavailable') focusTarget('[data-focus="availability"]')
    },
  )

  onUnmounted(() => {
    if (announcementTimer) clearTimeout(announcementTimer)
  })
</script>

<style scoped>
  .agent-workspace {
    /* Agent 面板只保留自己的圆角档位；颜色一律直接消费全局 UI / Agent Token。 */
    --agent-control-radius: 8px;
    --toggle-switch-track-background: var(--klc-color-ui-control-background);
    --toggle-switch-thumb-background: var(--klc-color-ui-on-accent);
    --toggle-switch-active-background: var(--klc-color-ui-accent);
    --toggle-switch-focus-color: var(--klc-color-ui-focus);

    height: 100%;
    min-width: 0;
    position: relative;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto auto;
    overflow: hidden;
    color: var(--klc-color-ui-text);
    background: var(--klc-color-ui-surround-background);
    font-family: var(--klc-typography-font-family);
    letter-spacing: 0;
  }

  .agent-workspace :deep(button:focus-visible),
  .agent-workspace :deep(select:focus-visible) {
    outline: 2px solid var(--klc-color-ui-focus);
    outline-offset: 1px;
  }

  .sr-only {
    width: 1px;
    height: 1px;
    position: absolute;
    overflow: clip;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
