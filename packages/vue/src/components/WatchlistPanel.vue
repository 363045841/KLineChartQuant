<!-- 自选股侧栏，展示并切换用户收藏的品种。 -->
<template>
  <aside
    class="watchlist-panel"
    :class="{ 'is-collapsed': isCollapsed, 'is-animating': isAnimating }"
    aria-label="自选股"
  >
    <div
      class="watchlist-panel__surface"
      :aria-hidden="isCollapsed"
      :inert="isCollapsed"
      @transitionend="onSurfaceTransitionEnd"
    >
      <div class="watchlist-panel__header">
        <div class="watchlist-panel__title">
          <span>自选股</span>
          <span class="watchlist-panel__count">{{ items.length }}</span>
        </div>
      </div>
      <div v-if="items.length === 0" class="watchlist-panel__empty">暂无自选股</div>
      <div v-else class="watchlist-panel__list">
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
    </div>
    <button
      type="button"
      class="watchlist-panel__toggle"
      :title="isCollapsed ? '展开自选股' : '收起自选股'"
      :aria-label="isCollapsed ? '展开自选股' : '收起自选股'"
      @click="toggleCollapsed"
    >
      <IconTablerChevronLeft v-if="!isCollapsed" aria-hidden="true" />
      <IconTablerChevronRight v-else aria-hidden="true" />
    </button>
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
  // 动画期间临时放开 overflow 与堆叠，避免内容 surface 被 40px 轨道裁切。
  const isAnimating = ref(false)

  /** 切换折叠：轨道宽度瞬间到位，内容 surface 仅做 transform 滑出/滑入。 */
  function toggleCollapsed(): void {
    isCollapsed.value = !isCollapsed.value
    isAnimating.value = true
  }

  /** surface 的 transform 过渡结束后恢复静态裁剪，防止越界绘制。 */
  function onSurfaceTransitionEnd(event: TransitionEvent): void {
    if (event.target !== event.currentTarget || event.propertyName !== 'transform') return
    isAnimating.value = false
  }
</script>

<style scoped>
  .watchlist-panel,
  .watchlist-panel__surface {
    box-sizing: border-box;
  }

  /* 折叠轨道宽度瞬间到位；内容位移全部交给 compositor，避免逐帧触发图表 resize。 */
  .watchlist-panel {
    --watchlist-panel-expanded-width: 208px;
    --watchlist-panel-collapsed-width: 40px;

    position: relative;
    flex: 0 0 var(--watchlist-panel-expanded-width);
    min-width: 0;
    overflow: hidden;
  }

  /* 收起后仅剩 40px 轨道可见，由轨道自身提供边框与底色。 */
  .watchlist-panel.is-collapsed {
    flex: 0 0 var(--watchlist-panel-collapsed-width);
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 3px;
    background: var(--klc-color-ui-surface);
  }

  /* 动画期间 surface 比 40px 轨道宽，临时放开裁剪；层叠交由 DOM 顺序决定，不抬高 z-index。 */
  .watchlist-panel.is-animating {
    overflow: visible;
  }

  .watchlist-panel__surface {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 1;
    display: flex;
    flex-direction: column;
    width: var(--watchlist-panel-expanded-width);
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 3px;
    background: var(--klc-color-ui-surface);
    color: var(--klc-color-ui-text);
    overflow: hidden;
    transition: transform 0.15s ease;
    will-change: transform;
  }

  .watchlist-panel.is-collapsed .watchlist-panel__surface {
    transform: translateX(100%);
  }

  .watchlist-panel__header {
    position: relative;
    height: 40px;
    flex: 0 0 auto;
    padding: 0 10px;
    border-bottom: 1px solid var(--klc-color-ui-border);
    font-size: 13px;
    font-weight: 600;
  }

  .watchlist-panel__toggle {
    position: absolute;
    top: 20px;
    right: 5px;
    z-index: 2;
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
    color: var(--klc-color-ui-muted);
    cursor: pointer;
  }

  .watchlist-panel__toggle:hover {
    border-color: var(--klc-color-ui-border);
    background: var(--klc-color-ui-hover);
    color: var(--klc-color-ui-text);
  }

  .watchlist-panel__toggle svg {
    width: 16px;
    height: 16px;
  }

  .watchlist-panel__count {
    color: var(--klc-color-ui-muted);
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

  .watchlist-panel__empty {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    padding: 20px 10px;
    color: var(--klc-color-ui-muted);
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
    border-bottom: 1px solid var(--klc-color-ui-border);
  }

  .watchlist-panel__item:hover,
  .watchlist-panel__item.is-active {
    background: var(--klc-color-ui-hover);
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
    color: var(--klc-color-ui-muted);
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
    color: var(--klc-color-ui-muted);
    cursor: pointer;
  }

  .watchlist-panel__remove:hover {
    border-color: var(--klc-color-ui-border);
    color: var(--klc-color-ui-text);
  }

  .watchlist-panel__remove svg {
    width: 15px;
    height: 15px;
  }
</style>
