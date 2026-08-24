<template>
  <div class="context-bar">
    <div class="context-bar__chips" :aria-label="scopeLabel">
      <span>{{ context.symbol ?? text.noSymbol }}</span>
      <span>{{ context.period ?? text.noPeriod }}</span>
      <span class="context-bar__range">{{ context.visibleRange ?? text.noRange }}</span>
    </div>
    <label class="context-bar__toggle" :title="text.readOnlyHint">
      <input
        type="checkbox"
        :checked="context.readOnly"
        @change="$emit('read-only', ($event.target as HTMLInputElement).checked)"
      />
      <span aria-hidden="true"></span>
      {{ text.readOnly }}
    </label>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'

  import { getAgentCopy, type AgentLocale } from '../agent-copy'

  import type { ChartContextView } from '../agent-contracts'

  const props = defineProps<{ context: ChartContextView; locale: AgentLocale }>()
  defineEmits<{ 'read-only': [value: boolean] }>()

  const text = computed(() => getAgentCopy(props.locale))
  const scopeLabel = computed(
    () =>
      `${props.context.symbol ?? text.value.noSymbol}, ${props.context.period ?? text.value.noPeriod}`,
  )
</script>

<style scoped>
  .context-bar {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 7px 12px;
    border-top: 1px solid var(--agent-border);
    background: var(--agent-surface);
    color: var(--agent-muted);
    font-size: 11px;
  }

  .context-bar__chips {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 5px;
    overflow: hidden;
  }

  .context-bar__chips > span {
    min-width: 0;
    padding: 3px 6px;
    border: 1px solid var(--agent-border);
    border-radius: 3px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .context-bar__range {
    flex: 1 1 auto;
  }

  .context-bar__toggle {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
  }

  .context-bar__toggle input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .context-bar__toggle span {
    width: 24px;
    height: 14px;
    position: relative;
    border-radius: 7px;
    background: var(--agent-border-strong);
  }

  .context-bar__toggle span::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: white;
    transition: transform 120ms ease;
  }

  .context-bar__toggle input:checked + span {
    background: var(--agent-accent);
  }

  .context-bar__toggle input:checked + span::after {
    transform: translateX(10px);
  }

  .context-bar__toggle input:focus-visible + span {
    outline: 2px solid var(--agent-focus);
    outline-offset: 2px;
  }
</style>
