<template>
  <div ref="chipWrapRef" class="symbol-chip-wrap">
    <button
      type="button"
      class="symbol-chip"
      :class="{ 'is-open': showPopup }"
      :title="displayText"
      :aria-expanded="showPopup"
      aria-haspopup="dialog"
      @click="togglePopup"
    >
      <span class="symbol-chip__code">{{ displayText }}</span>
      <span v-if="loading && !retrying" class="symbol-chip__spinner" aria-hidden="true" />
      <span
        v-else-if="error || retrying"
        class="symbol-chip__error"
        :title="errorTagText"
        role="status"
      >
        <IconTablerAlertTriangle class="symbol-chip__warn" aria-hidden="true" />
        <span class="symbol-chip__error-text">{{ errorTagText }}</span>
      </span>
    </button>
    <Teleport :to="teleportTarget">
      <Transition name="symbol-popover">
        <div
          v-if="showPopup"
          ref="popupRef"
          class="symbol-popover"
          :style="popupStyle"
          role="dialog"
          aria-label="切换合约"
        >
          <AggregationSourceTabs
            v-if="sourceTabs.length > 0"
            v-model="activeSourceTab"
            :tabs="sourceTabs"
          />
          <div class="symbol-search">
            <span class="symbol-search__icon" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" stroke-width="1.6" />
                <line
                  x1="10.5"
                  y1="10.5"
                  x2="14.5"
                  y2="14.5"
                  stroke="currentColor"
                  stroke-width="1.6"
                  stroke-linecap="round"
                />
              </svg>
            </span>
            <input
              ref="searchInputRef"
              v-model="searchQuery"
              class="symbol-search__input"
              type="text"
              placeholder="搜索代码或名称…"
              autocomplete="off"
              spellcheck="false"
              aria-label="搜索商品"
            />
            <button
              v-if="searchQuery"
              type="button"
              class="symbol-search__clear"
              aria-label="清空搜索"
              @click="clearSearch"
            >
              <svg
                class="delete-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M3 6h18" />
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
            </button>
            <AggregationSourceButton @click="emit('manageSources')" />
          </div>

          <div class="symbol-list" role="listbox" aria-label="商品列表">
            <div v-if="searchLoading" class="symbol-list__empty">
              <span class="symbol-chip__spinner" aria-hidden="true" />
              <span>正在搜索</span>
            </div>
            <div v-else-if="filteredSymbols.length === 0" class="symbol-list__empty">
              <svg
                width="32"
                height="32"
                viewBox="0 0 32 32"
                fill="none"
                style="margin-bottom: 8px; opacity: 0.35"
              >
                <circle cx="13" cy="13" r="10" stroke="currentColor" stroke-width="2" />
                <line
                  x1="21"
                  y1="21"
                  x2="29"
                  y2="29"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                />
              </svg>
              <span>{{ searchError ? '搜索失败' : '未找到相关商品' }}</span>
            </div>
            <div
              v-for="item in filteredSymbols"
              :key="symbolIdentityKey(item)"
              class="symbol-list__item"
              :class="{ 'is-active': symbolIdentityKey(item) === selectedKey }"
              role="option"
              :aria-selected="symbolIdentityKey(item) === selectedKey"
            >
              <button type="button" class="symbol-list__select" @click="selectSymbol(item)">
                <span class="symbol-list__left">
                  <span class="symbol-list__code">{{ item.symbol }}</span>
                  <span class="symbol-list__desc">{{ item.name }}</span>
                </span>
                <span class="symbol-list__exchange">{{ formatSymbolMeta(item) }}</span>
              </button>
              <button
                v-if="!watchlistKeys.has(symbolIdentityKey(item))"
                type="button"
                class="symbol-list__add"
                title="添加自选"
                aria-label="添加自选"
                @click.stop="emit('addWatchlist', item)"
              >
                <IconTablerPlus aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
  import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'

  import { useFullscreenTeleportTarget } from '../composables/useFullscreenTeleportTarget'
  import {
    useSymbolSearch,
    symbolIdentityKey,
    type SearchableSymbol,
    type SymbolSearchFn,
  } from '../composables/useSymbolSearch'
  import {
    isMockSourceName,
    supportsAggregationSourceSearch,
    type AggregationSourceDefinition,
  } from '../composables/useAggregationSources'
  import { useAggregationSourceTab } from '../composables/useAggregationSourceTab'
  import { useTeleportedPopup } from '../composables/useTeleportedPopup'

  import AggregationSourceButton from './AggregationSourceButton.vue'
  import AggregationSourceTabs, { type AggregationSourceTabItem } from './AggregationSourceTabs.vue'
  import IconTablerAlertTriangle from '~icons/tabler/alert-triangle'
  import IconTablerPlus from '~icons/tabler/plus'

  export type SymbolItem = SearchableSymbol

  const props = withDefaults(
    defineProps<{
      symbol: string
      selectedItem?: SymbolItem
      symbols: SymbolItem[]
      search?: SymbolSearchFn<SymbolItem>
      loading?: boolean
      error?: boolean
      /** 加载中已有本轮失败信息时显示重试提示。 */
      retrying?: boolean
      /** 主品种拉取失败原因；与 error 同时为真时作为 chip title */
      errorMessage?: string
      /** 已注册数据源，用于 Tabs 展示名 */
      aggregationSources?: ReadonlyArray<AggregationSourceDefinition>
      /** 已启用的搜索源名称 */
      enabledSourceNames?: ReadonlySet<string>
      /** 已加入自选股的品种身份 */
      watchlistKeys?: ReadonlySet<string>
    }>(),
    {
      aggregationSources: () => [],
      enabledSourceNames: () => new Set<string>(),
      watchlistKeys: () => new Set<string>(),
    },
  )

  const emit = defineEmits<{
    (e: 'change', symbol: SymbolItem): void
    (e: 'addWatchlist', symbol: SymbolItem): void
    (e: 'manageSources'): void
  }>()

  const showPopup = ref(false)
  const searchQuery = ref('')
  const activeSourceTab = useAggregationSourceTab()
  const searchInputRef = ref<HTMLInputElement | null>(null)
  const chipWrapRef = ref<HTMLElement | null>(null)
  const popupRef = ref<HTMLElement | null>(null)

  /** 全部 + 已启用且可搜索的源；mock 沉底 */
  const sourceTabs = computed<AggregationSourceTabItem[]>(() => {
    const enabled = props.enabledSourceNames
    const searchable = props.aggregationSources
      .filter((source) => enabled.has(source.name) && supportsAggregationSourceSearch(source))
      .slice()
      .sort((a, b) => Number(isMockSourceName(a.name)) - Number(isMockSourceName(b.name)))
    if (searchable.length === 0) return []
    return [
      { key: 'all', label: '全部' },
      ...searchable.map((source) => ({ key: source.name, label: source.displayName })),
    ]
  })

  const teleportTarget = useFullscreenTeleportTarget()

  const { popupStyle, startPositionSync, stopPositionSync } = useTeleportedPopup(
    chipWrapRef,
    popupRef,
    8,
  )

  const selectedKey = computed(() =>
    props.selectedItem ? symbolIdentityKey(props.selectedItem) : undefined,
  )

  const currentSymbol = computed<SymbolItem | undefined>(() =>
    selectedKey.value
      ? props.symbols.find((s) => symbolIdentityKey(s) === selectedKey.value)
      : props.symbols.find((s) => s.symbol === props.symbol),
  )

  const displayText = computed(() => {
    const cur = currentSymbol.value
    if (cur) {
      const legacy = cur as SymbolItem & { description?: string }
      return `${cur.symbol} - ${cur.name ?? legacy.description ?? cur.symbol}`
    }
    return props.symbol
  })

  const errorTagText = computed(() => props.errorMessage?.trim() || '加载失败')

  const {
    results: filteredSymbols,
    loading: searchLoading,
    error: searchError,
  } = useSymbolSearch<SymbolItem>({
    query: searchQuery,
    symbols: computed(() => props.symbols),
    search: computed(() => props.search),
    sourceFilter: activeSourceTab,
  })

  function togglePopup() {
    showPopup.value = !showPopup.value
    if (showPopup.value) {
      nextTick(() => searchInputRef.value?.focus())
    }
  }

  watch(showPopup, (val) => {
    if (val) {
      startPositionSync()
    } else {
      stopPositionSync()
    }
  })

  // 启用列表变化时，若当前 Tab 已不存在则回到全部
  watch(sourceTabs, (tabs) => {
    if (!tabs.some((tab) => tab.key === activeSourceTab.value)) {
      activeSourceTab.value = 'all'
    }
  })

  function clearSearch() {
    searchQuery.value = ''
    searchInputRef.value?.focus()
  }

  function selectSymbol(item: SymbolItem) {
    emit('change', item)
    showPopup.value = false
    searchQuery.value = ''
  }

  /** 展示交易所、品种类别和会话，便于区分同代码多语义。 */
  function formatSymbolMeta(item: SymbolItem): string {
    const parts = [item.exchange]
    if (item.assetClass !== 'unknown') parts.push(item.assetClass)
    if (item.sessionId) parts.push(item.sessionId)
    return parts.join(' · ')
  }

  function onDocumentClick(e: MouseEvent) {
    const chip = chipWrapRef.value
    const popup = popupRef.value
    // Shadow DOM 会将 document 监听器看到的 target 重定向为 Custom Element 宿主。
    const path = e.composedPath()
    if (chip && !path.includes(chip) && (!popup || !path.includes(popup))) {
      showPopup.value = false
    }
  }

  onMounted(() => document.addEventListener('mousedown', onDocumentClick))
  onBeforeUnmount(() => document.removeEventListener('mousedown', onDocumentClick))

  watch(
    () => props.symbol,
    () => {
      showPopup.value = false
      searchQuery.value = ''
    },
  )
</script>

<style scoped>
  .symbol-chip-wrap {
    position: relative;
    display: inline-flex;
    flex: 0 0 auto;
  }

  .symbol-chip {
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 10px;
    gap: 5px;
    border: 1px solid transparent;
    border-radius: 4px;
    background: transparent;
    color: var(--klc-color-foreground);
    font: inherit;
    cursor: pointer;
    transition:
      background 0.15s ease,
      border-color 0.15s ease,
      color 0.15s ease;
  }

  .symbol-chip:hover,
  .symbol-chip.is-open {
    border-color: var(--klc-color-border-button);
    background: var(--klc-color-grid-minor);
  }

  .symbol-chip.is-open .symbol-chip__arrow {
    transform: rotate(180deg);
  }

  .symbol-chip__code {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 14px;
    font-weight: 600;
    line-height: 1;
    letter-spacing: 0.01em;
  }

  .symbol-chip__arrow {
    color: var(--klc-color-axis-text);
    font-size: 12px;
    line-height: 1;
    transition: transform 0.15s ease;
  }

  .symbol-popover {
    z-index: 110;
    width: min(320px, calc(100vw - 24px));
    padding: 14px;
    border: 1px solid var(--klc-color-border-button);
    border-radius: 3px;
    background: var(--klc-color-background);
    color: var(--klc-color-foreground);

    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .symbol-search {
    position: relative;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    height: 32px;
    border: 1px solid var(--klc-color-border-button);
    border-radius: 8px;
    background: var(--klc-color-background);
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .symbol-search:focus-within {
    border-color: var(--klc-color-axis-text);
  }

  .symbol-search__icon {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    color: var(--klc-color-axis-text);
  }

  .symbol-search__input {
    flex: 1 1 0;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    color: var(--klc-color-foreground);
    font: inherit;
    font-size: 13px;
    line-height: 1;
  }

  .symbol-search__input::placeholder {
    color: var(--klc-color-axis-text);
    opacity: 0.7;
  }

  .symbol-search__clear {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 4px;
    background: transparent;
    color: var(--klc-color-axis-text);
    cursor: pointer;
    transition:
      border-color 0.15s ease,
      background 0.15s ease,
      color 0.15s ease;
  }

  .symbol-search__clear:hover {
    border-color: var(--klc-color-axis-line);
    background: var(--klc-color-grid-minor);
    color: var(--klc-color-foreground);
  }

  .symbol-search__clear .delete-icon {
    width: 14px;
    height: 14px;
  }

  .symbol-list {
    max-height: 280px;
    overflow-y: auto;
    overflow-x: hidden;
    display: flex;
    flex-direction: column;
    margin: 0 -4px;
  }

  .symbol-list::-webkit-scrollbar {
    width: 6px;
  }
  .symbol-list::-webkit-scrollbar-thumb {
    background: var(--klc-color-border-button);
    border-radius: 999px;
  }

  .symbol-list__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 28px 0;
    color: var(--klc-color-axis-text);
    font-size: 13px;
    text-align: center;
    gap: 2px;
  }

  .symbol-list__item {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 4px;
    border-radius: 7px;
    transition: background 0.12s ease;
    flex-shrink: 0;
  }

  .symbol-list__item:hover {
    background: var(--klc-color-grid-minor);
  }

  .symbol-list__item.is-active {
    background: color-mix(in srgb, var(--klc-color-alert-active) 10%, transparent);
  }

  .symbol-list__select {
    min-width: 0;
    flex: 1 1 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 9px 10px;
    border: 0;
    background: transparent;
    color: var(--klc-color-foreground);
    cursor: pointer;
    font: inherit;
    text-align: left;
  }

  .symbol-list__add {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    margin-right: 4px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 4px;
    background: transparent;
    color: var(--klc-color-axis-text);
    cursor: pointer;
  }

  .symbol-list__add:hover {
    border-color: var(--klc-color-border-button);
    background: var(--klc-color-grid-major);
    color: var(--klc-color-foreground);
  }

  .symbol-list__add svg {
    width: 15px;
    height: 15px;
  }

  .symbol-list__left {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    flex: 1 1 0;
  }

  .symbol-list__code {
    font-size: 13px;
    font-weight: 700;
    line-height: 1.2;
    letter-spacing: 0.01em;
    color: var(--klc-color-foreground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .symbol-list__desc {
    font-size: 11px;
    font-weight: 400;
    line-height: 1.2;
    color: var(--klc-color-axis-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .symbol-list__exchange {
    flex: 0 0 auto;
    padding: 2px 7px;
    border-radius: 4px;
    background: var(--klc-color-grid-major);
    color: var(--klc-color-axis-text);
    font-size: 10px;
    font-weight: 600;
    line-height: 1.4;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .symbol-list__item.is-active .symbol-list__exchange {
    background: color-mix(in srgb, var(--klc-color-alert-active) 16%, transparent);
    color: var(--klc-color-alert-active);
  }

  .symbol-popover-enter-active,
  .symbol-popover-leave-active {
    transition:
      opacity 0.15s ease,
      transform 0.15s ease;
  }

  .symbol-popover-enter-from,
  .symbol-popover-leave-to {
    opacity: 0;
    transform: translateY(-4px);
  }

  @media (max-width: 768px), (max-height: 640px) {
    .symbol-chip {
      height: 26px;
      max-width: 120px;
      padding: 0 8px;
    }

    .symbol-chip__code {
      font-size: 13px;
    }

    .symbol-popover {
      width: min(292px, calc(100vw - 16px));
      padding: 12px;
      gap: 8px;
    }

    .symbol-list {
      max-height: 220px;
    }
  }

  .symbol-chip__spinner {
    display: inline-block;
    flex-shrink: 0;
    width: 12px;
    height: 12px;
    border: 2px solid var(--klc-color-axis-text);
    border-top-color: transparent;
    border-radius: 50%;
    animation: symbol-spin 0.6s linear infinite;
  }

  @keyframes symbol-spin {
    to {
      transform: rotate(360deg);
    }
  }

  .symbol-chip__error {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    max-width: 180px;
    min-width: 0;
    color: var(--klc-color-danger, #e53935);
    line-height: 1;
  }

  .symbol-chip__warn {
    display: block;
    width: 14px;
    height: 14px;
    color: inherit;
    flex-shrink: 0;
  }

  .symbol-chip__error-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
    font-size: 11px;
    font-weight: 500;
    line-height: 14px;
    color: inherit;
  }
</style>
