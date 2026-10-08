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
    <p>{{ body }}</p>
    <p v-if="!locked" class="agent-unavailable__detail">{{ error.message }}</p>
    <button v-if="error.retryable" type="button" @click="$emit('retry')">
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
  import { type AgentLocale, getAgentCopy } from '../agent-copy.js'

  const props = defineProps<{ error: AgentErrorView; locale: AgentLocale }>()
  defineEmits<{ retry: [] }>()

  const text = computed(() => getAgentCopy(props.locale))
  // 独占写锁冲突有专门文案；其他启动失败回退到通用说明。
  const locked = computed(() => props.error.code === 'SESSION_LOCKED')
  const body = computed(() =>
    locked.value ? text.value.workspaceLockedBody : text.value.workspaceUnavailableBody,
  )
</script>

<style scoped>
  .agent-unavailable {
    display: grid;
    justify-items: center;
    align-content: center;
    gap: 10px;
    padding: 24px;
    text-align: center;
  }
  .agent-unavailable > svg {
    width: 24px;
    height: 24px;
    color: var(--klc-color-ui-danger-text);
  }
  strong {
    font-size: 13px;
  }
  p {
    max-width: 32ch;
    margin: 0;
    font-size: 12px;
    line-height: 1.5;
    color: var(--agent-text-soft);
  }
  .agent-unavailable__detail {
    color: var(--agent-muted);
    font-size: 11px;
  }
  button {
    min-height: 30px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 12px;
    border: 1px solid var(--agent-border);
    border-radius: 6px;
    color: var(--agent-text);
    background: var(--agent-input);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  button:hover {
    background: var(--agent-hover);
  }
</style>
