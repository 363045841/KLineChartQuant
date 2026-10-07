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
        class="top-toolbar__item"
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
        class="top-toolbar__item"
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
        class="top-toolbar__item"
        v-if="supportedKLineLevels === undefined || supportedKLineLevels.length > 0"
        :model-value="kLineLevel"
        :supported-levels="supportedKLineLevels"
        @update:model-value="emit('kLineLevelChange', $event)"
      />
      <KLineAdjustmentDropdown
        class="top-toolbar__item"
        v-if="supportedAdjustments === undefined || supportedAdjustments.length > 0"
        :model-value="kLineAdjust"
        :supported-adjustments="supportedAdjustments"
        @update:model-value="emit('kLineAdjustChange', $event)"
      />
      <BaseTooltip v-if="showBackButton" content="返回" placement="bottom" trigger-display="contents">
      <button
        type="button"
        class="control-button back-button"
        aria-label="返回"
        @click="emit('back')"
      >
        <IconTablerArrowLeft class="back-button__icon" aria-hidden="true" />
        返回
      </button>
      </BaseTooltip>
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
    <div class="layout-actions">
      <LayoutMenu :controller="layoutController ?? null" />
    </div>
    <div class="screenshot-actions">
      <BaseTooltip content="撤回" placement="bottom">
        <button
          type="button"
          class="control-button history-button"
          aria-label="撤回"
          :disabled="!canUndoDrawing"
          @click="emit('undoDrawing')"
        >
          <IconTablerArrowBackUp class="history-button__icon" aria-hidden="true" />
        </button>
      </BaseTooltip>
      <BaseTooltip content="重做" placement="bottom">
        <button
          type="button"
          class="control-button history-button"
          aria-label="重做"
          :disabled="!canRedoDrawing"
          @click="emit('redoDrawing')"
        >
          <IconTablerArrowForwardUp class="history-button__icon" aria-hidden="true" />
        </button>
      </BaseTooltip>
      <BaseTooltip :content="isFullscreen ? '退出全屏' : '全屏显示'" placement="bottom">
        <button
          type="button"
          class="control-button history-button"
          :aria-label="isFullscreen ? '退出全屏' : '全屏显示'"
          :aria-pressed="!!isFullscreen"
          @click="emit('toggleFullscreen')"
        >
          <IconTablerMinimize v-if="isFullscreen" class="history-button__icon" aria-hidden="true" />
          <IconTablerMaximize v-else class="history-button__icon" aria-hidden="true" />
        </button>
      </BaseTooltip>
      <span v-if="screenshotMessage" class="screenshot-message" role="status">
        {{ screenshotMessage }}
      </span>
      <DropMenu
        :label="screenshotCapturing ? chartScreenshotLabels.capturing : chartScreenshotLabels.capture"
        :groups="screenshotMenuGroups"
        :disabled="screenshotCapturing"
        trigger-class="screenshot-button"
        tooltip-placement="bottom"
        placement="bottom"
        @select="onScreenshotSelect"
      >
        <template #trigger>
          <IconTablerCamera class="screenshot-button__icon" aria-hidden="true" />
        </template>
        <template #item-icon="{ item }">
          <IconTablerDownload
            v-if="item.id === chartScreenshotActions.download"
            aria-hidden="true"
          />
          <IconTablerClipboard v-else-if="item.id === chartScreenshotActions.copy" aria-hidden="true" />
        </template>
      </DropMenu>
      <slot name="watchlist"></slot>
      <BaseTooltip content="设置" placement="bottom">
        <button
          type="button"
          class="control-button history-button"
          aria-label="设置"
          @click="emit('settings')"
        >
          <IconTablerSettings class="history-button__icon" aria-hidden="true" />
        </button>
      </BaseTooltip>
    </div>
  </div>
</template>

<script setup lang="ts">
  import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
  import type { KLinePeriod } from '@363045841yyt/klinechart-core/market-data'
  import { computed, ref } from 'vue'
  import IconTablerArrowBackUp from '~icons/tabler/arrow-back-up'
  import IconTablerArrowForwardUp from '~icons/tabler/arrow-forward-up'
  import IconTablerArrowLeft from '~icons/tabler/arrow-left'
  import IconTablerCamera from '~icons/tabler/camera'
  import IconTablerClipboard from '~icons/tabler/clipboard'
  import IconTablerDownload from '~icons/tabler/download'
  import IconTablerMaximize from '~icons/tabler/maximize'
  import IconTablerMinimize from '~icons/tabler/minimize'
  import IconTablerSettings from '~icons/tabler/settings'
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
  import BaseTooltip from './common/BaseTooltip.vue'
  import DropMenu, { type DropMenuGroup } from './DropMenu.vue'
  import KLineAdjustmentDropdown, { type KLineAdjustment } from './KLineAdjustmentDropdown.vue'
  import KLineLevelDropdown from './KLineLevelDropdown.vue'
  import { isKLineLevel, type KLineLevel } from './kLineLevel'
  import LayoutMenu from './LayoutMenu.vue'
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
      layoutController?: ChartController | null
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
      canUndoDrawing?: boolean
      canRedoDrawing?: boolean
      isFullscreen?: boolean
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
    (e: 'undoDrawing'): void
    (e: 'redoDrawing'): void
    (e: 'toggleFullscreen'): void
    (e: 'settings'): void
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
    border-radius: 0;
    background: var(--klc-color-ui-surface);
    box-sizing: border-box;
    user-select: none;
  }

  .top-toolbar__controls {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 0;
    height: 100%;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
  }

  .top-toolbar__controls::-webkit-scrollbar {
    display: none;
  }

  .top-toolbar__item {
    position: relative;
    flex: 0 0 auto;
  }

  .top-toolbar__item + .top-toolbar__item {
    margin-left: 4px;
    padding-left: 5px;
  }

  .top-toolbar__item + .top-toolbar__item::before {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    height: 22px;
    width: 1px;
    transform: translateY(-50%);
    background: var(--klc-color-ui-border);
  }

  .top-toolbar :deep(.symbol-chip),
  .top-toolbar :deep(.compare-chip),
  .top-toolbar__item :deep(.drop-menu__trigger),
  .top-toolbar .back-button,
  .top-toolbar .history-button,
  .top-toolbar :deep(.screenshot-button) {
    height: 30px;
    padding: 0 10px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    box-shadow: none;
  }

  .top-toolbar :deep(.symbol-chip:hover),
  .top-toolbar :deep(.symbol-chip.is-open),
  .top-toolbar :deep(.symbol-chip[aria-expanded='true']),
  .top-toolbar :deep(.compare-chip:hover),
  .top-toolbar :deep(.compare-chip.is-open),
  .top-toolbar__item :deep(.drop-menu__trigger:hover:not(:disabled)),
  .top-toolbar__item :deep(.drop-menu__trigger[aria-expanded='true']),
  .top-toolbar .back-button:hover:not(:disabled),
  .top-toolbar .history-button:hover:not(:disabled) {
    background: var(--klc-color-ui-hover);
  }

  .back-button {
    flex: 0 0 auto;
    margin-left: auto;
  }

  .back-button__icon {
    width: 15px;
    height: 15px;
  }

  .layout-actions {
    display: flex;
    align-items: center;
    flex: 0 0 auto;
    margin-left: auto;
    border-left: 1px solid var(--klc-color-ui-border);
    padding-left: 4px;
  }

  .screenshot-actions {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 2px;
    border-left: 1px solid var(--klc-color-ui-border);
    padding-left: 4px;
  }

  .screenshot-actions .history-button,
  .screenshot-actions :deep(.screenshot-button) {
    color: var(--klc-color-ui-muted);
    width: 30px;
    min-width: 30px;
    padding: 0;
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

  .history-button__icon {
    width: 18px;
    height: 18px;
  }

  .screenshot-message {
    color: var(--klc-color-ui-text);
    font-size: 12px;
  }
</style>
