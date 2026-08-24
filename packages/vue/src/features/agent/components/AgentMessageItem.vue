<template>
  <article class="message" :class="`message--${message.role}`">
    <div v-if="message.role === 'action'" class="message__action">
      <IconActivity aria-hidden="true" />
      <span>{{ text.action }}</span>
    </div>
    <div v-else class="message__role">
      <IconUser v-if="message.role === 'user'" aria-hidden="true" />
      <IconSparkles v-else aria-hidden="true" />
      <span>{{ message.role === 'user' ? 'You' : text.agent }}</span>
      <IconLoader2
        v-if="message.status === 'streaming'"
        class="message__spinner"
        aria-hidden="true"
      />
    </div>
    <p>{{ message.content }}</p>
  </article>
</template>

<script setup lang="ts">
  import { computed } from 'vue'

  import { getAgentCopy, type AgentLocale } from '../agent-copy'

  import type { AgentMessageView } from '../agent-contracts'

  import IconActivity from '~icons/tabler/activity'
  import IconLoader2 from '~icons/tabler/loader-2'
  import IconSparkles from '~icons/tabler/sparkles'
  import IconUser from '~icons/tabler/user'

  const props = defineProps<{ message: AgentMessageView; locale: AgentLocale }>()
  const text = computed(() => getAgentCopy(props.locale))
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

  p {
    margin: 0;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
    font-size: 13px;
    line-height: 1.52;
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
