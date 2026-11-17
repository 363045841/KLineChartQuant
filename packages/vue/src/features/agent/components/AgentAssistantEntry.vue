<!-- 助手条目：按官方块顺序渲染回答，并提供复制与重新生成。 -->
<template>
  <article class="agent-entry agent-entry--assistant">
    <AgentAnswerBlocks
      :blocks="blocks"
      :citations="citations"
      :results="results"
      :slots="slots"
      :questions="questions"
      :streaming="false"
      :collapse-reasoning="collapseReasoning"
      :locale="locale"
      @answer="(questionId, answer) => emit('answer', questionId, answer)"
      @cancel="(questionId) => emit('cancel', questionId)"
    />
    <div v-if="showActions" class="agent-entry__actions">
      <BaseTooltip :content="copyLabel" placement="bottom">
        <button type="button" :data-status="copyStatus" :aria-label="copyLabel" @click="copy">
          <IconCheck v-if="copyStatus === 'copied'" aria-hidden="true" />
          <IconAlertTriangle v-else-if="copyStatus === 'failed'" aria-hidden="true" />
          <IconCopy v-else aria-hidden="true" />
        </button>
      </BaseTooltip>
      <BaseTooltip v-if="retryEntryId !== undefined" :content="text.regenerate" placement="bottom">
        <button
          type="button"
          :disabled="actionsDisabled"
          :aria-label="text.regenerate"
          @click="emit('retry', retryEntryId)"
        >
          <IconRefresh aria-hidden="true" />
        </button>
      </BaseTooltip>
    </div>
  </article>
</template>

<script setup lang="ts">
  import './agent-entry.css'

  import { computed } from 'vue'
  import IconAlertTriangle from '~icons/tabler/alert-triangle'
  import IconCheck from '~icons/tabler/check'
  import IconCopy from '~icons/tabler/copy'
  import IconRefresh from '~icons/tabler/refresh'
  import BaseTooltip from '../../../components/common/BaseTooltip.vue'
  import type {
    EntryId,
    EntryRecord,
    QuestionAnswerView,
    QuestionView,
    SourceCitation,
    ToolResultMessage,
  } from '../agent-contracts.js'
  import { type AgentLocale, getAgentCopy } from '../agent-copy.js'
  import type { LiveToolView } from '../workspace/impl/agent-live.js'
  import AgentAnswerBlocks from './AgentAnswerBlocks.vue'
  import { answerText } from './impl/use-agent-transcript.js'
  import { useMessageCopy } from './use-message-copy.js'

  const props = defineProps<{
    entry: EntryRecord
    locale: AgentLocale
    collapseReasoning: boolean
    citations: readonly SourceCitation[]
    results: ReadonlyMap<string, ToolResultMessage>
    slots: ReadonlyMap<string, LiveToolView>
    questions: readonly QuestionView[]
    retryEntryId?: EntryId
    actionsDisabled: boolean
  }>()
  const emit = defineEmits<{
    retry: [entryId: EntryId]
    answer: [questionId: string, answer: QuestionAnswerView]
    cancel: [questionId: string]
  }>()

  const text = computed(() => getAgentCopy(props.locale))
  const blocks = computed(() => {
    const message = props.entry.model?.[0]
    return message?.role === 'assistant' ? message.content : []
  })
  const copyContent = computed(() => answerText(props.entry))
  const { status: copyStatus, copy } = useMessageCopy(() => copyContent.value)
  // 操作栏只属于最终回答；复制正文与重新生成都在这里。
  const showActions = computed(() => props.retryEntryId !== undefined)
  const copyLabel = computed(() =>
    copyStatus.value === 'copied'
      ? text.value.copiedMessage
      : copyStatus.value === 'failed'
        ? text.value.copyFailed
        : text.value.copyMessage,
  )
</script>
