<template>
  <div ref="chipWrapRef" class="symbol-chip-wrap">
    <BaseTooltip
      :content="error || retrying ? `${displayText} · ${errorTagText}` : displayText"
      placement="bottom"
      trigger-display="contents"
      :disabled="picker.showPopup"
    >
    <button
      type="button"
      class="control-button symbol-chip"
      :class="{ 'is-open': picker.showPopup }"
      :aria-expanded="picker.showPopup"
      aria-haspopup="dialog"
      @click="picker.togglePopup"
    >
      <span class="symbol-chip__code">{{ displayText }}</span>
      <LoadingSpinner v-if="loading && !retrying" class="symbol-chip__spinner" />
      <span
        v-else-if="error || retrying"
        class="symbol-chip__error"
        role="status"
      >
        <IconTablerAlertTriangle class="symbol-chip__warn" aria-hidden="true" />
        <span class="symbol-chip__error-text">{{ errorTagText }}</span>
      </span>
    </button>
    </BaseTooltip>
    <SymbolPopover
      v-model:search="picker.searchQuery"
      :show="picker.showPopup"
      :anchor="chipWrapRef"
      dialog-label="选择商品"
      search-placeholder="搜索代码或名称…"
      search-aria-label="搜索商品"
      @close="picker.closePopup"
      @manage-sources="emit('manageSources')"
    >
      <template v-if="picker.sourceTabs.length > 0" #tabs>
        <BaseTabs
          v-model="picker.activeSourceTab"
          :tabs="picker.sourceTabs"
          aria-label="聚合源"
        />
      </template>
      <template #body>
        <div class="symbol-list" role="listbox" aria-label="商品列表">
          <div v-if="picker.loading" class="symbol-list__empty">
            <LoadingSpinner :size="32" class="symbol-list__spinner" />
            <span>正在搜索</span>
          </div>
          <SymbolSearchEmpty
            v-else-if="picker.results.length === 0"
            :error="picker.error"
            empty-class="symbol-list__empty"
          />
          <div
            v-for="item in picker.results"
            :key="symbolIdentityKey(item)"
            class="symbol-list__item modal-list-row"
            :class="{ 'is-active': symbolIdentityKey(item) === selectedKey }"
            role="option"
            :aria-selected="symbolIdentityKey(item) === selectedKey"
          >
            <button type="button" class="symbol-list__select" @click="selectSymbol(item)">
              <span class="list-text">
                <span class="symbol-list__code">{{ item.symbol }}</span>
                <span class="symbol-list__desc">{{ item.name }}</span>
              </span>
              <SymbolMetaBadge :symbol="item" />
            </button>
            <BaseTooltip
              v-if="!watchlistKeys.has(symbolIdentityKey(item))"
              content="添加自选"
              placement="left"
              trigger-display="contents"
            >
              <BaseIconButton
                :label="`添加自选 ${item.symbol}`"
                @click.stop="emit('addWatchlist', item)"
              >
                <IconTablerPlus aria-hidden="true" />
              </BaseIconButton>
            </BaseTooltip>
          </div>
        </div>
      </template>
    </SymbolPopover>
  </div>
</template>

<script setup lang="ts">
  import '../common/control-button.css'
  import '../common/modal-list.css'
  import '../common/symbol-list.css'
  import '../common/list-text.css'

  import BaseIconButton from '@vue-src/components/common/BaseIconButton.vue'
  import BaseTabs from '@vue-src/components/common/BaseTabs.vue'
  import BaseTooltip from '@vue-src/components/common/BaseTooltip.vue'
  import LoadingSpinner from '@vue-src/components/common/LoadingSpinner.vue'
  import SymbolMetaBadge from '@vue-src/components/common/SymbolMetaBadge.vue'
  import type { AggregationSourceDefinition } from '@vue-src/composables/market/useAggregationSources.js'
  import {
    type SearchableSymbol,
    type SymbolSearchFn,
    symbolIdentityKey,
  } from '@vue-src/composables/symbol/useSymbolSearch.js'
  import { useSymbolSourcePickerFromProps } from '@vue-src/composables/symbol/useSymbolSourcePicker.js'
  import { computed, ref, watch } from 'vue'
  import IconTablerAlertTriangle from '~icons/tabler/alert-triangle'
  import IconTablerPlus from '~icons/tabler/plus'
  import SymbolPopover from './SymbolPopover.vue'
  import SymbolSearchEmpty from './SymbolSearchEmpty.vue'

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

  const chipWrapRef = ref<HTMLElement | null>(null)
  const picker = useSymbolSourcePickerFromProps<SymbolItem>(props)

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

  function selectSymbol(item: SymbolItem) {
    if (symbolIdentityKey(item) === selectedKey.value) {
      picker.closePopup()
      return
    }
    emit('change', item)
    picker.closePopup()
  }

  watch(
    () => props.symbol,
    () => {
      picker.showPopup = false
      picker.searchQuery = ''
    },
  )
</script>


<style scoped>
  .symbol-chip-wrap {
    position: relative;
    display: inline-flex;
    flex: 0 0 auto;
  }

  .symbol-chip__code {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    letter-spacing: 0.01em;
  }

  .symbol-list__item {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    border-bottom: 1px solid var(--klc-color-ui-border);
    transition: background var(--klc-motion-dur-fast) var(--klc-motion-ease-standard);
    flex-shrink: 0;
  }

  .symbol-list__item:hover {
    background: var(--klc-color-ui-hover);
  }

  .symbol-list__item.is-active {
    background: var(--klc-color-ui-hover);
  }

  .symbol-list__select {
    min-width: 0;
    flex: 1 1 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding-block: 10px;
    border: 0;
    background: transparent;
    color: var(--klc-color-ui-text);
    cursor: pointer;
    font: inherit;
    text-align: left;
  }

  .symbol-list__item:last-child {
    border-bottom: 0;
  }

  @media (max-width: 768px), (max-height: 640px) {
    .symbol-chip {
      max-width: 120px;
    }

    .symbol-list {
      max-height: 320px;
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
