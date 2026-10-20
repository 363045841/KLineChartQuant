<!-- 单个时间线条目：按消息、工具调用与运行三种类型分派渲染。 -->
<template>
  <AgentMessageItem
    v-if="entry.kind === 'message'"
    :message="entry.message"
    :collapse-reasoning="collapseReasoning"
    :locale="locale"
    :show-actions="entry.showActions"
    :regenerate-disabled="isLoading || actionsDisabled"
    :edit-disabled="isLoading || actionsDisabled"
    :edit-message="editMessage"
    @regenerate="emit('retry', entry.message.runId)"
  >
    <template #run-status>
      <AgentRunStatus v-if="entry.statusRun" :run="entry.statusRun" :locale="locale" />
    </template>
  </AgentMessageItem>

  <template v-else-if="entry.kind === 'tool'">
    <ToolCallCard
      :tool="entry.tool"
      :locale="locale"
      @locate="emit('locate', $event)"
      @undo="emit('undo')"
    />
    <ConfirmationCard
      v-if="entry.confirmation"
      :confirmation="entry.confirmation"
      :locale="locale"
      @decide="emit('confirm', entry.confirmation!.id, $event)"
    />
    <QuestionCard
      v-if="entry.question"
      :question="entry.question"
      :locale="locale"
      @answer="emit('answer', entry.question!.id, $event)"
    />
  </template>

  <AgentRunStatus
    v-else-if="entry.kind === 'run' && entry.showStatus"
    :run="entry.run"
    :locale="locale"
  />
</template>

<script setup lang="ts">
  import type { QuestionAnswerView } from '../agent-contracts.js'
  import type { AgentLocale } from '../agent-copy.js'
  import type { EditMessageAction } from '../message-edit/types.js'
  import AgentMessageItem from './AgentMessageItem.vue'
  import AgentRunStatus from './AgentRunStatus.vue'
  import ConfirmationCard from './ConfirmationCard.vue'
  import QuestionCard from './QuestionCard.vue'
  import ToolCallCard from './ToolCallCard.vue'
  import type { ConfirmationDecision, TimelineEntry } from './use-agent-timeline.js'

  defineProps<{
    entry: TimelineEntry
    collapseReasoning: boolean
    locale: AgentLocale
    isLoading: boolean
    editMessage?: EditMessageAction
    actionsDisabled?: boolean
  }>()

  const emit = defineEmits<{
    retry: [runId?: string]
    confirm: [confirmationId: string, decision: ConfirmationDecision]
    answer: [questionId: string, answer: QuestionAnswerView]
    undo: []
    locate: [toolCallId: string]
  }>()
</script>
