<!-- Agent 运行时不可用时的占位视图：说明原因并提供重试，独立于会话时间线。 -->
<template>
  <section
    class="agent-unavailable"
    role="alert"
    tabindex="-1"
    data-focus="availability"
  >
    <IconAlertTriangle aria-hidden="true" />
    <strong>{{ text.workspaceUnavailableTitle }}</strong>
    <p>{{ text.workspaceUnavailableBody }}</p>
    <p class="agent-unavailable__detail">{{ error.message }}</p>
    <button v-if="error.retryable" type="button" @click="emit('retry')">
      <IconRefresh aria-hidden="true" />
      {{ text.retry }}
    </button>
  </section>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import IconAlertTriangle from '~icons/tabler/alert-triangle'
  import IconRefresh from '~icons/tabler/refresh'
  import type { AgentErrorView } from '../agent-contracts.js'
  import { type AgentLocale, getAgentCopy } from '../agent-copy/index.js'

  const props = defineProps<{ error: AgentErrorView; locale: AgentLocale }>()
  const emit = defineEmits<{ retry: [] }>()

  const text = computed(() => getAgentCopy(props.locale))
</script>

<style scoped>
  .agent-unavailable {
    display: grid;
    justify-items: center;
    align-content: center;
    gap: var(--klc-space-8, 8px);
    padding: var(--klc-space-24, 24px);
    text-align: center;
  }
  .agent-unavailable > svg {
    width: var(--klc-space-24, 24px);
    height: var(--klc-space-24, 24px);
    color: var(--klc-color-ui-danger-text);
  }
  strong {
    font-size: var(--klc-text-13-font-size, 13px);
  }
  p {
    max-width: 32ch;
    margin: 0;
    font-size: var(--klc-text-12-font-size, 12px);
    line-height: 1.5;
    color: var(--klc-color-ui-text-soft);
  }
  .agent-unavailable__detail {
    color: var(--klc-color-ui-muted);
    font-size: var(--klc-text-12-font-size, 12px);
  }
  button {
    min-height: 30px;
    display: inline-flex;
    align-items: center;
    gap: var(--klc-space-4, 4px);
    padding: 0 var(--klc-space-12, 12px);
    border: 1px solid var(--klc-color-ui-border);
    border-radius: var(--agent-control-radius, var(--klc-radius-md, 8px));
    color: var(--klc-color-ui-text);
    background: var(--klc-color-ui-card);
    font: inherit;
    font-size: var(--klc-text-12-font-size, 12px);
    cursor: pointer;
  }
  button:hover {
    background: var(--klc-color-ui-hover);
  }
</style>
