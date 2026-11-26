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
        :floating-context="contextItems.length > 0"
        @prompt="draft = $event"
        @answer="answerQuestion"
        @cancel="cancelQuestion"
        @retry="retry"
        @resume="resume"
        @configure="openProviderSettings"
        @load-earlier="loadEarlier"
        @fill-gap="fillGap"
      />

      <div class="agent-workspace__composer">
        <!-- 胶囊浮在输入区上沿：不占时间线高度，随输入框增高一起上移。 -->
        <AgentContextBar
          v-if="contextItems.length > 0"
          class="agent-workspace__context"
          :context-items="contextItems"
          :locale="locale"
        />
        <AgentComposer
          v-model:draft="draft"
          :running="isRunning"
          :mode="mode"
          :snapshot="providerSettings.snapshot"
          :models="providerSettings.models"
          :locale="locale"
          @send="send"
          @stop="stop"
          @mode-change="setMode"
          @model="setModel"
          @reasoning-effort="setReasoningEffort"
        />
      </div>
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
    /* Agent 面板只保留自己的圆角档位与共享几何；颜色一律直接消费全局 UI / Agent Token。
       共享几何集中在这里，避免同样的 12px / 26px 在多个组件里各写一遍。 */
    --agent-control-radius: var(--klc-radius-md, 8px);
    --agent-gutter: var(--klc-space-12, 12px);
    --agent-chip-height: 26px;
    --agent-bar-pad: var(--klc-space-8, 8px);
    /* 面板内的局部层叠：上下文条浮在输入区上，会话抽屉盖住整个面板。 */
    --agent-z-bar: 1;
    --agent-z-drawer: 10;
    /* 标题栏与会话抽屉的图标按钮档位：在这里声明一次，子组件继承，
       不再用「.agent-header, .agent-session-drawer」这种跨组件选择器去挂变量。 */
    --base-icon-button-size: var(--workbench-header-control-size, 30px);
    --base-icon-button-radius: var(--klc-radius-xs, 4px);
    --base-icon-button-color: var(--klc-color-ui-muted);
    --base-icon-button-hover-color: var(--klc-color-ui-text);
    --base-icon-button-hover-bg: var(--klc-color-ui-hover);

    height: 100%;
    min-width: 0;
    position: relative;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    overflow: hidden;
    color: var(--klc-color-ui-text);
    background: var(--klc-color-ui-surround-background);
    letter-spacing: 0;
  }

  /* 输入区承载块：底部留白由它负责，输入框自身只留左右外边距。 */
  .agent-workspace__composer {
    position: relative;
    min-width: 0;
    padding-bottom: var(--agent-gutter);
  }

  /* 上下文胶囊悬浮在输入区上沿：宽度随内容收缩，右侧空白不属于这一层，
     时间线的滚动与拖拽仍归时间线自己，因此不需要 pointer-events 补丁。 */
  .agent-workspace__context {
    position: absolute;
    inset-inline-start: 0;
    bottom: 100%;
    z-index: var(--agent-z-bar);
    width: fit-content;
    max-width: 100%;
  }

  .agent-workspace__initializing {
    place-self: center;
    margin: 0;
    padding: var(--klc-space-24, 24px);
    color: var(--klc-color-ui-muted);
    font-size: var(--klc-text-12-font-size, 12px);
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
