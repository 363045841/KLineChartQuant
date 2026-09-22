<template>
  <article class="message" :class="`message--${message.role}`">
    <div v-if="message.role === 'action'" class="message__action">
      <IconActivity aria-hidden="true" />
      <span>{{ text.action }}</span>
    </div>
    <div v-if="message.role !== 'action' && message.role !== 'reasoning'" class="message__role">
      <IconUser v-if="message.role === 'user'" aria-hidden="true" />
      <IconSparkles v-else aria-hidden="true" />
      <span>{{ message.role === 'user' ? 'You' : text.agent }}</span>
      <IconLoader2
        v-if="message.status === 'streaming'"
        class="message__spinner"
        aria-hidden="true"
      />
    </div>
    <details
      v-if="message.role === 'reasoning'"
      class="message__reasoning"
      :open="reasoningOpen"
    >
      <summary>
        <IconBrain aria-hidden="true" />
        <span>{{ text.reasoning }}</span>
        <IconLoader2
          v-if="message.status === 'streaming'"
          class="message__spinner"
          aria-hidden="true"
        />
      </summary>
      <p class="message__content">{{ message.content }}</p>
    </details>
    <div
      v-if="message.role === 'assistant'"
      class="message__content message__content--markdown"
      v-html="html"
      @click="openCitation"
    />
    <p v-else-if="message.role !== 'reasoning'" class="message__content">{{ message.content }}</p>
  </article>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import IconActivity from '~icons/tabler/activity'
  import IconBrain from '~icons/tabler/brain'
  import IconLoader2 from '~icons/tabler/loader-2'
  import IconSparkles from '~icons/tabler/sparkles'
  import IconUser from '~icons/tabler/user'
  import type { AgentMessageView } from '../agent-contracts.js'
  import { type AgentLocale, getAgentCopy } from '../agent-copy.js'
  import { renderAgentMarkdown } from '../render-agent-markdown.js'

  const props = defineProps<{
    message: AgentMessageView
    collapseReasoning: boolean
    locale: AgentLocale
  }>()
  const text = computed(() => getAgentCopy(props.locale))
  const html = computed(() => renderAgentMarkdown(props.message.content, props.message.citations))
  // 启用折叠后思考过程默认收起；否则流式输出期间默认展开。
  const reasoningOpen = computed(
    () => !props.collapseReasoning && props.message.status === 'streaming',
  )

  /** 打开当前消息中已验证来源的原始页面。 */
  function openCitation(event: MouseEvent): void {
    const target = event.target
    if (!(target instanceof Element)) return
    const id = target.closest<HTMLButtonElement>('[data-agent-citation-id]')?.dataset
      .agentCitationId
    const citation = props.message.citations?.find((item) => item.id === id)
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
  .message {
    min-width: 0;
    color: var(--agent-text);
  }

  .message--user {
    padding: 9px 10px;
    border-radius: 6px;
    background: var(--agent-user-message);
  }

  .message--action {
    display: flex;
    align-items: center;
    gap: 7px;
    color: var(--agent-muted);
    font-size: 11px;
  }

  .message__role,
  .message__action {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-bottom: 5px;
    color: var(--agent-muted);
    font-size: 11px;
    font-weight: 600;
  }

  .message--action .message__action {
    margin: 0;
  }

  .message__reasoning {
    color: var(--agent-text-soft);
    font-size: 12px;
  }

  .message__reasoning summary {
    display: flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
    color: var(--agent-muted);
    font-size: 11px;
    font-weight: 600;
  }

  .message__reasoning > .message__content {
    margin-top: 6px;
  }

  .message__content {
    margin: 0;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
    font-size: 13px;
    line-height: 1.52;
  }

  .message__content--markdown {
    white-space: normal;
  }

  .message__content--markdown :deep(p),
  .message__content--markdown :deep(ul),
  .message__content--markdown :deep(ol),
  .message__content--markdown :deep(pre),
  .message__content--markdown :deep(blockquote),
  .message__content--markdown :deep(table) {
    margin: 0 0 10px;
  }

  .message__content--markdown :deep(*:last-child) {
    margin-bottom: 0;
  }

  .message__content--markdown :deep(h1),
  .message__content--markdown :deep(h2),
  .message__content--markdown :deep(h3),
  .message__content--markdown :deep(h4),
  .message__content--markdown :deep(h5),
  .message__content--markdown :deep(h6) {
    margin: 14px 0 7px;
    color: var(--agent-text);
    line-height: 1.3;
  }

  .message__content--markdown :deep(h1) {
    font-size: 18px;
  }

  .message__content--markdown :deep(h2) {
    font-size: 16px;
  }

  .message__content--markdown :deep(h3),
  .message__content--markdown :deep(h4),
  .message__content--markdown :deep(h5),
  .message__content--markdown :deep(h6) {
    font-size: 14px;
  }

  .message__content--markdown :deep(ul),
  .message__content--markdown :deep(ol) {
    padding-left: 20px;
  }

  .message__content--markdown :deep(a) {
    color: var(--agent-accent);
  }

  .message__content--markdown :deep(.agent-citation) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    min-width: 15px;
    min-height: 15px;
    margin: 0 2px;
    padding: 0 4px;
    border: none;
    border-radius: 999px;
    color: var(--agent-text);
    background: var(--agent-control);
    font: inherit;
    font-size: 0.75em;
    font-variant-numeric: tabular-nums;
    line-height: 1;
    vertical-align: middle;
    cursor: pointer;
  }

  /* 相邻引用拼成一条灰色胶囊：仅最左/最右保留外侧圆角，中间为直角。 */
  .message__content--markdown :deep(.agent-citation--joined-left) {
    margin-left: 0;
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
  }

  .message__content--markdown :deep(.agent-citation--joined-right) {
    margin-right: 1px;
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }

  .message__content--markdown :deep(.agent-citation:hover) {
    box-shadow: inset 0 0 0 1px var(--agent-border-strong);
  }

  .message__content--markdown :deep(.agent-citation:focus-visible) {
    outline: 2px solid var(--agent-focus);
    outline-offset: 1px;
  }

  .message__content--markdown :deep(code) {
    padding: 1px 4px;
    border-radius: 3px;
    background: var(--agent-card);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.92em;
  }

  .message__content--markdown :deep(pre) {
    overflow-x: auto;
    padding: 9px;
    border-radius: 4px;
    background: var(--agent-card);
  }

  .message__content--markdown :deep(pre code) {
    padding: 0;
    background: none;
  }

  .message__content--markdown :deep(blockquote) {
    padding-left: 10px;
    border-left: 3px solid var(--agent-border);
    color: var(--agent-text-soft);
  }

  .message__content--markdown :deep(table) {
    display: block;
    max-width: 100%;
    overflow-x: auto;
    border-collapse: collapse;
  }

  .message__content--markdown :deep(th),
  .message__content--markdown :deep(td) {
    padding: 5px 7px;
    border: 1px solid var(--agent-border);
    text-align: left;
  }

  .message__content--markdown :deep(th) {
    background: var(--agent-card);
  }

  .message__spinner {
    animation: spin 850ms linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .message__spinner {
      animation: none;
    }
  }
</style>
