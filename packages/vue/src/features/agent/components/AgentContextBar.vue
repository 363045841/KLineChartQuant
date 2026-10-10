<template>
  <div class="context-bar">
    <BaseTooltip :content="text.readOnlyHint" placement="top" trigger-display="contents">
      <div class="context-bar__pill context-bar__readonly">
        {{ text.readOnly }}
        <ToggleSwitch
          :model-value="readOnly"
          :aria-label="text.readOnly"
          size="compact"
          @update:model-value="$emit('read-only', $event)"
        />
      </div>
    </BaseTooltip>
    <div v-if="symbolContext || rangeContext" class="context-bar__chips" :aria-label="scopeLabel">
      <span v-if="symbolContext" class="context-bar__pill context-bar__symbol"
        ><span class="context-bar__text">{{ symbolContext.value.symbol
        }}{{ symbolContext.value.name ? ` - ${symbolContext.value.name}` : '' }}</span></span
      >
      <BaseTooltip
        v-if="rangeContext"
        class="context-bar__range"
        :content="`${rangeContext.value.from} - ${rangeContext.value.to}`"
        placement="top"
      >
        <span class="context-bar__pill context-bar__range-text" tabindex="0">
          <span class="context-bar__text">{{ rangeContext.value.from }} - {{ rangeContext.value.to }}</span>
        </span>
      </BaseTooltip>
    </div>
    <AgentContextInjectionCard :context-items="contextItems" :locale="locale" />
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import BaseTooltip from '../../../components/common/BaseTooltip.vue'
  import ToggleSwitch from '../../../components/common/ToggleSwitch.vue'
  import type {
    AgentChartSymbolContextItem,
    AgentContextItem,
    AgentSelectedTimeRangeContextItem,
  } from '../agent-contracts.js'
  import { type AgentLocale, getAgentCopy } from '../agent-copy.js'
  import AgentContextInjectionCard from './AgentContextInjectionCard.vue'

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
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    color: var(--agent-muted);
    font-size: 11px;
  }

  .context-bar__chips {
    display: contents;
  }

  .context-bar__pill {
    min-width: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    gap: 4px;
    padding: 3px 8px;
    border: 0;
    border-radius: var(--agent-control-radius, 8px);
    background: var(--klc-color-agent-composer-input-background);
    white-space: nowrap;
  }

  .context-bar__range {
    flex: 0 1 auto;
    max-width: 100%;
    min-width: 0;
    overflow: hidden;
  }

  .context-bar__range-text {
    width: 100%;
    min-width: 0;
  }

  .context-bar__readonly {
    order: -2;
    flex: 0 0 auto;
    color: var(--agent-muted);
    gap: 6px;
    border: 0;
    background: var(--klc-color-agent-composer-input-background);
  }

  .context-bar__symbol {
    flex: 0 1 auto;
    max-width: 100%;
  }

  .context-bar__text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .context-bar :deep(.injection-card__summary) {
    order: 0;
    flex: 0 0 26px;
  }

  .context-bar :deep(.injection-card__content) {
    order: 1;
    flex: 0 0 100%;
  }

  .context-bar__pill {
    box-sizing: border-box;
    min-height: 26px;
  }

</style>
