<template>
  <div class="context-bar">
    <div class="context-bar__chips" :aria-label="scopeLabel">
      <span>{{ context.symbol ?? text.noSymbol }}</span>
      <span>{{ context.period ?? text.noPeriod }}</span>
      <span class="context-bar__range">{{ context.visibleRange ?? text.noRange }}</span>
    </div>
    <div class="context-bar__toggle" :title="text.readOnlyHint">
      <ToggleSwitch
        :model-value="context.readOnly"
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
</style>
