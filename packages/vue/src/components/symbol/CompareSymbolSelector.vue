<template>
  <div ref="rootRef" class="compare-chip-wrap">
    <BaseTooltip content="比较商品" placement="bottom" trigger-display="contents" :disabled="picker.showPopup">
    <button
      type="button"
      class="control-button compare-chip"
      :class="{ 'is-open': picker.showPopup }"
      :aria-expanded="picker.showPopup"
      aria-haspopup="dialog"
      @click="picker.togglePopup"
    >
      <span class="compare-chip__icon" aria-hidden="true">
        <IconTablerPlus />
      </span>
      <span class="compare-chip__text">比较商品</span>
      <span v-if="comparisonLoading" class="compare-chip__spinner klc-spin" />
      <span v-if="selected.length > 0" class="compare-chip__badge">{{ selected.length }}</span>
    </button>
    </BaseTooltip>
    <SymbolPopover
      v-model:search="picker.searchQuery"
      :show="picker.showPopup"
      :anchor="rootRef"
      dialog-label="比较商品"
      search-placeholder="搜索代码或名称…"
      search-aria-label="搜索比较商品"
      @close="picker.closePopup"
      @manage-sources="emit('manageSources')"
    >
      <template #tabs>
        <BaseTabs
          v-if="picker.sourceTabs.length > 0"
          v-model="picker.activeSourceTab"
          :tabs="picker.sourceTabs"
          aria-label="聚合源"
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
                :style="{ background: comparisonColors?.get(symbolIdentityKey(item)) ?? 'var(--klc-color-ui-muted)' }"
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
          <div v-if="picker.loading" class="compare-list__empty">
            <LoadingSpinner :size="32" class="compare-list__spinner" />
            <span>正在搜索</span>
          </div>
          <SymbolSearchEmpty
            v-else-if="comparisonSymbols.length === 0"
            :error="picker.error"
            empty-class="compare-list__empty"
          />
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
            <span class="list-text">
              <span class="compare-list__code">{{ item.symbol }}</span>
              <span class="compare-list__desc">{{ item.name }}</span>
            </span>
            <span class="compare-list__right">
              <SymbolMetaBadge :symbol="item" />
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
  import '../common/control-button.css'
  import '../common/symbol-list.css'
  import '../common/list-text.css'
  import '../common/control-cluster.css'

  import BaseTabs from '@vue-src/components/common/BaseTabs.vue'
  import BaseTooltip from '@vue-src/components/common/BaseTooltip.vue'
  import LoadingSpinner from '@vue-src/components/common/LoadingSpinner.vue'
  import SymbolMetaBadge from '@vue-src/components/common/SymbolMetaBadge.vue'
  import type { AggregationSourceDefinition } from '@vue-src/composables/market/useAggregationSources.js'
  import {
    type SymbolSearchFn,
    symbolIdentityKey,
    uniqueSymbolsByIdentity,
  } from '@vue-src/composables/symbol/useSymbolSearch.js'
  import { useSymbolSourcePickerFromProps } from '@vue-src/composables/symbol/useSymbolSourcePicker.js'
  import { computed, ref } from 'vue'
  import IconTablerPlus from '~icons/tabler/plus'
  import SymbolPopover from './SymbolPopover.vue'
  import SymbolSearchEmpty from './SymbolSearchEmpty.vue'
  import type { SymbolItem } from './SymbolSelector.vue'

  const props = withDefaults(
    defineProps<{
      symbols: SymbolItem[]
      search?: SymbolSearchFn<SymbolItem>
      selected?: string[]
      selectedItems?: SymbolItem[]
      comparisonColors?: ReadonlyMap<string, string>
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

  const rootRef = ref<HTMLElement | null>(null)
  const picker = useSymbolSourcePickerFromProps<SymbolItem>(props)

  const selectedSet = computed(() => new Set(props.selected ?? []))

  const displayItems = computed<SymbolItem[]>(() => {
    if (props.selectedItems.length > 0) return props.selectedItems
    const set = selectedSet.value
    return props.symbols.filter((s) => set.has(symbolIdentityKey(s)))
  })

  const comparisonSymbols = computed(() => uniqueSymbolsByIdentity(picker.results))

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
</script>


<style scoped>
  .compare-chip-wrap {
    position: relative;
    display: inline-flex;
    flex: 0 0 auto;
  }

  .compare-chip__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--klc-color-ui-muted);
    /* Tabler 图标在 24 viewBox 内四周留白，15px 下左右各约 3px；抵消后使视觉间距与 DropMenu 触发器一致 */
    margin-inline: -3px;
  }

  .compare-chip__icon svg {
    width: 15px;
    height: 15px;
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
  }

  .compare-selected {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
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
    border: 0;
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

  .compare-list__item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 10px 12px;
    margin: 0;
    border: none;
    border-bottom: 1px solid var(--klc-color-ui-border);
    border-radius: 0;
    background: transparent;
    color: var(--klc-color-ui-text);
    font: inherit;
    cursor: pointer;
    text-align: left;
    transition: background var(--klc-motion-dur-fast) var(--klc-motion-ease-standard);
    flex-shrink: 0;
  }

  .compare-list__item:hover {
    background: var(--klc-color-ui-hover);
  }

  .compare-list__check {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--klc-color-ui-accent);
    flex-shrink: 0;
  }

  @media (max-width: 768px), (max-height: 640px) {
    .compare-list {
      max-height: 320px;
    }
  }
</style>
