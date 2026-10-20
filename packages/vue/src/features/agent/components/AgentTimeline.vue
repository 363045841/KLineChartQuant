<!-- Agent 时间线：合并消息、工具调用与运行状态，并跟随最新消息滚动。 -->
<template>
  <main
    ref="scroller"
    class="timeline"
    :aria-label="text.timeline"
    @scroll.passive="updateAutoScroll"
  >
    <AgentTimelineEmptyState
      v-if="entries.length === 0"
      :locale="locale"
      @prompt="emit('prompt', $event)"
    />

    <AgentTimelineEntry
      v-for="entry in entries"
      :key="entry.id"
      :entry="entry"
      :collapse-reasoning="collapseReasoning"
      :locale="locale"
      :edit-message="editMessage"
      :actions-disabled="actionsDisabled"
      :is-loading="isLoading"
      v-on="entryListeners"
    />

    <AgentErrorNotice v-if="error" :error="error" :locale="locale" @retry="emit('retry')" />
  </main>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import type {
    AgentErrorView,
    AgentMessageView,
    AgentRunView,
    ConfirmationView,
    QuestionAnswerView,
    QuestionView,
    ToolCallView,
  } from '../agent-contracts.js'
  import { type AgentLocale, getAgentCopy } from '../agent-copy.js'
  import type { EditMessageAction } from '../message-edit/types.js'
  import AgentErrorNotice from './AgentErrorNotice.vue'
  import AgentTimelineEmptyState from './AgentTimelineEmptyState.vue'
  import AgentTimelineEntry from './AgentTimelineEntry.vue'
  import { type ConfirmationDecision, useAgentTimeline } from './use-agent-timeline.js'

  const props = defineProps<{
    messages: AgentMessageView[]
    toolCalls: ToolCallView[]
    confirmations: ConfirmationView[]
    questions: QuestionView[]
    run: AgentRunView
    runs: AgentRunView[]
    error: AgentErrorView | null
    collapseReasoning: boolean
    locale: AgentLocale
    editMessage?: EditMessageAction
    actionsDisabled?: boolean
  }>()

  const emit = defineEmits<{
    prompt: [prompt: string]
    confirm: [confirmationId: string, decision: ConfirmationDecision]
    answer: [questionId: string, answer: QuestionAnswerView]
    retry: [runId?: string]
    undo: []
    locate: [toolCallId: string]
  }>()

  const text = computed(() => getAgentCopy(props.locale))
  const { scroller, entries, isLoading, updateAutoScroll } = useAgentTimeline(props)

  // 条目事件与当前组件 emit 同名同参，统一转发给工作区。
  const entryListeners = {
    retry: (runId?: string) => emit('retry', runId),
    confirm: (confirmationId: string, decision: ConfirmationDecision) =>
      emit('confirm', confirmationId, decision),
    answer: (questionId: string, answer: QuestionAnswerView) => emit('answer', questionId, answer),
    undo: () => emit('undo'),
    locate: (toolCallId: string) => emit('locate', toolCallId),
  }
</script>

<style scoped>
  .timeline {
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow: auto;
    padding: 14px 12px 18px;
    background: var(--agent-bg);
    scrollbar-gutter: stable;
  }

  /* 用量行由子组件渲染，时间线只负责它在窄面板内的换行布局。 */
  .timeline :deep(.run-status__usage) {
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 9px;
  }

  @media (prefers-reduced-motion: reduce) {
    .timeline {
      scroll-behavior: auto;
    }
  }
</style>
