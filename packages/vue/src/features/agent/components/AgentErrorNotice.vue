<template>
  <section class="error-notice" role="alert" tabindex="-1" data-focus="error">
    <IconAlertTriangle aria-hidden="true" />
    <div class="error-notice__body">
      <strong>{{ error.code }}</strong>
      <p>{{ error.message }}</p>
      <span v-if="error.recommendedAction">
        {{ text.recommended }}: {{ error.recommendedAction }}
      </span>
    </div>
    <button v-if="error.retryable" type="button" @click="$emit('retry')">
      <IconRefresh aria-hidden="true" />
      {{ text.retry }}
    </button>
  </section>
</template>

<script setup lang="ts">
  import { computed } from 'vue'

  import { getAgentCopy, type AgentLocale } from '../agent-copy'

  import type { AgentErrorView } from '../agent-contracts'

  import IconAlertTriangle from '~icons/tabler/alert-triangle'
  import IconRefresh from '~icons/tabler/refresh'

  const props = defineProps<{ error: AgentErrorView; locale: AgentLocale }>()
  defineEmits<{ retry: [] }>()
  const text = computed(() => getAgentCopy(props.locale))
</script>

<style scoped>
  .error-notice {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: start;
    gap: 8px;
    padding: 10px;
    border: 1px solid var(--klc-color-agent-danger-border);
    border-radius: 6px;
    color: var(--agent-text);
    background: var(--agent-danger-bg);
  }
  .error-notice > svg {
    color: var(--klc-color-agent-danger-text);
  }
  .error-notice__body {
    min-width: 0;
    display: grid;
    gap: 3px;
  }
  strong {
    overflow-wrap: anywhere;
    font-size: 11px;
  }
  p {
    margin: 0;
    overflow-wrap: anywhere;
    font-size: 12px;
    line-height: 1.4;
  }
  span {
    color: var(--agent-muted);
    font-size: 10px;
  }
  button {
    min-height: 28px;
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
</style>
