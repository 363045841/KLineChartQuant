<template>
  <main ref="scroller" class="timeline" aria-label="Agent timeline" @scroll.passive="updateAutoScroll">
    <section v-if="entries.length === 0" class="empty-state">
      <IconChartCandle aria-hidden="true" />
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
      <AgentMessageItem v-if="entry.kind === 'message'" :message="entry.message" :locale="locale" />
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
      </template>
      <section
        v-if="
          entry.kind === 'run' &&
          (entry.run.usage ||
            (entry.run.id === run.id && (isLoading || canUndo)))
        "
        class="run-status"
        :data-status="entry.run.status"
        :tabindex="entry.run.id === run.id && isTerminal ? -1 : undefined"
        :data-focus="entry.run.id === run.id ? 'completion' : undefined"
      >
        <div v-if="entry.run.usage" class="run-status__usage">
          <span>{{ text.input }} {{ entry.run.usage.inputTokens ?? 0 }}</span>
          <span>{{ text.output }} {{ entry.run.usage.outputTokens ?? 0 }}</span>
          <strong>{{ text.total }} {{ turnTokens(entry.run) }} {{ text.tokens }}</strong>
        </div>
        <span
          v-if="entry.run.id === run.id && isLoading"
          class="run-status__indicator"
        >
          <LoadingSpinner />
        </span>
        <button
          v-if="entry.run.id === run.id && canUndo"
          type="button"
          @click="$emit('undo')"
        >
          <IconArrowBackUp aria-hidden="true" />
          {{ text.undo }}
        </button>
      </section>
    </template>

    <AgentErrorNotice v-if="error" :error="error" :locale="locale" @retry="$emit('retry')" />
  </main>
</template>

<script setup lang="ts">
  import { computed, nextTick, ref, watch } from 'vue'

  import { getAgentCopy, type AgentLocale } from '../agent-copy'

  import AgentErrorNotice from './AgentErrorNotice.vue'
  import AgentMessageItem from './AgentMessageItem.vue'
  import ConfirmationCard from './ConfirmationCard.vue'
  import ToolCallCard from './ToolCallCard.vue'
  import LoadingSpinner from '../../../components/LoadingSpinner.vue'

  import type {
    AgentErrorView,
    AgentMessageView,
    AgentRunView,
    ConfirmationView,
    ToolCallView,
  } from '../agent-contracts'

  import IconArrowBackUp from '~icons/tabler/arrow-back-up'
  import IconArrowUpRight from '~icons/tabler/arrow-up-right'
  import IconChartCandle from '~icons/tabler/chart-candle'

  type TimelineEntry =
    | { kind: 'message'; id: string; at: number; message: AgentMessageView }
    | { kind: 'tool'; id: string; at: number; tool: ToolCallView }
    | { kind: 'run'; id: string; at: number; run: AgentRunView }

  const props = defineProps<{
    messages: AgentMessageView[]
    toolCalls: ToolCallView[]
    confirmations: ConfirmationView[]
    run: AgentRunView
    runs: AgentRunView[]
    error: AgentErrorView | null
    canUndo: boolean
    locale: AgentLocale
  }>()

  defineEmits<{
    prompt: [prompt: string]
    confirm: [confirmationId: string, decision: 'confirmed' | 'rejected']
    retry: []
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
    text.value.promptTheme,
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
  /** 返回单轮模型输入与输出的累计 token。 */
  function turnTokens(run: AgentRunView): number {
    return (run.usage?.inputTokens ?? 0) + (run.usage?.outputTokens ?? 0)
  }

  function confirmationFor(toolCallId: string): ConfirmationView | undefined {
    return props.confirmations.find((item) => item.toolCallId === toolCallId)
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
    align-items: flex-start;
    gap: 8px;
    color: var(--agent-text);
  }

  .empty-state > svg {
    width: 26px;
    height: 26px;
    color: var(--agent-accent);
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
    display: grid;
    gap: 5px;
  }
  .empty-state__prompts button {
    min-width: 0;
    min-height: 36px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    padding: 7px 9px;
    border: 1px solid var(--agent-border);
    border-radius: 5px;
    color: var(--agent-text);
    background: var(--agent-surface);
    font: inherit;
    font-size: 12px;
    text-align: left;
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
    border: 1px solid var(--agent-border-strong);
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
