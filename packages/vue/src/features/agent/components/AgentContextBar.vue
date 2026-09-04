<template>
  <div class="context-bar">
    <div class="context-bar__chips" :aria-label="scopeLabel">
      <span v-if="symbolContext"
        >{{ symbolContext.value.symbol
        }}{{ symbolContext.value.name ? ` (${symbolContext.value.name})` : '' }}</span
      >
      <span v-if="rangeContext" class="context-bar__range">{{
        formatRange(rangeContext.value)
      }}</span>
    </div>
    <div class="context-bar__toggle" :title="text.readOnlyHint">
      <ToggleSwitch
        :model-value="readOnly"
        :aria-label="text.readOnly"
        size="compact"
        @update:model-value="$emit('read-only', $event)"
      />
      {{ text.readOnly }}
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'

  import ToggleSwitch from '../../../components/common/ToggleSwitch.vue'
  import { getAgentCopy, type AgentLocale } from '../agent-copy'

  import type {
    AgentChartSymbolContextItem,
    AgentContextItem,
    AgentSelectedTimeRangeContextItem,
  } from '../agent-contracts'

  const props = defineProps<{
    contextItems: ReadonlyArray<AgentContextItem>
    locale: AgentLocale
    readOnly: boolean
  }>()
  defineEmits<{ 'read-only': [value: boolean] }>()

  const text = computed(() => getAgentCopy(props.locale))
  const symbolContext = computed(() =>
    props.contextItems.find(
      (item): item is AgentChartSymbolContextItem => item.kind === 'chart-symbol',
    ),
  )
  const rangeContext = computed(() =>
    props.contextItems.find(
      (item): item is AgentSelectedTimeRangeContextItem => item.kind === 'selected-time-range',
    ),
  )
  const scopeLabel = computed(() => symbolContext.value?.value.symbol ?? text.value.noSymbol)

  function formatRange(range: AgentSelectedTimeRangeContextItem['value']): string {
    const format = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    return `${format.format(range.from)} - ${format.format(range.to)}`
  }
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
    flex-wrap: wrap;
    align-items: center;
    gap: 5px;
  }

  .context-bar__chips > span {
    min-width: max-content;
    padding: 3px 6px;
    border: 1px solid var(--agent-border);
    border-radius: 3px;
    white-space: nowrap;
  }

  .context-bar__range {
    flex: 0 0 auto;
  }

  .context-bar__toggle {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
  }
</style>
