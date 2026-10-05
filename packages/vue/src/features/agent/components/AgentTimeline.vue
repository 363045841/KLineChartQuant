<template>
  <main
    ref="scroller"
    class="timeline"
    :aria-label="text.timeline"
    @scroll.passive="updateAutoScroll"
  >
    <section v-if="entries.length === 0" class="empty-state">
      <h2>{{ text.emptyTitle }}</h2>
      <p>{{ text.emptyBody }}</p>
      <div class="empty-state__prompts">
        <button
          v-for="prompt in prompts"
          :key="prompt"
          type="button"
          @click="$emit('prompt', prompt)"
        >
          <span>{{ prompt }}</span>
          <IconArrowUpRight aria-hidden="true" />
        </button>
      </div>
    </section>

    <template v-for="entry in entries" :key="entry.id">
      <AgentMessageItem
        v-if="entry.kind === 'message'"
        :message="entry.message"
        :collapse-reasoning="collapseReasoning"
        :locale="locale"
        :show-actions="isFinalReply(entry.message)"
        :regenerate-disabled="isLoading || actionsDisabled"
        :edit-disabled="isLoading || actionsDisabled"
        :edit-message="editMessage"
        @regenerate="$emit('retry', entry.message.runId)"
      >
        <template #run-status>
          <AgentRunStatus
            v-if="statusForReply(entry.message)"
            :run="statusForReply(entry.message)!"
            :locale="locale"
          />
        </template>
      </AgentMessageItem>
      <template v-else-if="entry.kind === 'tool'">
        <ToolCallCard
          :tool="entry.tool"
          :locale="locale"
          @locate="$emit('locate', $event)"
          @undo="$emit('undo')"
        />
        <ConfirmationCard
          v-if="confirmationFor(entry.tool.id)"
          :confirmation="confirmationFor(entry.tool.id)!"
          :locale="locale"
          @decide="$emit('confirm', confirmationFor(entry.tool.id)!.id, $event)"
        />
        <QuestionCard
          v-if="questionFor(entry.tool.id)"
          :question="questionFor(entry.tool.id)!"
          :locale="locale"
          @answer="$emit('answer', questionFor(entry.tool.id)!.id, $event)"
        />
      </template>
      <AgentRunStatus
        v-if="
          entry.kind === 'run' &&
          !messages.some((message) => message.runId === entry.run.id && isFinalReply(message)) &&
          entry.run.usage
        "
        :run="entry.run"
        :locale="locale"
      />
    </template>

    <AgentErrorNotice v-if="error" :error="error" :locale="locale" @retry="$emit('retry')" />
  </main>
</template>

<script setup lang="ts">
  import { computed, nextTick, ref, watch } from 'vue'
  import IconArrowUpRight from '~icons/tabler/arrow-up-right'
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
  import AgentMessageItem from './AgentMessageItem.vue'
  import ConfirmationCard from './ConfirmationCard.vue'
  import QuestionCard from './QuestionCard.vue'
  import ToolCallCard from './ToolCallCard.vue'
  import AgentRunStatus from './AgentRunStatus.vue'

  type TimelineEntry =
    | { kind: 'message'; id: string; at: number; message: AgentMessageView }
    | { kind: 'tool'; id: string; at: number; tool: ToolCallView }
    | { kind: 'run'; id: string; at: number; run: AgentRunView }

  const props = defineProps<{
    messages: AgentMessageView[]
    toolCalls: ToolCallView[]
    confirmations: ConfirmationView[]
    questions: QuestionView[]
    run: AgentRunView
    runs: AgentRunView[]
    error: AgentErrorView | null
    canUndo: boolean
    collapseReasoning: boolean
    locale: AgentLocale
    editMessage?: EditMessageAction
    actionsDisabled?: boolean
  }>()

  defineEmits<{
    prompt: [prompt: string]
    confirm: [confirmationId: string, decision: 'confirmed' | 'rejected']
    answer: [questionId: string, answer: QuestionAnswerView]
    retry: [runId?: string]
    undo: []
    locate: [toolCallId: string]
  }>()

  const scroller = ref<HTMLElement | null>(null)
  const AUTO_SCROLL_THRESHOLD_PX = 48
  let shouldAutoScroll = true
  const text = computed(() => getAgentCopy(props.locale))
  const prompts = computed(() => [
    text.value.promptTrend,
    text.value.promptRsi,
    text.value.promptEma,
    text.value.promptBond,
  ])
  const entries = computed<TimelineEntry[]>(() =>
    [
      ...props.messages.map((message) => ({
        kind: 'message' as const,
        id: `message-${message.id}`,
        at: message.createdAt,
        message,
      })),
      ...props.toolCalls.map((tool) => ({
        kind: 'tool' as const,
        id: `tool-${tool.id}`,
        at: tool.startedAt ?? Number.MAX_SAFE_INTEGER,
        tool,
      })),
      ...props.runs
        .filter(
          (run) =>
            run.id &&
            !props.runs.some((replacement) => replacement.retryOfRunId === run.id) &&
            (run.usage || (run.id === props.run.id && props.run.status !== 'idle')),
        )
        .map((run) => ({
          kind: 'run' as const,
          id: `run-${run.id}`,
          at: run.endedAt ?? Number.MAX_SAFE_INTEGER,
          run,
        })),
    ].sort((left, right) => left.at - right.at),
  )
  const isTerminal = computed(() =>
    ['completed', 'failed', 'cancelled', 'partial', 'interrupted'].includes(props.run.status),
  )
  const isLoading = computed(() => !isTerminal.value && props.run.status !== 'idle')
  /** 仅在已完成运行的最后一条助手回复下显示操作。 */
  function isFinalReply(message: AgentMessageView): boolean {
    if (message.role !== 'assistant' || message.status !== 'complete' || !message.runId)
      return false
    const run = props.runs.find((item) => item.id === message.runId)
    if (run?.status !== 'completed') return false
    return !props.messages
      .slice(props.messages.indexOf(message) + 1)
      .some((item) => item.role === 'assistant' && item.runId === message.runId)
  }
  /** 完成回复的状态嵌入操作栏，其他运行仍保留独立进度入口。 */
  function statusForReply(message: AgentMessageView): AgentRunView | undefined {
    if (!isFinalReply(message)) return undefined
    return props.runs.find((item) => item.id === message.runId && item.usage)
  }

  function confirmationFor(toolCallId: string): ConfirmationView | undefined {
    return props.confirmations.find((item) => item.toolCallId === toolCallId)
  }

  function questionFor(toolCallId: string): QuestionView | undefined {
    return props.questions.find((item) => item.toolCallId === toolCallId)
  }

  // 用户离开底部后保留当前阅读位置，直到主动滚回消息末尾。
  function updateAutoScroll(): void {
    const element = scroller.value
    if (!element) return
    shouldAutoScroll =
      element.scrollHeight - element.scrollTop - element.clientHeight <= AUTO_SCROLL_THRESHOLD_PX
  }

  // 仅在用户正在跟随最新消息时推进视图，避免流式输出打断历史阅读。
  function scrollToLatest(): void {
    if (!shouldAutoScroll) return
    const element = scroller.value
    if (!element) return
    element.scrollTop = element.scrollHeight
  }

  watch(
    () => [
      props.messages.length,
      props.toolCalls.length,
      props.confirmations.length,
      props.questions.length,
      props.run.status,
    ],
    async () => {
      await nextTick()
      scrollToLatest()
    },
  )
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

  .empty-state {
    min-height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 8px;
    color: var(--agent-text);
    text-align: center;
  }

  h2 {
    margin: 4px 0 0;
    font-size: 16px;
    line-height: 1.25;
  }
  .empty-state > p {
    margin: 0 0 8px;
    color: var(--agent-muted);
    font-size: 12px;
    line-height: 1.45;
  }

  .empty-state__prompts {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }
  .empty-state__prompts button {
    max-width: 100%;
    min-height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 7px 14px;
    border: 1px solid var(--agent-border);
    border-radius: 999px;
    color: var(--agent-text);
    background: var(--agent-surface);
    font: inherit;
    font-size: 12px;
    text-align: center;
    cursor: pointer;
  }
  .empty-state__prompts button:hover {
    border-color: var(--agent-border-strong);
    background: var(--agent-hover);
  }
  .empty-state__prompts span {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .run-status {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px 9px;
    margin-top: -6px;
    padding: 7px 9px;
    border: 1px solid var(--agent-border);
    border-radius: 5px;
    color: var(--agent-muted);
    background: var(--agent-surface);
    font-size: 10px;
  }
  .run-status__usage {
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 9px;
  }
  .run-status__usage strong {
    color: var(--agent-text);
  }
  .run-status__indicator {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    color: var(--agent-accent);
  }
  .run-status button {
    min-height: 27px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 0 8px;
    border: 1px solid var(--agent-border);
    border-radius: 4px;
    color: var(--agent-text);
    background: var(--agent-input);
    font: inherit;
    font-size: 11px;
    cursor: pointer;
  }

  @media (prefers-reduced-motion: reduce) {
    .timeline {
      scroll-behavior: auto;
    }
  }
</style>
