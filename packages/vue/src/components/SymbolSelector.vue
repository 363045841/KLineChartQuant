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
      <LoadingSpinner v-if="loading && !retrying" class="symbol-chip__spinner" />
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
    <SymbolPopover
      v-model:search="searchQuery"
      :show="showPopup"
      :anchor="chipWrapRef"
      dialog-label="切换合约"
      search-placeholder="搜索代码或名称…"
      search-aria-label="搜索商品"
      @close="closePopup"
      @manage-sources="emit('manageSources')"
    >
      <template #tabs>
        <BaseTabs
          v-if="sourceTabs.length > 0"
          v-model="activeSourceTab"
          :tabs="sourceTabs"
          size="compact"
          draggable
          aria-label="聚合源"
        />
      </template>
      <template #body>
        <div class="symbol-list" role="listbox" aria-label="商品列表">
          <div v-if="searchLoading" class="symbol-list__empty">
            <LoadingSpinner class="symbol-chip__spinner" />
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
      </template>
    </SymbolPopover>
  </div>
</template>

<script setup lang="ts">
  import { ref, computed, watch } from 'vue'

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

  import BaseTabs from './BaseTabs.vue'
  import LoadingSpinner from './LoadingSpinner.vue'
  import SymbolPopover from './SymbolPopover.vue'
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
  const chipWrapRef = ref<HTMLElement | null>(null)

  /** 全部 + 已启用且可搜索的源；mock 沉底 */
  const sourceTabs = computed<Array<{ id: string; label: string }>>(() => {
    const enabled = props.enabledSourceNames
    const searchable = props.aggregationSources
      .filter((source) => enabled.has(source.name) && supportsAggregationSourceSearch(source))
      .slice()
      .sort((a, b) => Number(isMockSourceName(a.name)) - Number(isMockSourceName(b.name)))
    if (searchable.length === 0) return []
    return [
      { id: 'all', label: '全部' },
      ...searchable.map((source) => ({ id: source.name, label: source.displayName })),
    ]
  })

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
      const name = cur.name ?? legacy.description ?? cur.symbol
      return cur.symbol === name ? cur.symbol : `${cur.symbol} - ${name}`
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
  }

  /** 关闭弹层并清空搜索 */
  function closePopup() {
    showPopup.value = false
    searchQuery.value = ''
  }

  // 启用列表变化时，若当前 Tab 已不存在则回到全部
  watch(sourceTabs, (tabs) => {
    if (!tabs.some((tab) => tab.id === activeSourceTab.value)) {
      activeSourceTab.value = 'all'
    }
  })

  function selectSymbol(item: SymbolItem) {
    emit('change', item)
    closePopup()
  }

  /** 展示交易所、品种类别和会话，便于区分同代码多语义。 */
  function formatSymbolMeta(item: SymbolItem): string {
    const parts = [item.exchange]
    if (item.assetClass !== 'unknown') parts.push(item.assetClass)
    if (item.sessionId) parts.push(item.sessionId)
    return parts.join(' · ')
  }

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

  /* 触发器样式与 Dropdown 的 .dropdown__trigger 保持一致（同尺寸、同边框/背景/交互态）。 */
  .symbol-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 8px;
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 8px;
    background: var(--klc-color-ui-control-background);
    color: var(--klc-color-ui-text);
    font: inherit;
    cursor: pointer;
    transition:
      background-color 0.2s ease,
      border-color 0.2s ease,
      box-shadow 0.2s ease;
  }

  .symbol-chip:hover,
  .symbol-chip.is-open {
    border-color: var(--klc-color-ui-border-strong);
    background: var(--klc-color-ui-hover);
  }

  .symbol-chip:focus-visible {
    border-color: var(--klc-color-ui-accent);
    background: var(--klc-color-ui-hover);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--klc-color-ui-accent) 24%, transparent);
    outline: 0;
  }

  .symbol-chip.is-open .symbol-chip__arrow {
    transform: rotate(180deg);
  }

  .symbol-chip__code {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
    font-weight: 500;
    line-height: 1;
    letter-spacing: 0.01em;
  }

  .symbol-chip__arrow {
    color: var(--klc-color-ui-muted);
    font-size: 12px;
    line-height: 1;
    transition: transform 0.15s ease;
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
    background: var(--klc-color-ui-border);
    border-radius: 999px;
  }

  .symbol-list__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 28px 0;
    color: var(--klc-color-ui-muted);
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
    background: var(--klc-color-ui-hover);
  }

  .symbol-list__item.is-active {
    background: color-mix(in srgb, var(--klc-color-ui-accent) 10%, transparent);
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
    color: var(--klc-color-ui-text);
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
    color: var(--klc-color-ui-muted);
    cursor: pointer;
  }

  .symbol-list__add:hover {
    border-color: var(--klc-color-ui-border);
    background: var(--klc-color-ui-hover);
    color: var(--klc-color-ui-text);
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
    color: var(--klc-color-ui-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .symbol-list__desc {
    font-size: 11px;
    font-weight: 400;
    line-height: 1.2;
    color: var(--klc-color-ui-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .symbol-list__exchange {
    flex: 0 0 auto;
    padding: 2px 7px;
    border-radius: 4px;
    background: var(--klc-color-ui-hover);
    color: var(--klc-color-ui-muted);
    font-size: 10px;
    font-weight: 600;
    line-height: 1.4;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .symbol-list__item.is-active .symbol-list__exchange {
    background: color-mix(in srgb, var(--klc-color-ui-accent) 16%, transparent);
    color: var(--klc-color-ui-accent);
  }

  @media (max-width: 768px), (max-height: 640px) {
    .symbol-chip {
      height: 26px;
      max-width: 120px;
      gap: 4px;
      padding: 0 6px;
    }

    .symbol-list {
      max-height: 220px;
    }
  }

  .symbol-chip__spinner {
    color: var(--klc-color-ui-muted);
  }

  .symbol-chip__error {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    max-width: 180px;
    min-width: 0;
    color: var(--klc-color-ui-danger-text);
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
