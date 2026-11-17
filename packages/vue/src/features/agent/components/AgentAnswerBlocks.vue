<!-- 助手回答的块渲染：思考、正文与工具调用严格按官方块顺序输出。 -->
<template>
  <template v-for="(block, index) in blocks" :key="`${index}:${block.type}`">
    <details
      v-if="block.type === 'thinking'"
      class="agent-disclosure answer-block__reasoning"
      :open="reasoningOpen"
    >
      <summary>
        <IconBrain aria-hidden="true" />
        <span>{{ text.reasoning }}</span>
        <IconLoader2 v-if="streaming" class="answer-block__spinner klc-spin" aria-hidden="true" />
      </summary>
      <div class="agent-disclosure__body">
        <p class="answer-block__reasoning-text">{{ block.thinking }}</p>
      </div>
    </details>

    <div
      v-else-if="block.type === 'text'"
      class="answer-block__markdown agent-markdown"
      v-html="render(block.text)"
      @click="openCitation"
    />

    <AgentToolCallRow
      v-else
      :call="block"
      :result="results.get(block.id)"
      :slot="slots.get(block.id)"
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

  const props = defineProps<{
    blocks: readonly (TextContent | ThinkingContent | ToolCall)[]
    citations: readonly SourceCitation[]
    results: ReadonlyMap<string, ToolResultMessage>
    slots: ReadonlyMap<string, LiveToolView>
    streaming: boolean
    collapseReasoning: boolean
    locale: AgentLocale
  }>()

  const text = computed(() => getAgentCopy(props.locale))
  // 折叠偏好优先；流式输出期间默认展开思考过程。
  const reasoningOpen = computed(() => !props.collapseReasoning && props.streaming)

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
