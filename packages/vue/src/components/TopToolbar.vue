<!-- 图表顶部控件及固定在右侧的截图入口。 -->
<template>
  <div class="top-toolbar">
    <div
      ref="toolbarRef"
      class="top-toolbar__controls"
      @mousedown="onMouseDown"
      @mousemove="onMouseMove"
      @mouseup="onMouseUp"
      @mouseleave="onMouseUp"
      @wheel="onWheel"
    >
      <SymbolSelector
        v-if="displaySymbol"
        :symbol="displaySymbol"
        :selected-item="symbolItem"
        :symbols="symbolPool"
        :search="search"
        :loading="symbolLoading"
        :error="symbolError"
        :retrying="symbolRetrying"
        :error-message="symbolErrorMessage"
        :aggregation-sources="aggregationSources"
        :enabled-source-names="enabledSourceNames"
        :watchlist-keys="watchlistKeys"
        @change="onSymbolSelectorChange"
        @add-watchlist="emit('addWatchlist', $event)"
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
        v-if="supportedKLineLevels === undefined || supportedKLineLevels.length > 0"
        :model-value="kLineLevel"
        :supported-levels="supportedKLineLevels"
        @update:model-value="emit('kLineLevelChange', $event)"
      />
      <KLineAdjustmentDropdown
        v-if="supportedAdjustments === undefined || supportedAdjustments.length > 0"
        :model-value="kLineAdjust"
        :supported-adjustments="supportedAdjustments"
        @update:model-value="emit('kLineAdjustChange', $event)"
      />
      <button
        v-if="showBackButton"
        type="button"
        class="control-button back-button"
        title="返回"
        aria-label="返回"
        @click="emit('back')"
      >
        <IconTablerArrowLeft class="back-button__icon" aria-hidden="true" />
        返回
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
    <div class="screenshot-actions">
      <span v-if="screenshotMessage" class="screenshot-message" role="status">
        {{ screenshotMessage }}
      </span>
      <DropMenu
        :label="screenshotCapturing ? chartScreenshotLabels.capturing : chartScreenshotLabels.capture"
        :groups="screenshotMenuGroups"
        :disabled="screenshotCapturing"
        trigger-class="control-button screenshot-button"
        placement="bottom"
        @select="onScreenshotSelect"
      >
        <template #trigger>
          <IconTablerCamera class="screenshot-button__icon" aria-hidden="true" />
        </template>
      </DropMenu>
    </div>
  </div>
</template>

<script setup lang="ts">
  import type { KLinePeriod } from '@363045841yyt/klinechart-core/market-data'
  import { computed, ref } from 'vue'
  import IconTablerArrowLeft from '~icons/tabler/arrow-left'
  import IconTablerCamera from '~icons/tabler/camera'
  import {
    type ChartScreenshotAction,
    chartScreenshotActions,
    chartScreenshotLabels,
  } from '../composables/chart/useChartScreenshot.js'
  import type {
    AggregationSourceDefinition,
    AggregationSourceEndpoint,
  } from '../composables/useAggregationSources.js'
  import type { SymbolSearchFn } from '../composables/useSymbolSearch.js'

  import AggregationSourceDialog from './AggregationSourceDialog.vue'
  import CompareSymbolSelector from './CompareSymbolSelector.vue'
  import DropMenu, { type DropMenuGroup } from './DropMenu.vue'
  import KLineAdjustmentDropdown, { type KLineAdjustment } from './KLineAdjustmentDropdown.vue'
  import KLineLevelDropdown from './KLineLevelDropdown.vue'
  import { isKLineLevel, type KLineLevel } from './kLineLevel'
  import type { SymbolItem } from './SymbolSelector.vue'
  import SymbolSelector from './SymbolSelector.vue'

  export type { SymbolItem }

  type SelectableKLinePeriod = Extract<KLinePeriod, KLineLevel>

  const toolbarRef = ref<HTMLElement | null>(null)
  const showSourceDialog = ref(false)

  const screenshotMenuGroups: ReadonlyArray<DropMenuGroup> = [
    {
      id: chartScreenshotLabels.capture,
      label: chartScreenshotLabels.capture,
      items: [
        { id: chartScreenshotActions.download, label: chartScreenshotLabels.download },
        { id: chartScreenshotActions.copy, label: chartScreenshotLabels.copy },
      ],
    },
  ]

  /** 将 DropMenu 的选项映射为截图动作，交由图表组件执行。 */
  function onScreenshotSelect(_groupId: string, action: string): void {
    if (action === chartScreenshotActions.download || action === chartScreenshotActions.copy) {
      emit('screenshot', action)
    }
  }

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

  /** 横向手势由浏览器原生处理；仅将纵向滚轮映射到可滚动的横向空间。 */
  function onWheel(event: WheelEvent) {
    if (event.ctrlKey || event.deltaX !== 0 || event.deltaY === 0) return
    const el = toolbarRef.value
    if (!el) return
    const maxScroll = el.scrollWidth - el.clientWidth
    if (
      maxScroll <= 0 ||
      (event.deltaY < 0 && el.scrollLeft <= 0) ||
      (event.deltaY > 0 && el.scrollLeft >= maxScroll)
    )
      return
    event.preventDefault()
    el.scrollLeft += event.deltaY
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
      symbolRetrying?: boolean
      symbolErrorMessage?: string
      overlaySymbols?: string[]
      overlaySymbolItems?: SymbolItem[]
      comparisonColors?: Map<string, string>
      comparisonLoading?: boolean
      showBackButton?: boolean
      screenshotCapturing?: boolean
      screenshotMessage?: string | null
      aggregationSources?: ReadonlyArray<AggregationSourceDefinition>
      enabledSourceNames?: ReadonlySet<string>
      sourceEndpoints?: Record<string, AggregationSourceEndpoint>
      watchlistKeys?: ReadonlySet<string>
    }>(),
    {
      aggregationSources: () => [],
      enabledSourceNames: () => new Set<string>(),
      sourceEndpoints: () => ({}),
      watchlistKeys: () => new Set<string>(),
    },
  )

  const emit = defineEmits<{
    (e: 'addOverlaySymbol', item: SymbolItem): void
    (e: 'removeOverlaySymbol', code: string): void
    (e: 'kLineLevelChange', level: KLineLevel): void
    (e: 'kLineAdjustChange', adjust: KLineAdjustment): void
    (e: 'symbolChange', symbol: SymbolItem): void
    (e: 'addWatchlist', symbol: SymbolItem): void
    (e: 'toggleAggregationSource', name: string, enabled: boolean): void
    (e: 'updateSourceEndpoint', name: string, patch: Partial<AggregationSourceEndpoint>): void
    (e: 'back'): void
    (e: 'screenshot', action: ChartScreenshotAction): void
  }>()

  const displaySymbol = computed(() => props.symbol?.trim() ?? '')

  /** 当前品种可展示的周期；undefined 表示尚未迁移能力模型。 */
  const supportedKLineLevels = computed<ReadonlyArray<KLineLevel> | undefined>(() => {
    const capabilities = props.symbolItem?.capabilities
    if (!capabilities) return undefined
    return [
      ...(capabilities.timeShare ? (['timeshare'] as const) : []),
      ...((capabilities.timeShareRange?.maxTradingDays ?? 0) >= 5
        ? (['5daytimeshare'] as const)
        : []),
      ...(capabilities.bars?.periods.filter((period): period is SelectableKLinePeriod =>
        isKLineLevel(period),
      ) ?? []),
    ]
  })

  /** 当前品种可展示的复权方式；undefined 表示尚未迁移能力模型。 */
  const supportedAdjustments = computed<ReadonlyArray<KLineAdjustment> | undefined>(
    () => props.symbolItem?.capabilities?.bars?.adjustments,
  )

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

<style scoped src="./common/control-button.css"></style>

<style scoped>
  .top-toolbar {
    position: relative;
    height: 40px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 8px;
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 3px;
    background: var(--klc-color-ui-surface);
    box-shadow: 0 1px 3px color-mix(in srgb, var(--klc-color-ui-text) 6%, transparent);
    box-sizing: border-box;
    user-select: none;
  }

  .top-toolbar__controls {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    height: 100%;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
  }

  .top-toolbar__controls::-webkit-scrollbar {
    display: none;
  }

  .back-button {
    flex: 0 0 auto;
    margin-left: auto;
  }

  .back-button__icon {
    width: 15px;
    height: 15px;
  }

  .screenshot-actions {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 6px;
    margin-left: auto;
  }

  /* 截图入口只保留图标，去掉外框和默认底色，交互提示交给 hover tooltip。 */
  .screenshot-actions :deep(.screenshot-button) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-color: transparent;
    background: transparent;
  }

  .screenshot-actions :deep(.screenshot-button:hover:not(:disabled)),
  .screenshot-actions :deep(.screenshot-button[aria-expanded='true']:not(:disabled)) {
    border-color: transparent;
    background: var(--klc-color-ui-hover);
  }

  .screenshot-button__icon {
    width: 18px;
    height: 18px;
  }

  .screenshot-message {
    color: var(--klc-color-ui-text);
    font-size: 12px;
  }
</style>
