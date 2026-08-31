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
      :open="message.status === 'streaming'"
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
    />
    <p v-else-if="message.role !== 'reasoning'" class="message__content">{{ message.content }}</p>
  </article>
</template>

<script setup lang="ts">
  import { computed } from 'vue'

  import { getAgentCopy, type AgentLocale } from '../agent-copy'
  import { renderAgentMarkdown } from '../render-agent-markdown'

  import type { AgentMessageView } from '../agent-contracts'

  import IconActivity from '~icons/tabler/activity'
  import IconBrain from '~icons/tabler/brain'
  import IconLoader2 from '~icons/tabler/loader-2'
  import IconSparkles from '~icons/tabler/sparkles'
  import IconUser from '~icons/tabler/user'

  const props = defineProps<{ message: AgentMessageView; locale: AgentLocale }>()
  const text = computed(() => getAgentCopy(props.locale))
  const html = computed(() => renderAgentMarkdown(props.message.content))
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
    border-left: 3px solid var(--agent-border-strong);
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
