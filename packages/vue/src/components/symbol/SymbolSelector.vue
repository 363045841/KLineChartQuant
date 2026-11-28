<template>
  <div class="symbol-selector" :class="{ 'symbol-selector--field': variant === 'field' }">
    <SelectionField
      v-if="variant === 'field'"
      :value="displayText"
      placeholder="选择品种"
      aria-haspopup="dialog"
      :aria-expanded="picker.showPopup"
      @click="picker.togglePopup"
    >
      <template v-if="loading && !retrying" #status>
        <LoadingSpinner class="symbol-selector__spinner" />
      </template>
      <template v-else-if="error || retrying" #status>
        <span class="symbol-selector__error" role="status">
          <IconTablerAlertTriangle class="symbol-selector__warn" aria-hidden="true" />
          <span class="symbol-selector__error-text">{{ errorTagText }}</span>
        </span>
      </template>
    </SelectionField>
    <BaseTooltip
      v-else
      :content="error || retrying ? `${displayText} · ${errorTagText}` : displayText"
      placement="bottom"
      trigger-display="contents"
      :disabled="picker.showPopup"
    >
    <button
      type="button"
      class="control-button symbol-chip"
      :aria-expanded="picker.showPopup"
      aria-haspopup="dialog"
      @click="picker.togglePopup"
    >
      <span class="symbol-chip__code">{{ displayText }}</span>
      <LoadingSpinner v-if="loading && !retrying" class="symbol-selector__spinner" />
      <span
        v-else-if="error || retrying"
        class="symbol-selector__error"
        role="status"
      >
        <IconTablerAlertTriangle class="symbol-selector__warn" aria-hidden="true" />
        <span class="symbol-selector__error-text">{{ errorTagText }}</span>
      </span>
    </button>
    </BaseTooltip>
    <SymbolSearchDialog
      v-model:search="picker.searchQuery"
      :show="picker.showPopup"
      :manage-sources="showManageSources"
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
        <div
          class="symbol-list"
          role="listbox"
          aria-label="商品列表"
          @pointerover="onPointerOver"
          @pointerleave="hide"
          @focusin="onFocusIn"
          @focusout="hide"
        >
          <SlidingHighlight ref="highlight" class="symbol-list__highlight" />
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
              v-if="showWatchlistAction && !watchlistKeys.has(symbolIdentityKey(item))"
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
    </SymbolSearchDialog>
  </div>
</template>

<script setup lang="ts">
  import '@vue-src/components/common/menu/control-button.css'
  import '@vue-src/components/common/dialog/modal-list.css'
  import './symbol-list.css'
  import '@vue-src/components/common/list-text.css'

  import BaseIconButton from '@vue-src/components/common/button/BaseIconButton.vue'
  import LoadingSpinner from '@vue-src/components/common/feedback/LoadingSpinner.vue'
  import SelectionField from '@vue-src/components/common/form/SelectionField.vue'
  import BaseTooltip from '@vue-src/components/common/overlay/BaseTooltip.vue'
  import SlidingHighlight from '@vue-src/components/common/SlidingHighlight.vue'
  import BaseTabs from '@vue-src/components/common/tabs/BaseTabs.vue'
  import type { AggregationSourceDefinition } from '@vue-src/composables/market/useAggregationSources.js'
  import {
    type SearchableSymbol,
    type SymbolSearchFn,
    symbolIdentityKey,
  } from '@vue-src/composables/symbol/useSymbolSearch.js'
  import { useSymbolSourcePickerFromProps } from '@vue-src/composables/symbol/useSymbolSourcePicker.js'
  import { useSlidingHighlight } from '@vue-src/composables/ui/useSlidingHighlight.js'
  import { computed, ref, watch } from 'vue'
  import IconTablerAlertTriangle from '~icons/tabler/alert-triangle'
  import IconTablerPlus from '~icons/tabler/plus'
  import SymbolMetaBadge from './SymbolMetaBadge.vue'
  import SymbolSearchDialog from './SymbolSearchDialog.vue'
  import SymbolSearchEmpty from './SymbolSearchEmpty.vue'

  export type SymbolItem = SearchableSymbol

  const props = withDefaults(
    defineProps<{
      symbol: string
      selectedItem?: SymbolItem
      symbols: readonly SymbolItem[]
      search?: SymbolSearchFn<SymbolItem>
      loading?: boolean
      error?: boolean
      /** 加载中已有本轮失败信息时显示重试提示。 */
      retrying?: boolean
      /** 主品种拉取失败原因；与 error 同时为真时作为 chip title */
      errorMessage?: string
      /** chip 用于工具栏；field 用于表单里的通栏入口。 */
      variant?: 'chip' | 'field'
      /** 已注册数据源，用于 Tabs 展示名 */
      aggregationSources?: ReadonlyArray<AggregationSourceDefinition>
      /** 已启用的搜索源名称 */
      enabledSourceNames?: ReadonlySet<string>
      /** 已加入自选股的品种身份 */
      watchlistKeys?: ReadonlySet<string>
      /** 选择列表是否提供“添加自选”操作；警报等只选品种的场景关闭。 */
      showWatchlistAction?: boolean
      /** 是否在搜索栏提供数据源管理入口。 */
      showManageSources?: boolean
    }>(),
    {
      aggregationSources: () => [],
      enabledSourceNames: () => new Set<string>(),
      watchlistKeys: () => new Set<string>(),
      showWatchlistAction: true,
      showManageSources: true,
      variant: 'chip',
    },
  )

  const emit = defineEmits<{
    (e: 'change', symbol: SymbolItem): void
    (e: 'addWatchlist', symbol: SymbolItem): void
    (e: 'manageSources'): void
  }>()

  const picker = useSymbolSourcePickerFromProps<SymbolItem>(props)

  const highlight = ref<InstanceType<typeof SlidingHighlight> | null>(null)
  const { onPointerOver, onFocusIn, hide } = useSlidingHighlight(highlight, (target) =>
    target.closest<HTMLElement>('.symbol-list__item'),
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
    if (!cur) return props.symbol
    const name = cur.name || cur.symbol
    return cur.symbol === name ? cur.symbol : `${cur.symbol} - ${name}`
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
  .symbol-selector {
    position: relative;
    display: inline-flex;
    flex: 0 0 auto;
  }

  /* 表单里的通栏入口：占满字段列，触发器自己负责宽度。 */
  .symbol-selector--field {
    display: flex;
    width: 100%;
  }

  .symbol-chip__code {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    letter-spacing: 0.01em;
  }

  .symbol-list__item {
    /* 文字压在滑动高亮块之上；悬停底色由块统一提供。 */
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    border-bottom: 1px solid var(--klc-color-ui-border);
    flex-shrink: 0;
  }

  /* 通栏行上下紧邻，高亮块保持直角贴边。 */
  .symbol-list__highlight {
    --sliding-highlight-radius: 0;
  }

  /* 当前品种是常驻选中态，与瞬时悬停分开取色。 */
  .symbol-list__item.is-active {
    background: var(--klc-color-ui-selected);
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

  .symbol-selector__spinner {
    color: var(--klc-color-ui-muted);
  }

  .symbol-selector__error {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    max-width: 180px;
    min-width: 0;
    color: var(--klc-color-ui-danger-text);
    line-height: 1;
  }

  .symbol-selector__warn {
    display: block;
    width: 14px;
    height: 14px;
    color: inherit;
    flex-shrink: 0;
  }

  .symbol-selector__error-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
    font-size: 11px;
    line-height: 14px;
    color: inherit;
  }
</style>
