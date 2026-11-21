<template>
  <section ref="workspace" class="agent-workspace" :aria-label="text.agent">
    <AgentHeader
      :locale="locale"
      :sessions-open="sessionDrawerOpen"
      :available="available"
      :panel-side="panelSide"
      @create="handleCreateSession"
      @toggle-sessions="sessionDrawerOpen = !sessionDrawerOpen"
      @settings="providerSettings.show()"
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
        :run-failure="runFailure"
        :collapse-reasoning="collapseReasoning"
        :locale="locale"
        :edit-message="editMessage"
        :actions-disabled="isRunning"
        @prompt="draft = $event"
        @answer="answerQuestion"
        @cancel="cancelQuestion"
        @retry="retry"
        @resume="resume"
        @configure="openProviderSettings"
        @load-earlier="loadEarlier"
        @fill-gap="fillGap"
      />

      <AgentContextBar :context-items="contextItems" :locale="locale" />
      <AgentComposer
        v-model:draft="draft"
        :running="isRunning"
        :mode="mode"
        :snapshot="providerSettings.snapshot"
        :models="providerSettings.models"
        :models-loading="providerSettings.snapshot === null"
        :locale="locale"
        @send="send"
        @stop="stop"
        @mode-change="setMode"
        @model="setModel"
        @reasoning-effort="setReasoningEffort"
      />
    </template>

    <p v-if="availability.status === 'initializing'" class="agent-workspace__initializing">
      {{ text.workspaceInitializing }}
    </p>

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
    />
  </section>
</template>

<script setup lang="ts">
  import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
  import type { SidePanelSide } from '../../side-panel/types.js'
  import type { AgentClient } from '../agent-contracts.js'
  import { getAgentCopy } from '../agent-copy/index.js'
  import { useAgentWorkspace } from '../workspace/impl/use-agent-workspace.js'
  import AgentComposer from './AgentComposer.vue'
  import AgentContextBar from './AgentContextBar.vue'
  import AgentHeader from './AgentHeader.vue'
  import AgentSessionDrawer from './AgentSessionDrawer.vue'
  import AgentSettingsDialog from './AgentSettingsDialog.vue'
  import AgentTimeline from './AgentTimeline.vue'
  import AgentUnavailableNotice from './AgentUnavailableNotice.vue'

  const props = withDefaults(defineProps<{ client: AgentClient; panelSide?: SidePanelSide }>(), {
    panelSide: 'right',
  })
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
    isRunning,
    liveAnswer,
    liveTools,
    runFailure,
    createSession,
    selectSession,
    renameSession,
    deleteSession,
    send,
    stop,
    retry,
    resume,
    retryInitialize,
    editMessage,
    loadEarlier,
    fillGap,
    answerQuestion,
    cancelQuestion,
    mode,
    setMode,
    setModel,
    setReasoningEffort,
  } = useAgentWorkspace(props.client)

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

  /** 延迟播报，连续变化时只保留最后一次。 */
  function announce(message: string): void {
    if (announcementTimer) clearTimeout(announcementTimer)
    announcementTimer = setTimeout(() => {
      liveAnnouncement.value = message
      announcementTimer = undefined
    }, 180)
  }

  /** 失败提示里的「打开模型设置」直接复用同一份 Provider 设置面板。 */
  function openProviderSettings(): void {
    void providerSettings.show()
  }

  // 提问卡片内联在回答里，焦点与播报按同一条待答提问推进；
  // 失败提示自带 role 与焦点接管，这里不再重复播报。
  const pendingQuestion = computed(() =>
    state.value.questions.find((question) => question.status === 'pending'),
  )

  watch(
    () => pendingQuestion.value?.id,
    (questionId) => {
      if (!questionId) return
      announce(text.value.question.required)
      focusTarget('[data-focus="question"] button')
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
    letter-spacing: 0;
  }

  .agent-workspace__initializing {
    place-self: center;
    margin: 0;
    padding: 24px;
    color: var(--klc-color-ui-muted);
    font-size: 12px;
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
