<!-- 助手回答的块渲染：思考、正文、工具与提问严格按官方块顺序输出。 -->
<template>
  <template v-for="(row, index) in rows" :key="`${index}:${row.kind}`">
    <details
      v-if="row.kind === 'thinking'"
      class="agent-disclosure answer-block__reasoning"
      :open="reasoningOpen"
    >
      <summary>
        <IconBrain aria-hidden="true" />
        <span>{{ text.reasoning }}</span>
        <IconLoader2 v-if="streaming" class="answer-block__spinner klc-spin" aria-hidden="true" />
      </summary>
      <div class="agent-disclosure__body">
        <p class="answer-block__reasoning-text">{{ row.thinking }}</p>
      </div>
    </details>

    <div
      v-else-if="row.kind === 'text'"
      class="answer-block__markdown agent-markdown"
      v-html="render(row.text)"
      @click="openCitation"
    />

    <QuestionCard
      v-else-if="row.kind === 'question'"
      :question="row.question"
      :locale="locale"
      @answer="emit('answer', row.question.id, $event)"
      @cancel="emit('cancel', row.question.id)"
    />

    <AgentToolCallRow
      v-else
      :call="row.call"
      :result="results.get(row.call.id)"
      :slot="slots.get(row.call.id)"
      :locale="locale"
    />
  </template>
</template>

<script setup lang="ts">
  import './agent-entry.css'
  import '../render-agent-markdown/impl/agent-markdown.css'

  import { computed } from 'vue'
  import IconBrain from '~icons/tabler/brain'
  import IconLoader2 from '~icons/tabler/loader-2'
  import type {
    QuestionAnswerView,
    QuestionView,
    SourceCitation,
    TextContent,
    ThinkingContent,
    ToolCall,
    ToolResultMessage,
  } from '../agent-contracts.js'
  import { type AgentLocale, getAgentCopy } from '../agent-copy.js'
  import { renderAgentMarkdown } from '../render-agent-markdown.js'
  import type { LiveToolView } from '../workspace/impl/agent-live.js'
  import AgentToolCallRow from './AgentToolCallRow.vue'
  import { readAskUserQuestion } from './impl/ask-user-view.js'
  import { readToolPresentation } from './impl/tool-view.js'
  import QuestionCard from './QuestionCard.vue'

  /** 一行可渲染块：正文、思考、工具调用，或由工具调用还原出的提问。 */
  type AnswerRow =
    | { readonly kind: 'thinking'; readonly thinking: string }
    | { readonly kind: 'text'; readonly text: string }
    | { readonly kind: 'question'; readonly question: QuestionView }
    | { readonly kind: 'tool'; readonly call: ToolCall }

  const props = defineProps<{
    blocks: readonly (TextContent | ThinkingContent | ToolCall)[]
    citations: readonly SourceCitation[]
    results: ReadonlyMap<string, ToolResultMessage>
    slots: ReadonlyMap<string, LiveToolView>
    questions: readonly QuestionView[]
    streaming: boolean
    collapseReasoning: boolean
    locale: AgentLocale
  }>()
  const emit = defineEmits<{
    answer: [questionId: string, answer: QuestionAnswerView]
    cancel: [questionId: string]
  }>()

  const text = computed(() => getAgentCopy(props.locale))
  // 折叠偏好优先；流式输出期间默认展开思考过程。
  const reasoningOpen = computed(() => !props.collapseReasoning && props.streaming)

  /** 提问按工具调用身份匹配，渲染时不再按工具名判断。 */
  const rows = computed<ReadonlyArray<AnswerRow>>(() => {
    const pending = new Map(props.questions.map((question) => [question.toolCallId, question]))
    return props.blocks.map((block) => {
      if (block.type === 'thinking') return { kind: 'thinking', thinking: block.thinking }
      if (block.type === 'text') return { kind: 'text', text: block.text }
      const result = props.results.get(block.id)
      const question = readAskUserQuestion({
        call: block,
        presentation: readToolPresentation(result?.details ?? props.slots.get(block.id)?.details)
          .presentation,
        stored: pending.get(block.id),
        result,
      })
      return question ? { kind: 'question', question } : { kind: 'tool', call: block }
    })
  })

  /** 渲染单个正文块，并注入本会话收集到的引用。 */
  function render(markdown: string): string {
    return renderAgentMarkdown(markdown, props.citations)
  }

  /** 打开当前正文中已验证来源的原始页面。 */
  function openCitation(event: MouseEvent): void {
    const target = event.target
    if (!(target instanceof Element)) return
    const id = target.closest<HTMLButtonElement>('[data-agent-citation-id]')?.dataset
      .agentCitationId
    const citation = props.citations.find((item) => item.id === id)
    if (!citation) return
    try {
      const url = new URL(citation.url)
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        window.open(url.href, '_blank', 'noopener,noreferrer')
      }
    } catch {
      // 结构化来源不合法时不执行外链跳转。
    }
  }
</script>

<style scoped>
  .answer-block__reasoning-text {
    margin: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    line-height: 1.5;
  }

  .answer-block__spinner {
    color: var(--klc-color-ui-accent);
  }

  .answer-block__markdown {
    min-width: 0;
  }
</style>
