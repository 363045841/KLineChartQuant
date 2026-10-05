<template>
  <span v-if="run.usage" class="run-status__usage">
      <span>{{ text.input }} {{ run.usage.inputTokens ?? 0 }} {{ text.tokens }}</span>
      <span>{{ text.output }} {{ run.usage.outputTokens ?? 0 }} {{ text.tokens }}</span>
      <strong>{{ text.total }} {{ (run.usage.inputTokens ?? 0) + (run.usage.outputTokens ?? 0) }} {{ text.tokens }}</strong>
  </span>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import type { AgentRunView } from '../agent-contracts.js'
  import { type AgentLocale, getAgentCopy } from '../agent-copy.js'

  const props = defineProps<{
    run: AgentRunView
    locale: AgentLocale
  }>()
  const text = computed(() => getAgentCopy(props.locale))
</script>

<style scoped>
  .run-status__usage {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    min-width: 0;
    color: var(--agent-muted);
    font-size: 10px;
    gap: 9px;
  }
  .run-status__usage span,
  .run-status__usage strong { white-space: nowrap; }
  .run-status__usage strong { color: var(--agent-text); }
</style>
