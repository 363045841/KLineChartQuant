<template>
  <div class="context-bar">
    <div v-if="symbolContext || rangeContext" class="context-bar__chips" :aria-label="scopeLabel">
      <span v-if="symbolContext" class="context-bar__pill"
        >{{ symbolContext.value.symbol
        }}{{ symbolContext.value.name ? ` (${symbolContext.value.name})` : '' }}</span
      >
      <span v-if="rangeContext" class="context-bar__pill context-bar__range"
        >{{ rangeContext.value.from }} - {{ rangeContext.value.to }}</span
      >
    </div>
    <div
      class="context-bar__pill context-bar__readonly"
      :title="text.readOnlyHint"
    >
      {{ text.readOnly }}
      <ToggleSwitch
        :model-value="readOnly"
        :aria-label="text.readOnly"
        size="compact"
        @update:model-value="$emit('read-only', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'

  import ToggleSwitch from '../../../components/common/ToggleSwitch.vue'
  import type {
    AgentChartSymbolContextItem,
    AgentContextItem,
    AgentSelectedTimeRangeContextItem,
  } from '../agent-contracts.js'
  import { type AgentLocale, getAgentCopy } from '../agent-copy.js'

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
</script>

<style scoped>
  .context-bar {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    flex-wrap: wrap;
    gap: 8px;
    padding: 8px 12px;
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

  .context-bar__pill {
    min-width: max-content;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    border: 1px solid var(--agent-border);
    border-radius: var(--agent-control-radius, 8px);
    background: var(--agent-control);
    white-space: nowrap;
  }

  .context-bar__range {
    flex: 0 0 auto;
  }

  .context-bar__readonly {
    flex: 0 0 auto;
    color: var(--agent-muted);
    gap: 6px;
    border: 0;
    background: var(--klc-color-agent-composer-input-background);
  }

  .context-bar__pill {
    box-sizing: border-box;
    min-height: 26px;
  }

</style>
