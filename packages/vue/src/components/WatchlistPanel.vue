<!-- TopBar 自选股入口与浮动面板。 -->
<template>
  <div>
    <BaseTooltip content="自选股" placement="bottom" :disabled="open">
      <button
        ref="triggerRef"
        type="button"
        class="watchlist-trigger"
        aria-label="自选股"
        aria-haspopup="dialog"
        :aria-expanded="open"
        @click="toggle"
      >
        <IconBookmark aria-hidden="true" />
      </button>
    </BaseTooltip>
  </div>
  <Teleport :to="teleportTarget">
    <section
      v-if="open"
      ref="popupRef"
      class="watchlist-panel"
      :style="{ ...popupStyle, zIndex: 1010 }"
      role="dialog"
      aria-label="自选股"
      tabindex="-1"
      @keydown.esc.stop.prevent="close(true)"
    >
      <header class="watchlist-panel__header">
        <span>自选股</span>
        <span class="watchlist-panel__count">{{ items.length }}</span>
      </header>
      <div v-if="items.length === 0" class="watchlist-panel__empty">暂无自选股</div>
      <div v-else class="watchlist-panel__list">
        <div
          v-for="item in items"
          :key="symbolIdentityKey(item)"
          class="watchlist-panel__item"
          :class="{ 'is-active': symbolIdentityKey(item) === activeKey }"
        >
          <button type="button" class="watchlist-panel__select" @click="select(item)">
            <span class="watchlist-panel__symbol">{{ item.symbol }}</span>
            <span class="watchlist-panel__name">{{ item.name }}</span>
            <span class="watchlist-panel__meta">{{ item.exchange }}</span>
          </button>
          <BaseTooltip content="移除自选" placement="bottom">
            <button
              type="button"
              class="watchlist-panel__remove"
              :aria-label="`移除自选 ${item.symbol}`"
              @click="emit('remove', item)"
            >
              <IconX aria-hidden="true" />
            </button>
          </BaseTooltip>
        </div>
      </div>
    </section>
  </Teleport>
</template>

<script setup lang="ts">
  import { nextTick, onBeforeUnmount, ref } from 'vue'
  import IconBookmark from '~icons/tabler/bookmark'
  import IconX from '~icons/tabler/x'
  import { useClickOutside } from '../composables/useClickOutside.js'
  import { useFullscreenTeleportTarget } from '../composables/useFullscreenTeleportTarget.js'
  import { symbolIdentityKey, type SearchableSymbol } from '../composables/useSymbolSearch.js'
  import { useTeleportedPopup } from '../composables/useTeleportedPopup.js'
  import BaseTooltip from './common/BaseTooltip.vue'

  defineProps<{ items: ReadonlyArray<SearchableSymbol>; activeKey?: string }>()
  const emit = defineEmits<{
    select: [item: SearchableSymbol]
    remove: [item: SearchableSymbol]
  }>()
  const open = ref(false)
  const triggerRef = ref<HTMLElement | null>(null)
  const popupRef = ref<HTMLElement | null>(null)
  const teleportTarget = useFullscreenTeleportTarget()
  const { popupStyle, startPositionSync, stopPositionSync } = useTeleportedPopup(
    triggerRef,
    popupRef,
    4,
    false,
    'bottom',
  )
  useClickOutside(() => [triggerRef.value, popupRef.value], () => close(), {
    enabled: () => open.value,
  })

  function close(restoreFocus = false): void {
    open.value = false
    stopPositionSync()
    if (restoreFocus) triggerRef.value?.focus()
  }

  function toggle(): void {
    if (open.value) {
      close()
      return
    }
    open.value = true
    startPositionSync()
    void nextTick(() => {
      if (!open.value) return
      const target = popupRef.value?.querySelector<HTMLButtonElement>('button') ?? popupRef.value
      target?.focus()
    })
  }

  function select(item: SearchableSymbol): void {
    emit('select', item)
    close(true)
  }

  onBeforeUnmount(stopPositionSync)
</script>

<style scoped>
  .watchlist-trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    padding: 0;
    border: 0;
    border-radius: 4px;
    color: var(--klc-color-ui-muted);
    background: transparent;
    cursor: pointer;
  }

  .watchlist-trigger:hover,
  .watchlist-trigger[aria-expanded='true'] {
    background: var(--klc-color-ui-hover);
  }

  .watchlist-trigger svg {
    width: 18px;
    height: 18px;
  }

  .watchlist-panel {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    width: min(280px, calc(100vw - 16px));
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 8px;
    background: var(--klc-color-ui-surface);
    color: var(--klc-color-ui-text);
    overflow: hidden;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  }

  .watchlist-panel__header {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 40px;
    flex: 0 0 auto;
    padding: 0 12px;
    border-bottom: 1px solid var(--klc-color-ui-border);
    font-size: 13px;
    font-weight: 600;
  }

  .watchlist-panel__count {
    color: var(--klc-color-ui-muted);
    font-size: 11px;
  }

  .watchlist-panel__empty {
    padding: 24px 12px;
    text-align: center;
    color: var(--klc-color-ui-muted);
    font-size: 12px;
  }

  .watchlist-panel__list {
    min-height: 0;
    max-height: 400px;
    overflow-y: auto;
  }

  .watchlist-panel__item {
    display: flex;
    align-items: center;
    border-bottom: 1px solid var(--klc-color-ui-border);
  }

  .watchlist-panel__item:last-child {
    border-bottom: 0;
  }

  .watchlist-panel__item:hover,
  .watchlist-panel__item.is-active {
    background: var(--klc-color-ui-hover);
  }

  .watchlist-panel__select {
    min-width: 0;
    flex: 1;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 2px 8px;
    padding: 10px 6px 10px 12px;
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font: inherit;
    text-align: left;
  }

  .watchlist-panel__symbol,
  .watchlist-panel__name,
  .watchlist-panel__meta {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .watchlist-panel__symbol {
    font-size: 13px;
    font-weight: 600;
  }

  .watchlist-panel__name,
  .watchlist-panel__meta {
    color: var(--klc-color-ui-muted);
    font-size: 11px;
  }

  .watchlist-panel__name {
    grid-column: 1;
  }

  .watchlist-panel__meta {
    grid-column: 2;
    grid-row: 1 / span 2;
    align-self: center;
    max-width: 64px;
  }

  .watchlist-panel__remove {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    margin-right: 8px;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--klc-color-ui-muted);
    cursor: pointer;
  }

  .watchlist-panel__remove:hover {
    color: var(--klc-color-ui-text);
  }

  .watchlist-panel__remove svg {
    width: 15px;
    height: 15px;
  }
</style>
