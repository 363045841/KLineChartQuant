<template>
  <div class="context-bar">
    <span v-if="symbolContext" class="context-bar__pill context-bar__symbol agent-raised-surface"
      ><span class="context-bar__text truncate-text">{{ symbolContext.value.symbol
      }}{{ symbolContext.value.name ? ` - ${symbolContext.value.name}` : '' }}</span></span
    >
    <BaseTooltip
      v-if="rangeContext"
      class="context-bar__range"
      :content="`${rangeContext.value.from} - ${rangeContext.value.to}`"
      placement="top"
    >
      <span class="context-bar__pill context-bar__range-text agent-raised-surface" tabindex="0">
        <span class="context-bar__text truncate-text"
          >{{ rangeContext.value.from }} - {{ rangeContext.value.to }}</span
        >
      </span>
    </BaseTooltip>
    <AgentContextInjectionCard :context-items="contextItems" :locale="locale" />
  </div>
</template>

<script setup lang="ts">
  import '@vue-src/components/common/truncate-text.css'
  import './agent-surface.css'

  import BaseTooltip from '@vue-src/components/common/overlay/BaseTooltip.vue'
  import { computed } from 'vue'
  import type {
    AgentChartSymbolContextItem,
    AgentContextItem,
    AgentSelectedTimeRangeContextItem,
  } from '../agent-contracts.js'
  import { type AgentLocale } from '../agent-copy/index.js'
  import AgentContextInjectionCard from './AgentContextInjectionCard.vue'

  const props = defineProps<{
    contextItems: ReadonlyArray<AgentContextItem>
    locale: AgentLocale
  }>()

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
</script>

<style scoped>
  /* 悬浮在输入区上沿的胶囊条：自身透明、宽度随内容收缩，空白处不属于这一层。
     共享几何（内边距、胶囊高度）来自 .agent-workspace 的局部变量。 */
  .context-bar {
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--klc-space-8, 8px);
    padding: var(--agent-bar-pad, 8px) var(--agent-gutter, 12px);
    color: var(--klc-color-ui-muted);
    font-size: var(--klc-text-12-font-size, 12px);
    line-height: var(--klc-text-12-line-height, 16px);
    background-color: transparent;
  }

  .context-bar__pill {
    min-width: 0;
    min-height: var(--agent-chip-height, 26px);
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    gap: var(--klc-space-4, 4px);
    padding: 3px var(--klc-space-8, 8px);
    white-space: nowrap;
    /* 材质来自 .agent-raised-surface。 */
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

  .context-bar__symbol {
    flex: 0 1 auto;
    max-width: 100%;
  }
</style>
