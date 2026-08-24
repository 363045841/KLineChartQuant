<template>
  <main ref="scroller" class="timeline" aria-label="Agent timeline">
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
      <template v-else>
        <ToolCallCard
          :tool="entry.tool"
          :locale="locale"
          @locate="$emit('locate', $event)"
          @retry="$emit('retry')"
          @undo="$emit('undo')"
        />
        <ConfirmationCard
          v-if="confirmationFor(entry.tool.id)"
          :confirmation="confirmationFor(entry.tool.id)!"
          :locale="locale"
          @decide="$emit('confirm', confirmationFor(entry.tool.id)!.id, $event)"
        />
      </template>
    </template>

    <AgentErrorNotice v-if="error" :error="error" :locale="locale" @retry="$emit('retry')" />

    <section
      v-if="run.status !== 'idle'"
      class="run-summary"
      :data-status="run.status"
      :tabindex="isTerminal ? -1 : undefined"
      data-focus="completion"
    >
      <div>
        <component :is="runStatusIcon" aria-hidden="true" />
        <span>{{ text.runStatus }}</span>
        <strong>{{ runStatusLabel }}</strong>
      </div>
      <div v-if="run.usage" class="run-summary__usage">
        <span>{{ text.usage }}</span>
        <span v-if="totalTokens !== null">{{ totalTokens }} {{ text.tokens }}</span>
        <span v-if="run.usage.durationMs !== undefined">{{ run.usage.durationMs }} ms</span>
        <span v-if="run.usage.costUsd !== undefined">${{ run.usage.costUsd.toFixed(4) }}</span>
      </div>
      <button v-if="canUndo" type="button" @click="$emit('undo')">
        <IconArrowBackUp aria-hidden="true" />
        {{ text.undo }}
      </button>
    </section>
  </main>
</template>

<script setup lang="ts">
  import { computed, nextTick, ref, watch } from 'vue'

  import { getAgentCopy, type AgentLocale } from '../agent-copy'

  import AgentErrorNotice from './AgentErrorNotice.vue'
  import AgentMessageItem from './AgentMessageItem.vue'
  import ConfirmationCard from './ConfirmationCard.vue'
  import ToolCallCard from './ToolCallCard.vue'

  import type {
    AgentErrorView,
    AgentMessageView,
    AgentRunView,
    ConfirmationView,
    ToolCallView,
  } from '../agent-contracts'

  import IconAlertTriangle from '~icons/tabler/alert-triangle'
  import IconArrowBackUp from '~icons/tabler/arrow-back-up'
  import IconArrowUpRight from '~icons/tabler/arrow-up-right'
  import IconBan from '~icons/tabler/ban'
  import IconChartCandle from '~icons/tabler/chart-candle'
  import IconCheck from '~icons/tabler/check'
  import IconClock from '~icons/tabler/clock'
  import IconLoader2 from '~icons/tabler/loader-2'

  type TimelineEntry =
    | { kind: 'message'; id: string; at: number; message: AgentMessageView }
    | { kind: 'tool'; id: string; at: number; tool: ToolCallView }

  const props = defineProps<{
    messages: AgentMessageView[]
    toolCalls: ToolCallView[]
    confirmations: ConfirmationView[]
    run: AgentRunView
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
    ].sort((left, right) => left.at - right.at),
  )
  const isTerminal = computed(() =>
    ['completed', 'failed', 'cancelled', 'partial', 'interrupted'].includes(props.run.status),
  )
  const runStatusLabel = computed(
    () => text.value.status[props.run.status as keyof typeof text.value.status],
  )
  const runStatusIcon = computed(() => {
    switch (props.run.status) {
      case 'completed':
        return IconCheck
      case 'failed':
        return IconAlertTriangle
      case 'cancelled':
      case 'partial':
      case 'interrupted':
        return IconBan
      case 'idle':
        return IconClock
      default:
        return IconLoader2
    }
  })
  const totalTokens = computed(() => {
    if (!props.run.usage) return null
    const { inputTokens, outputTokens } = props.run.usage
    if (inputTokens === undefined && outputTokens === undefined) return null
    return (inputTokens ?? 0) + (outputTokens ?? 0)
  })

  function confirmationFor(toolCallId: string): ConfirmationView | undefined {
    return props.confirmations.find((item) => item.toolCallId === toolCallId)
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
      scroller.value?.scrollTo({ top: scroller.value.scrollHeight, behavior: 'smooth' })
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

  .run-summary {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 7px 10px;
    padding-top: 10px;
    border-top: 1px solid var(--agent-border);
    color: var(--agent-muted);
    font-size: 10px;
  }
  .run-summary > div:first-child {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .run-summary strong {
    color: var(--agent-text);
    font-size: 11px;
  }
  .run-summary__usage {
    grid-column: 1 / -1;
    display: flex;
    flex-wrap: wrap;
    gap: 4px 9px;
  }
  .run-summary button {
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
