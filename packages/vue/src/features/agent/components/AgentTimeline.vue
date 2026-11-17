<!-- 时间线：官方条目流原样渲染，只补更早/缺失占位与流式回答。 -->
<template>
  <main
    ref="scroller"
    class="timeline"
    :aria-label="text.timeline"
    @scroll.passive="updateAutoScroll"
  >
    <div class="timeline__body">
      <AgentTimelineEmptyState
        v-if="rows.length === 0 && !liveAnswer"
        :locale="locale"
        @prompt="emit('prompt', $event)"
      />

      <template v-for="item in markers" :key="item.key">
        <button
          v-if="item.kind === 'earlier'"
          type="button"
          class="timeline__more"
          @click="emit('loadEarlier')"
        >
          {{ text.loadEarlier }}
        </button>
        <button
          v-else
          type="button"
          class="timeline__more"
          @click="emit('fillGap', item.after, item.upTo)"
        >
          {{ text.fillGap }}
        </button>
      </template>

      <template v-for="row in rows" :key="row.entry.id">
        <AgentUserEntry
          v-if="row.kind === 'user'"
          :entry="row.entry"
          :locale="locale"
          :actions-disabled="actionsDisabled"
          :edit-action="editMessage"
        />
        <AgentAssistantEntry
          v-else
          :entry="row.entry"
          :locale="locale"
          :collapse-reasoning="collapseReasoning"
          :citations="index.citations"
          :results="index.toolResults"
          :slots="liveTools"
          :retry-entry-id="row.retryEntryId"
          :actions-disabled="actionsDisabled"
          @retry="emit('retry', $event)"
        />
      </template>

      <AgentAnswerBlocks
        v-if="liveAnswer"
        :blocks="liveAnswer.blocks"
        :citations="index.citations"
        :results="index.toolResults"
        :slots="liveTools"
        :streaming="true"
        :collapse-reasoning="collapseReasoning"
        :locale="locale"
      />

      <QuestionCard
        v-for="question in pendingQuestions"
        :key="question.id"
        :question="question"
        :locale="locale"
        @answer="emit('answer', question.id, $event)"
      />

      <AgentErrorNotice v-if="error" :error="error" :locale="locale" @retry="emitLastRetry" />
    </div>
  </main>
</template>

<script setup lang="ts">
  import { computed, nextTick, ref, watch } from 'vue'
  import type {
    AgentErrorView,
    AgentTranscriptView,
    EntryId,
    EntryRecord,
    QuestionAnswerView,
    QuestionView,
  } from '../agent-contracts.js'
  import { type AgentLocale, getAgentCopy } from '../agent-copy.js'
  import type { EditMessageAction } from '../message-edit/types.js'
  import type { LiveAnswerView, LiveToolView } from '../workspace/impl/agent-live.js'
  import AgentAnswerBlocks from './AgentAnswerBlocks.vue'
  import AgentAssistantEntry from './AgentAssistantEntry.vue'
  import AgentErrorNotice from './AgentErrorNotice.vue'
  import AgentTimelineEmptyState from './AgentTimelineEmptyState.vue'
  import AgentUserEntry from './AgentUserEntry.vue'
  import QuestionCard from './QuestionCard.vue'
  import { indexTranscript, isAssistantEntry, isUserEntry } from './impl/use-agent-transcript.js'

  /** 距底部超过该像素值即视为用户已离开最新消息。 */
  const AUTO_SCROLL_AWAY_PX = 48

  /** 条目流中的更早/缺失占位。 */
  type TimelineMarker =
    | { readonly key: string; readonly kind: 'earlier' }
    | {
        readonly key: string
        readonly kind: 'gap'
        readonly after: EntryId
        readonly upTo: EntryId
      }

  /** 一行可渲染条目：用户输入交给编辑组件，助手回答交给块渲染组件。 */
  type TimelineRow = {
    readonly entry: EntryRecord
    readonly kind: 'user' | 'assistant'
    readonly retryEntryId?: EntryId
  }

  const props = defineProps<{
    transcript: AgentTranscriptView | null
    liveAnswer?: LiveAnswerView
    liveTools: ReadonlyMap<string, LiveToolView>
    questions: readonly QuestionView[]
    error: AgentErrorView | null
    collapseReasoning: boolean
    locale: AgentLocale
    editMessage?: EditMessageAction
    actionsDisabled: boolean
  }>()
  const emit = defineEmits<{
    prompt: [prompt: string]
    answer: [questionId: string, answer: QuestionAnswerView]
    retry: [entryId: EntryId]
    retryLast: [entryId: EntryId]
    loadEarlier: []
    fillGap: [after: EntryId, upTo: EntryId]
  }>()

  const text = computed(() => getAgentCopy(props.locale))
  const scroller = ref<HTMLElement | null>(null)
  let shouldAutoScroll = true

  const items = computed(() => props.transcript?.items ?? [])
  const index = computed(() => indexTranscript(items.value))

  /** 更早与缺失占位，按官方条目流顺序展示。 */
  const markers = computed<TimelineMarker[]>(() => {
    const rows: TimelineMarker[] = []
    items.value.forEach((item, position) => {
      if (item.kind === 'entry') return
      if (item.kind === 'earlier') {
        rows.push({ key: `earlier:${position}`, kind: 'earlier' })
        return
      }
      rows.push({
        key: `gap:${item.after}:${item.upTo}`,
        kind: 'gap',
        after: item.after,
        upTo: item.upTo,
      })
    })
    return rows
  })

  /** 可渲染条目：用户输入与助手回答，其余官方记录不进入界面。 */
  const rows = computed<TimelineRow[]>(() =>
    items.value.flatMap((item) => {
      if (item.kind !== 'entry') return []
      const kind = isUserEntry(item.entry)
        ? ('user' as const)
        : isAssistantEntry(item.entry)
          ? ('assistant' as const)
          : undefined
      if (kind === undefined) return []
      const retryEntryId =
        item.entry.id === index.value.finalAssistantId
          ? index.value.retryTargets.get(item.entry.id)
          : undefined
      return [{ entry: item.entry, kind, ...(retryEntryId === undefined ? {} : { retryEntryId }) }]
    }),
  )

  const pendingQuestions = computed(() =>
    props.questions.filter((question) => question.status === 'pending'),
  )

  /** 运行失败后的重试以最后一条用户输入为目标。 */
  function emitLastRetry(): void {
    const entryId = index.value.lastUserEntryId
    if (entryId !== undefined) emit('retryLast', entryId)
  }

  /** 用户离开底部后保留当前阅读位置，直到主动滚回消息末尾。 */
  function updateAutoScroll(): void {
    const element = scroller.value
    if (!element) return
    shouldAutoScroll =
      element.scrollHeight - element.scrollTop - element.clientHeight <= AUTO_SCROLL_AWAY_PX
  }

  // 条目数量、流式正文长度变化时按需推进到底部。
  watch(
    () => [rows.value.length, props.liveAnswer?.blocks.length, props.error],
    async () => {
      await nextTick()
      if (!shouldAutoScroll) return
      const element = scroller.value
      if (element) element.scrollTop = element.scrollHeight
    },
  )
</script>

<style scoped>
  .timeline {
    min-height: 0;
    overflow-y: auto;
    /* 时间线只有纵向滚动；横向溢出由内容自己换行或内部滚动处理。 */
    overflow-x: hidden;
    background: var(--klc-color-ui-surround-background);
    scrollbar-gutter: stable;
  }

  /* 单列零最小宽度：任何行都无法靠内容宽度撑开列。 */
  .timeline__body {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    padding: 14px 12px 18px;
  }

  .timeline__body > * {
    min-width: 0;
  }

  /* 间距只有这一个来源：条目之间与条目内部块之间同为 6px。 */
  .timeline__body > * + * {
    margin-top: 6px;
  }

  /* 用户消息是唯一的角色分隔，额外加一段上间距。 */
  .timeline__body > .agent-entry--user {
    margin-top: 12px;
  }

  .timeline__body > .agent-entry--user:first-child {
    margin-top: 0;
  }

  .timeline__more {
    justify-self: center;
    padding: 4px 10px;
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 999px;
    background: var(--klc-color-ui-card);
    color: var(--klc-color-ui-muted);
    font-size: 11px;
    cursor: pointer;
  }
</style>
