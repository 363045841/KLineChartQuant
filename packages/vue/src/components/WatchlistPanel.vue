<!-- 自选股侧栏，展示并切换用户收藏的品种。 -->
<template>
  <aside class="watchlist-panel" :class="{ 'is-collapsed': isCollapsed }" aria-label="自选股">
    <div class="watchlist-panel__header">
      <div class="watchlist-panel__title">
        <span>自选股</span>
        <span class="watchlist-panel__count">{{ items.length }}</span>
      </div>
      <button
        type="button"
        class="watchlist-panel__toggle"
        :title="isCollapsed ? '展开自选股' : '收起自选股'"
        :aria-label="isCollapsed ? '展开自选股' : '收起自选股'"
        @click="isCollapsed = !isCollapsed"
      >
        <IconTablerChevronLeft v-if="!isCollapsed" aria-hidden="true" />
        <IconTablerChevronRight v-else aria-hidden="true" />
      </button>
    </div>
    <div v-if="!isCollapsed && items.length === 0" class="watchlist-panel__empty">暂无自选股</div>
    <div v-else-if="!isCollapsed" class="watchlist-panel__list">
      <div
        v-for="item in items"
        :key="symbolIdentityKey(item)"
        class="watchlist-panel__item"
        :class="{ 'is-active': symbolIdentityKey(item) === activeKey }"
      >
        <button
          type="button"
          class="watchlist-panel__select"
          :title="`${item.symbol} - ${item.name}`"
          @click="emit('select', item)"
        >
          <span class="watchlist-panel__symbol">{{ item.symbol }}</span>
          <span class="watchlist-panel__name">{{ item.name }}</span>
          <span class="watchlist-panel__meta">{{ item.exchange }}</span>
        </button>
        <button
          type="button"
          class="watchlist-panel__remove"
          title="移除自选"
          aria-label="移除自选"
          @click="emit('remove', item)"
        >
          <IconTablerX aria-hidden="true" />
        </button>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import type { SearchableSymbol } from '../composables/useSymbolSearch'
  import { symbolIdentityKey } from '../composables/useSymbolSearch'
  import IconTablerChevronLeft from '~icons/tabler/chevron-left'
  import IconTablerChevronRight from '~icons/tabler/chevron-right'
  import IconTablerX from '~icons/tabler/x'

  defineProps<{
    items: ReadonlyArray<SearchableSymbol>
    activeKey?: string
  }>()

  const emit = defineEmits<{
    (e: 'select', item: SearchableSymbol): void
    (e: 'remove', item: SearchableSymbol): void
  }>()

  const isCollapsed = ref(false)
</script>

<style scoped>
  .watchlist-panel {
    flex: 0 0 208px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--klc-color-border-chart);
    border-radius: 3px;
    background: var(--klc-color-background);
    color: var(--klc-color-foreground);
    overflow: hidden;
    transition: flex-basis 0.15s ease;
  }

  .watchlist-panel.is-collapsed {
    flex-basis: 40px;
  }

  .watchlist-panel__header {
    position: relative;
    height: 40px;
    flex: 0 0 auto;
    padding: 0 10px;
    border-bottom: 1px solid var(--klc-color-border-chart);
    font-size: 13px;
    font-weight: 600;
  }

  .watchlist-panel.is-collapsed .watchlist-panel__header {
    border-bottom: 0;
  }

  .watchlist-panel__toggle {
    position: absolute;
    top: 50%;
    right: 5px;
    transform: translateY(-50%);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 4px;
    background: transparent;
    color: var(--klc-color-axis-text);
    cursor: pointer;
  }

  .watchlist-panel__toggle:hover {
    border-color: var(--klc-color-border-button);
    background: var(--klc-color-grid-minor);
    color: var(--klc-color-foreground);
  }

  .watchlist-panel__toggle svg {
    width: 16px;
    height: 16px;
  }

  .watchlist-panel__count {
    color: var(--klc-color-axis-text);
    font-size: 11px;
    font-weight: 500;
  }

  .watchlist-panel__title {
    position: absolute;
    top: 50%;
    left: 10px;
    transform: translateY(-50%);
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }

  .watchlist-panel.is-collapsed .watchlist-panel__title {
    visibility: hidden;
  }

  .watchlist-panel__empty {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    padding: 20px 10px;
    color: var(--klc-color-axis-text);
    font-size: 12px;
  }

  .watchlist-panel__list {
    display: flex;
    flex: 1;
    flex-direction: column;
    overflow-y: auto;
  }

  .watchlist-panel__item {
    display: flex;
    align-items: center;
    min-width: 0;
    border-bottom: 1px solid var(--klc-color-grid-minor);
  }

  .watchlist-panel__item:hover,
  .watchlist-panel__item.is-active {
    background: var(--klc-color-grid-minor);
  }

  .watchlist-panel__select {
    min-width: 0;
    flex: 1 1 auto;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 2px 8px;
    padding: 9px 4px 9px 10px;
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font: inherit;
    text-align: left;
  }

  .watchlist-panel__symbol {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
    font-weight: 700;
  }

  .watchlist-panel__name,
  .watchlist-panel__meta {
    overflow: hidden;
    color: var(--klc-color-axis-text);
    font-size: 11px;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .watchlist-panel__name {
    grid-column: 1;
  }

  .watchlist-panel__meta {
    grid-column: 2;
    grid-row: 1 / span 2;
    align-self: center;
    max-width: 52px;
  }

  .watchlist-panel__remove {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    margin-right: 6px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 4px;
    background: transparent;
    color: var(--klc-color-axis-text);
    cursor: pointer;
  }

  .watchlist-panel__remove:hover {
    border-color: var(--klc-color-border-button);
    color: var(--klc-color-foreground);
  }

  .watchlist-panel__remove svg {
    width: 15px;
    height: 15px;
  }

  @media (max-width: 768px), (max-height: 640px) {
    .watchlist-panel {
      flex-basis: 152px;
    }
  }
</style>
