<template>
  <div
    ref="toolbarRef"
    class="top-toolbar"
    @mousedown="onMouseDown"
    @mousemove="onMouseMove"
    @mouseup="onMouseUp"
    @mouseleave="onMouseUp"
  >
    <SymbolSelector
      v-if="displaySymbol"
      :symbol="displaySymbol"
      :selected-item="symbolItem"
      :symbols="symbolPool"
      :search="search"
      :loading="symbolLoading"
      :error="symbolError"
      :error-message="symbolErrorMessage"
      :aggregation-sources="aggregationSources"
      :enabled-source-names="enabledSourceNames"
      @change="onSymbolSelectorChange"
      @manage-sources="showSourceDialog = true"
    />
    <CompareSymbolSelector
      :symbols="symbolPool"
      :search="search"
      :selected="overlaySymbols"
      :selected-items="overlaySymbolItems"
      :comparison-colors="comparisonColors"
      :comparison-loading="comparisonLoading"
      :aggregation-sources="aggregationSources"
      :enabled-source-names="enabledSourceNames"
      @add="emit('addOverlaySymbol', $event)"
      @remove="emit('removeOverlaySymbol', $event)"
      @manage-sources="showSourceDialog = true"
    />
    <KLineLevelDropdown
      :model-value="kLineLevel"
      @update:model-value="emit('kLineLevelChange', $event)"
    />
    <KLineAdjustmentDropdown
      :model-value="kLineAdjust"
      @update:model-value="emit('kLineAdjustChange', $event)"
    />
    <button
      v-if="showBackButton"
      type="button"
      class="back-button"
      title="返回"
      aria-label="返回"
      @click="emit('back')"
    >
      ← 返回
    </button>
    <AggregationSourceDialog
      :show="showSourceDialog"
      :sources="aggregationSources"
      :enabled-names="enabledSourceNames"
      :endpoints="sourceEndpoints"
      @close="showSourceDialog = false"
      @toggle="onToggleAggregationSource"
      @update-endpoint="onUpdateSourceEndpoint"
    />
  </div>
</template>

<script setup lang="ts">
  import type { DataFetcherDefinition } from '@363045841yyt/klinechart-core/controllers'
  import { computed, ref } from 'vue'

  import type { AggregationSourceEndpoint } from '../composables/useAggregationSources'
  import type { SymbolSearchFn } from '../composables/useSymbolSearch'

  import AggregationSourceDialog from './AggregationSourceDialog.vue'
  import CompareSymbolSelector from './CompareSymbolSelector.vue'
  import KLineAdjustmentDropdown, { type KLineAdjustment } from './KLineAdjustmentDropdown.vue'
  import KLineLevelDropdown, { type KLineLevel } from './KLineLevelDropdown.vue'
  import SymbolSelector from './SymbolSelector.vue'
  import type { SymbolItem } from './SymbolSelector.vue'

  export type { SymbolItem }

  const toolbarRef = ref<HTMLElement | null>(null)
  const showSourceDialog = ref(false)

  let isDown = false
  let startX = 0
  let scrollLeft = 0

  function onMouseDown(e: MouseEvent) {
    const el = toolbarRef.value
    if (!el) return
    isDown = true
    startX = e.pageX - el.getBoundingClientRect().left
    scrollLeft = el.scrollLeft
    el.style.cursor = 'grabbing'
    el.style.userSelect = 'none'
  }

  function onMouseMove(e: MouseEvent) {
    if (!isDown) return
    const el = toolbarRef.value
    if (!el) return
    e.preventDefault()
    const x = e.pageX - el.getBoundingClientRect().left
    const walk = x - startX
    el.scrollLeft = scrollLeft - walk
  }

  function onMouseUp() {
    if (!isDown) return
    isDown = false
    const el = toolbarRef.value
    if (!el) return
    el.style.cursor = ''
    el.style.userSelect = ''
  }

  const props = withDefaults(
    defineProps<{
      symbol?: string
      symbolItem?: SymbolItem
      kLineLevel?: string
      kLineAdjust?: string
      symbols?: SymbolItem[]
      search?: SymbolSearchFn<SymbolItem>
      symbolLoading?: boolean
      symbolError?: boolean
      symbolErrorMessage?: string
      overlaySymbols?: string[]
      overlaySymbolItems?: SymbolItem[]
      comparisonColors?: Map<string, string>
      comparisonLoading?: boolean
      showBackButton?: boolean
      aggregationSources?: ReadonlyArray<DataFetcherDefinition>
      enabledSourceNames?: ReadonlySet<string>
      sourceEndpoints?: Record<string, AggregationSourceEndpoint>
    }>(),
    {
      aggregationSources: () => [],
      enabledSourceNames: () => new Set<string>(),
      sourceEndpoints: () => ({}),
    },
  )

  const emit = defineEmits<{
    (e: 'addOverlaySymbol', item: SymbolItem): void
    (e: 'removeOverlaySymbol', code: string): void
    (e: 'kLineLevelChange', level: KLineLevel): void
    (e: 'kLineAdjustChange', adjust: KLineAdjustment): void
    (e: 'symbolChange', symbol: SymbolItem): void
    (e: 'toggleAggregationSource', name: string, enabled: boolean): void
    (e: 'updateSourceEndpoint', name: string, patch: Partial<AggregationSourceEndpoint>): void
    (e: 'back'): void
  }>()

  const displaySymbol = computed(() => props.symbol?.trim() ?? '')

  // Symbol pool comes exclusively from props — driven by the controller's symbolCatalog.
  // If no symbols are provided, the picker displays an empty list (no hardcoded fallback).
  const symbolPool = computed<SymbolItem[]>(() => props.symbols ?? [])

  function onSymbolSelectorChange(item: SymbolItem) {
    emit('symbolChange', item)
  }

  function onToggleAggregationSource(name: string, enabled: boolean) {
    emit('toggleAggregationSource', name, enabled)
  }

  function onUpdateSourceEndpoint(name: string, patch: Partial<AggregationSourceEndpoint>) {
    emit('updateSourceEndpoint', name, patch)
  }
</script>

<style scoped>
  .top-toolbar {
    position: relative;
    height: 40px;
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 6px;
    padding: 0 8px;
    border: 1px solid var(--klc-color-border-chart);
    border-radius: 3px;
    background: var(--klc-color-background);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
    box-sizing: border-box;
    user-select: none;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .top-toolbar::-webkit-scrollbar {
    display: none;
  }

  .back-button {
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    gap: 4px;
    padding: 0 12px;
    margin-left: auto;
    border: 1px solid var(--klc-color-border-button);
    border-radius: 4px;
    background: var(--klc-color-background);
    color: var(--klc-color-foreground);
    font: inherit;
    font-size: 13px;
    cursor: pointer;
    transition:
      background 0.15s ease,
      border-color 0.15s ease,
      color 0.15s ease;
  }

  .back-button:hover {
    border-color: var(--klc-color-axis-text);
    background: var(--klc-color-grid-minor);
  }

  @media (max-width: 768px), (max-height: 640px) {
    .back-button {
      height: 26px;
      font-size: 12px;
    }
  }
</style>
