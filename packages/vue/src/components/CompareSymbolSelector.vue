<template>
  <div ref="rootRef" class="compare-chip-wrap">
    <button
      type="button"
      class="compare-chip"
      :class="{ 'is-open': showPopup }"
      title="比较商品"
      :aria-expanded="showPopup"
      aria-haspopup="dialog"
      @click="togglePopup"
    >
      <span class="compare-chip__icon" aria-hidden="true">+</span>
      <span class="compare-chip__text">比较商品</span>
      <span v-if="comparisonLoading" class="compare-chip__spinner" />
      <span v-if="selected.length > 0" class="compare-chip__badge">{{ selected.length }}</span>
    </button>
    <SymbolPopover
      v-model:search="searchQuery"
      :show="showPopup"
      :anchor="rootRef"
      dialog-label="比较商品"
      search-placeholder="搜索代码或名称…"
      search-aria-label="搜索比较商品"
      @close="closePopup"
      @manage-sources="emit('manageSources')"
    >
      <template #tabs>
        <AggregationSourceTabs
          v-if="sourceTabs.length > 0"
          v-model="activeSourceTab"
          :tabs="sourceTabs"
        />
      </template>
      <template #body>
        <div v-if="selected.length > 0" class="compare-selected">
          <div class="compare-selected__header">
            <span class="compare-selected__title">已添加商品</span>
          </div>
          <div class="compare-selected__list">
            <div
              v-for="item in displayItems"
              :key="symbolIdentityKey(item)"
              class="compare-selected__item"
            >
              <span
                class="compare-selected__color"
                :style="{ background: comparisonColors?.get(symbolIdentityKey(item)) ?? '#888' }"
              />
              <span class="compare-selected__code">{{ item.symbol }}</span>
              <span class="compare-selected__desc">{{ item.name }}</span>
              <button
                type="button"
                class="compare-selected__remove"
                :aria-label="'移除 ' + item.symbol"
                @click="removeSymbol(item)"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="12"
                  height="12"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M18 6L6 18" />
                  <path d="M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div class="compare-list" role="listbox" aria-label="商品列表">
          <div v-if="searchLoading" class="compare-list__empty">
            <span class="compare-chip__spinner" aria-hidden="true" />
            <span>正在搜索</span>
          </div>
          <div v-else-if="comparisonSymbols.length === 0" class="compare-list__empty">
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
          <button
            v-for="item in comparisonSymbols"
            :key="symbolIdentityKey(item)"
            type="button"
            class="compare-list__item"
            :class="{ 'is-selected': isSelected(item) }"
            role="option"
            :aria-selected="isSelected(item)"
            @click="toggleSymbol(item)"
          >
            <span class="compare-list__left">
              <span class="compare-list__code">{{ item.symbol }}</span>
              <span class="compare-list__desc">{{ item.name }}</span>
            </span>
            <span class="compare-list__right">
              <span class="compare-list__exchange">{{ formatSymbolMeta(item) }}</span>
              <span v-if="isSelected(item)" class="compare-list__check" aria-hidden="true">
                <svg
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </span>
            </span>
          </button>
        </div>
      </template>
    </SymbolPopover>
  </div>
</template>

<script setup lang="ts">
  import { ref, computed, watch } from 'vue'

  import {
    symbolIdentityKey,
    uniqueSymbolsByIdentity,
    useSymbolSearch,
    type SymbolSearchFn,
  } from '../composables/useSymbolSearch'
  import {
    isMockSourceName,
    supportsAggregationSourceSearch,
    type AggregationSourceDefinition,
  } from '../composables/useAggregationSources'
  import { useAggregationSourceTab } from '../composables/useAggregationSourceTab'

  import AggregationSourceTabs, { type AggregationSourceTabItem } from './AggregationSourceTabs.vue'
  import SymbolPopover from './SymbolPopover.vue'
  import type { SymbolItem } from './SymbolSelector.vue'

  const props = withDefaults(
    defineProps<{
      symbols: SymbolItem[]
      search?: SymbolSearchFn<SymbolItem>
      selected?: string[]
      selectedItems?: SymbolItem[]
      comparisonColors?: Map<string, string>
      comparisonLoading?: boolean
      aggregationSources?: ReadonlyArray<AggregationSourceDefinition>
      enabledSourceNames?: ReadonlySet<string>
    }>(),
    {
      selected: () => [],
      selectedItems: () => [],
      aggregationSources: () => [],
      enabledSourceNames: () => new Set<string>(),
    },
  )

  const emit = defineEmits<{
    (e: 'add', item: SymbolItem): void
    (e: 'remove', code: string): void
    (e: 'manageSources'): void
  }>()

  const showPopup = ref(false)
  const searchQuery = ref('')
  const activeSourceTab = useAggregationSourceTab()
  const rootRef = ref<HTMLElement | null>(null)

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

  const selectedSet = computed(() => new Set(props.selected ?? []))

  const displayItems = computed<SymbolItem[]>(() => {
    if (props.selectedItems.length > 0) return props.selectedItems
    const set = selectedSet.value
    return props.symbols.filter((s) => set.has(symbolIdentityKey(s)))
  })

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
  const comparisonSymbols = computed(() => uniqueSymbolsByIdentity(filteredSymbols.value))

  function isSelected(item: SymbolItem): boolean {
    return selectedSet.value.has(symbolIdentityKey(item))
  }

  function toggleSymbol(item: SymbolItem) {
    if (isSelected(item)) {
      emit('remove', symbolIdentityKey(item))
    } else {
      emit('add', item)
    }
  }

  function removeSymbol(item: SymbolItem) {
    emit('remove', symbolIdentityKey(item))
  }

  /** 展示交易所、品种类别和会话，便于区分同代码多语义。 */
  function formatSymbolMeta(item: SymbolItem): string {
    const parts = [item.exchange]
    if (item.assetClass !== 'unknown') parts.push(item.assetClass)
    if (item.sessionId) parts.push(item.sessionId)
    return parts.join(' · ')
  }

  function togglePopup() {
    showPopup.value = !showPopup.value
  }

  /** 关闭弹层并清空搜索 */
  function closePopup() {
    showPopup.value = false
    searchQuery.value = ''
  }

  watch(sourceTabs, (tabs) => {
    if (!tabs.some((tab) => tab.key === activeSourceTab.value)) {
      activeSourceTab.value = 'all'
    }
  })
</script>

<style scoped>
  .compare-chip-wrap {
    position: relative;
    display: inline-flex;
    flex: 0 0 auto;
  }

  /* 触发器样式与 Dropdown 的 .dropdown__trigger 保持一致（同尺寸、同边框/背景/交互态）。 */
  .compare-chip {
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

  .compare-chip:hover,
  .compare-chip.is-open {
    border-color: var(--klc-color-ui-border-strong);
    background: var(--klc-color-ui-hover);
  }

  .compare-chip:focus-visible {
    border-color: var(--klc-color-ui-accent);
    background: var(--klc-color-ui-hover);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--klc-color-ui-accent) 24%, transparent);
    outline: 0;
  }

  .compare-chip__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--klc-color-ui-muted);
    font-size: 14px;
    font-weight: 600;
    line-height: 1;
  }

  .compare-chip__text {
    font-size: 13px;
    font-weight: 500;
    line-height: 1;
    white-space: nowrap;
  }

  .compare-chip__badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 999px;
    background: var(--klc-color-ui-accent);
    color: var(--klc-color-ui-on-accent);
    font-size: 10px;
    font-weight: 600;
    line-height: 1;
  }

  .compare-chip__spinner {
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 2px solid var(--klc-color-ui-muted);
    border-top-color: transparent;
    border-radius: 50%;
    animation: compare-spin 0.6s linear infinite;
  }

  @keyframes compare-spin {
    to {
      transform: rotate(360deg);
    }
  }

  .compare-selected {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--klc-color-ui-border);
  }

  .compare-selected__header {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .compare-selected__title {
    font-size: 12px;
    font-weight: 600;
    color: var(--klc-color-ui-muted);
  }

  .compare-selected__list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .compare-selected__item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 6px;
    background: var(--klc-color-ui-hover);
    font-size: 12px;
    line-height: 1.3;
  }

  .compare-selected__color {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .compare-selected__code {
    font-weight: 600;
    color: var(--klc-color-ui-text);
  }

  .compare-selected__desc {
    color: var(--klc-color-ui-muted);
    font-size: 11px;
    max-width: 100px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .compare-selected__remove {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--klc-color-ui-muted);
    cursor: pointer;
    transition:
      background 0.12s ease,
      color 0.12s ease;
    flex-shrink: 0;
  }

  .compare-selected__remove:hover {
    background: color-mix(in srgb, var(--klc-color-ui-accent) 16%, transparent);
    color: var(--klc-color-ui-accent);
  }

  .compare-list {
    max-height: 220px;
    overflow-y: auto;
    overflow-x: hidden;
    display: flex;
    flex-direction: column;
    margin: 0 -4px;
  }

  .compare-list::-webkit-scrollbar {
    width: 6px;
  }

  .compare-list::-webkit-scrollbar-thumb {
    background: var(--klc-color-ui-border);
    border-radius: 999px;
  }

  .compare-list__empty {
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

  .compare-list__item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 9px 10px;
    margin: 0 4px;
    border: none;
    border-radius: 7px;
    background: transparent;
    color: var(--klc-color-ui-text);
    font: inherit;
    cursor: pointer;
    text-align: left;
    transition: background 0.12s ease;
    flex-shrink: 0;
  }

  .compare-list__item:hover {
    background: var(--klc-color-ui-hover);
  }

  .compare-list__left {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    flex: 1 1 0;
  }

  .compare-list__code {
    font-size: 13px;
    font-weight: 700;
    line-height: 1.2;
    letter-spacing: 0.01em;
    color: var(--klc-color-ui-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .compare-list__desc {
    font-size: 11px;
    font-weight: 400;
    line-height: 1.2;
    color: var(--klc-color-ui-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .compare-list__right {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 0 0 auto;
  }

  .compare-list__exchange {
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

  .compare-list__check {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--klc-color-ui-accent);
    flex-shrink: 0;
  }

  @media (max-width: 768px), (max-height: 640px) {
    .compare-chip {
      height: 26px;
      gap: 4px;
      padding: 0 6px;
    }

    .compare-list {
      max-height: 180px;
    }
  }
</style>
