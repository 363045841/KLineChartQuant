<template>
  <div ref="chartWrapperRef" class="chart-wrapper" :data-theme="chartTheme" :style="themeCssVars">
    <TopToolbar
      :symbol="currentSymbol"
      :k-line-level="kLineLevel"
      :k-line-adjust="kLineAdjust"
      :symbol-loading="symbolLoading"
      :symbol-error="symbolError"
      :overlay-symbols="overlaySymbols"
      :comparison-colors="comparisonColorsMap"
      :comparison-loading="comparisonLoading"
      @add-overlay-symbol="onAddOverlaySymbol"
      @remove-overlay-symbol="onRemoveOverlaySymbol"
      @k-line-level-change="onKLineLevelChange"
      @k-line-adjust-change="onKLineAdjustChange"
      @toggle-indicator="onToggleIndicator"
      @symbol-change="onSymbolChange"
    />
    <div
      class="chart-stage"
      :class="{
        'is-dragging': isDragging,
        'is-resizing-pane': isResizingPane,
        'is-hovering-pane-separator': isHoveringPaneSeparator,
        'is-hovering-right-axis': isHoveringRightAxis,
        'is-hovering-kline': hoveredIdx !== null,
      }"
    >
      <LeftToolbar
        ref="toolbarRef"
        :is-fullscreen="isFullscreen"
        @select-tool="handleSelectTool"
        @toggle-fullscreen="$emit('toggleFullscreen')"
        @zoom-in="applyZoomToLevel(zoomLevel + 1)"
        @zoom-out="applyZoomToLevel(zoomLevel - 1)"
        @settings-change="handleSettingsChange"
      />
      <div class="chart-main" ref="chartMainRef">
        <div class="pane-separator-layer" aria-hidden="true">
          <div
            v-for="line in paneSeparatorLines"
            :key="line.id"
            class="pane-separator-line"
            :class="{ 'is-active': hoveredPaneBoundaryId === line.id }"
            :style="{ top: `${line.top}px` }"
          ></div>
        </div>
        <div ref="tooltipLayerRef" class="tooltip-layer"></div>
        <div
          class="chart-container"
          :style="{ cursor: containerCursor }"
          ref="containerRef"
          @scroll.passive="onScroll"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointerleave="onPointerLeave"
        >
          <div class="scroll-content" :style="{ width: totalWidth + 'px' }">
            <div class="canvas-layer" ref="canvasLayerRef">
              <canvas class="x-axis-canvas" ref="xAxisCanvasRef"></canvas>

              <DrawingStyleToolbar
                v-if="selectedDrawing"
                :drawing="selectedDrawing"
                @update-style="onUpdateDrawingStyle"
                @delete="onDeleteDrawing"
              />
              <div
                v-if="rangeSelectionReady"
                class="range-selection-export"
                @pointerdown.stop
                @pointermove.stop
                @pointerup.stop
              >
                <input
                  class="range-selection-export__label"
                  v-model="customStartDate"
                  :placeholder="rangeSelectionStartLabel"
                />
                <span class="range-selection-export__sep">~</span>
                <input
                  class="range-selection-export__label"
                  v-model="customEndDate"
                  :placeholder="rangeSelectionEndLabel"
                />
                <button
                  type="button"
                  class="toolbar-btn"
                  title="批量设置"
                  @click.stop="showBatchStockDialog = true"
                >
                  批量设置
                </button>
                <button
                  type="button"
                  class="toolbar-btn"
                  title="导出"
                  @click.stop="exportRangeToCsv"
                >
                  导出
                </button>
                <button
                  type="button"
                  class="toolbar-btn delete-btn"
                  title="删除选区"
                  @click.stop="clearRangeSelection"
                >
                  <svg class="delete-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M3 6h18" />
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                  </svg>
                </button>
              </div>
            </div>
            <div
              v-if="rangeSelectionOverlayStyle"
              class="range-selection-overlay"
              :class="{ 'is-dragging': rangeSelection.isDragging }"
              :style="rangeSelectionOverlayStyle"
              aria-label="已选择的 K 线区间"
            >
              <div
                v-if="rangeSelectionReady"
                class="range-selection-handle range-selection-handle--left"
                @pointerdown.stop="onEdgePointerDown('left', $event)"
                @pointermove.stop="onEdgePointerMove($event)"
                @pointerup.stop="onEdgePointerUp($event)"
              />
              <div
                v-if="rangeSelectionReady"
                class="range-selection-handle range-selection-handle--right"
                @pointerdown.stop="onEdgePointerDown('right', $event)"
                @pointermove.stop="onEdgePointerMove($event)"
                @pointerup.stop="onEdgePointerUp($event)"
              />
            </div>
          </div>
        </div>
        <Teleport v-if="tooltipLayerRef" :to="tooltipLayerRef">
          <div
            v-if="hovered"
            class="tooltip-anchor kline-tooltip-anchor"
            :class="{ 'use-anchor': useAnchorPositioning }"
            :style="klineTooltipAnchorStyle"
          ></div>
          <div
            v-if="hoveredMarker || hoveredCustomMarker"
            class="tooltip-anchor marker-tooltip-anchor"
            :class="{ 'use-anchor': useAnchorPositioning }"
            :style="markerTooltipAnchorStyle"
          ></div>
          <KLineTooltip
            v-if="hovered"
            :k="hovered"
            :index="hoveredIndex"
            :data="chartData"
            :pos="teleportedTooltipPos"
            :set-el="setTooltipEl"
            :use-anchor="useAnchorPositioning"
            :anchor-placement="tooltipAnchorPlacement"
            :up-color="tooltipColors.upColor"
            :down-color="tooltipColors.downColor"
            :timezone="props.timezone"
            :show-time="isIntraday"
          />
          <MarkerTooltip
            v-if="hoveredMarker || hoveredCustomMarker"
            :marker="hoveredMarker || hoveredCustomMarker"
            :pos="teleportedMarkerTooltipPos"
            :use-anchor="useAnchorPositioning"
            :anchor-placement="markerTooltipAnchorPlacement"
            :set-el="setMarkerTooltipEl"
          />
        </Teleport>
        <div
          class="right-axis-host"
          ref="rightAxisLayerRef"
          :style="{ width: axisHostWidth + 'px' }"
          @pointerdown="onRightAxisPointerDown"
          @pointermove="onRightAxisPointerMove"
          @pointerup="onRightAxisPointerUp"
          @pointerleave="onRightAxisPointerLeave"
        ></div>
      </div>
    </div>
    <ExportProgressDialog :progress="exportingProgress" @close="exportingProgress = null" />
    <BatchStockDialog
      :show="showBatchStockDialog"
      @close="showBatchStockDialog = false"
      @apply="onBatchApply"
    />
    <IndicatorSelector
      ref="indicatorSelectorRef"
      :active-indicators="activeIndicators"
      :indicator-params="indicatorParams"
      @toggle="handleIndicatorToggle"
      @update-params="handleUpdateParams"
      @reorder-sub-indicators="handleReorderSubIndicators"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick, shallowRef } from 'vue'
import {
  SemanticChartController,
  type SemanticChartConfig,
  type DataFetcher,
} from '@363045841yyt/klinechart-core/semantic'
import KLineTooltip from './KLineTooltip.vue'
import MarkerTooltip from './MarkerTooltip.vue'
import IndicatorSelector from './IndicatorSelector.vue'
import DrawingStyleToolbar from './DrawingStyleToolbar.vue'
import { provideFullscreenTeleportTarget } from '../composables/useFullscreenTeleportTarget'
import {
  createChartController,
  type ChartController,
  type InteractionSnapshot,
  type SymbolSpec,
  zoomLevelToKWidth,
  kGapFromKWidth,
} from '@363045841yyt/klinechart-core/controllers'
import { useChartTheme } from '../composables/chart/useChartTheme'
import { useIndicatorManager } from '../composables/chart/useIndicatorManager'
import { useDrawingManager } from '../composables/chart/useDrawingManager'
import { SETTINGS_STORAGE_KEY } from '@363045841yyt/klinechart-core/config'
import { useRangeSelection } from '../composables/chart/useRangeSelection'
import LeftToolbar from './LeftToolbar.vue'
import TopToolbar, { type SymbolItem } from './TopToolbar.vue'
import BatchStockDialog from './BatchStockDialog.vue'
import ExportProgressDialog from './ExportProgressDialog.vue'

// ── Props & Emits ──
const props = withDefaults(
  defineProps<{
    /** 语义化配置（可选，唯一控制源） */
    semanticConfig?: SemanticChartConfig

    /** 数据获取函数（必需）。框架不绑定数据源，由使用者注入。 */
    dataFetcher: DataFetcher

    yPaddingPx?: number
    minKWidth?: number
    maxKWidth?: number
    /** 右侧价格轴宽度 */
    rightAxisWidth?: number
    /** 底部时间轴高度 */
    bottomAxisHeight?: number
    /** 价格标签额外宽度（用于显示涨跌幅，默认 60px） */
    priceLabelWidth?: number

    /** 缩放级别数量（默认 10） */
    zoomLevels?: number
    /** 初始缩放级别（1 ~ zoomLevels，默认居中） */
    initialZoomLevel?: number
    /** 是否全屏 */
    isFullscreen?: boolean
    /** 时区，默认 Asia/Shanghai */
    timezone?: string

    /** MCP / AI runtime bridge 配置。传入后自动连接 MCP WebSocket server */
    mcp?: {
      wsUrl?: string
      onToolCall?: (call: {
        name: string
        input: Record<string, unknown>
      }) =>
        | { success: boolean; error?: string; data?: unknown }
        | Promise<{ success: boolean; error?: string; data?: unknown }>
      autoReconnect?: boolean
    }
  }>(),
  {
    yPaddingPx: 20,
    minKWidth: 1,
    maxKWidth: 50,
    rightAxisWidth: 0,
    bottomAxisHeight: 24,
    priceLabelWidth: 60,
    zoomLevels: 20,
    initialZoomLevel: 3,
    isFullscreen: false,
    timezone: 'Asia/Shanghai',
  },
)

const emit = defineEmits<{
  (e: 'zoomLevelChange', level: number, kWidth: number): void
  (e: 'toggleFullscreen'): void
  (e: 'themeChange', theme: 'light' | 'dark'): void
  (e: 'kLineLevelChange', level: string): void
  (e: 'kLineAdjustChange', adjust: 'qfq' | 'hfq' | 'splits' | 'none'): void
}>()

// ── Symbol / Comparison State ──
const kLineLevel = ref(props.semanticConfig?.data?.period ?? 'daily')
const kLineAdjust = ref(props.semanticConfig?.data?.adjust ?? 'none')
const isIntraday = computed(() => kLineLevel.value.includes('min'))
const currentSymbol = ref('选择商品')
const currentSymbolItem = ref<SymbolItem | null>(null)
const symbolLoading = ref(false)
const symbolError = ref(false)
const overlaySymbols = ref<string[]>([])
const overlaySymbolItems = ref<SymbolItem[]>([])

function onKLineLevelChange(level: string) {
  kLineLevel.value = level as typeof kLineLevel.value
  emit('kLineLevelChange', level)
  syncSymbolsToController()
}

function onKLineAdjustChange(adjust: 'qfq' | 'hfq' | 'splits' | 'none') {
  kLineAdjust.value = adjust
  emit('kLineAdjustChange', adjust)
  syncSymbolsToController()
}

function onSymbolChange(item: SymbolItem) {
  symbolError.value = false
  currentSymbol.value = item.code
  currentSymbolItem.value = item
  syncSymbolsToController()
}

function onAddOverlaySymbol(item: SymbolItem) {
  if (currentSymbolItem.value?.code === item.code) return
  if (overlaySymbols.value.includes(item.code)) return
  overlaySymbolItems.value = [...overlaySymbolItems.value, item]
  overlaySymbols.value = overlaySymbolItems.value.map((symbol) => symbol.code)
  forcePercentAxis()
  controller.value?.addComparisonSymbol(toSymbolSpec(item))
}

function onRemoveOverlaySymbol(code: string) {
  overlaySymbolItems.value = overlaySymbolItems.value.filter((item) => item.code !== code)
  overlaySymbols.value = overlaySymbolItems.value.map((symbol) => symbol.code)
  controller.value?.removeComparisonSymbol(code)
}

function toSymbolSpec(item: SymbolItem): SymbolSpec {
  return {
    symbol: item.code,
    exchange: item.exchange,
    period: kLineLevel.value,
    source: item.source,
    startDate: props.semanticConfig?.data?.startDate ?? '',
    endDate: props.semanticConfig?.data?.endDate ?? '',
    adjust: kLineAdjust.value,
  }
}

function syncSymbolsToController() {
  if (!currentSymbolItem.value) return
  controller.value?.setSymbols([
    toSymbolSpec(currentSymbolItem.value),
    ...overlaySymbolItems.value.map(toSymbolSpec),
  ])
}

function forcePercentAxis() {
  if (chartSettings.value.axisType === 'percent') return
  const nextSettings = { ...chartSettings.value, axisType: 'percent' as const }
  chartSettings.value = nextSettings
  controller.value?.updateSettingsFacade(nextSettings)
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(nextSettings))
  } catch {
    /* quota exceeded */
  }
}

// ── DOM Template Refs ──
const containerRef = ref<HTMLDivElement | null>(null)
const chartMainRef = ref<HTMLDivElement | null>(null)
const chartWrapperRef = ref<HTMLDivElement | null>(null)
const tooltipLayerRef = ref<HTMLDivElement | null>(null)
const toolbarRef = ref<InstanceType<typeof LeftToolbar> | null>(null)
const indicatorSelectorRef = ref<InstanceType<typeof IndicatorSelector> | null>(null)
provideFullscreenTeleportTarget(chartWrapperRef)

// ── Controller & Composable Wiring ──
const controller = shallowRef<ChartController | null>(null)

const {
  chartTheme,
  chartSettings,
  tooltipColors,
  themeCssVars,
  handleSettingsChange,
  applyThemeFromSettings,
} = useChartTheme(controller)

const semanticController = shallowRef<SemanticChartController | null>(null)

/* ========== 本地响应式状态 ========== */
const dataLength = ref(0)
const dataVersion = ref(0)
const showBatchStockDialog = ref(false)
const batchStockCodes = ref<string[]>([])
const viewportVersion = ref(0)
const viewportDpr = ref(1)
const zoomLevel = ref(props.initialZoomLevel ?? 1)
const kWidth = ref(0)
const kGap = ref(1)
const viewWidth = ref(0)
const paneRatios = ref<Record<string, number>>({})
const comparisonColorsMap = ref<Map<string, string>>(new Map())
const comparisonLoading = ref(false)
const activeToolId = ref('cursor')

const {
  mainActiveIndicators,
  subActiveIndicators,
  activeIndicators,
  indicatorParams,
  subPanes,
  buildPaneLayoutIntent,
  getDefaultParams,
  isSubPaneIndicator,
  addSubPane,
  removeSubPane,
  clearAllSubPanes,
  initIndicatorsFromConfig,
  switchSubIndicator,
  handleIndicatorToggle,
  handleUpdateParams,
  handleReorderSubIndicators,
  setupIndicatorSubscriptions,
} = useIndicatorManager(controller, paneRatios)

const {
  drawingController,
  selectedDrawingId,
  selectedDrawing,
  drawings,
  handleSelectTool: handleDrawingToolSelect,
  onUpdateDrawingStyle,
  onDeleteDrawing,
  setupDrawing,
} = useDrawingManager(controller)

const {
  rangeSelection,
  customStartDate,
  customEndDate,
  containerScrollLeft,
  isRangeSelectActive,
  rangeSelectionReady,
  rangeSelectionBounds,
  rangeSelectionStartLabel,
  rangeSelectionEndLabel,
  rangeSelectionOverlayStyle,
  clearRangeSelection,
  handleRangePointerDown,
  handleRangePointerMove,
  handleRangePointerUp,
  exportRangeToCsv,
  exportingProgress,
  onEdgePointerDown,
  onEdgePointerMove,
  onEdgePointerUp,
  onScroll: onRangeScroll,
  syncScrollLeft: syncRangeScrollLeft,
} = useRangeSelection({
  controller,
  activeToolId,
  containerRef,
  dataVersion,
  viewportVersion,
  dataFetcher: computed(() => props.dataFetcher),
  batchStockCodes,
})

// ── Viewport Initial Values ──
// 初始化 kWidth / kGap（与 Chart 引擎 zoom→物理值 转换一致）
const initZoom = zoomLevel.value
kWidth.value = zoomLevelToKWidth(initZoom, {
  minKWidth: props.minKWidth,
  maxKWidth: props.maxKWidth,
  zoomLevelCount: props.zoomLevels,
  dpr: viewportDpr.value,
})
kGap.value = kGapFromKWidth(kWidth.value, viewportDpr.value)

// ── No-op Render Trigger (exposed) ──
function scheduleRender() {
  /* Controller auto-renders on state changes */
}

// ── Tooltip Measurement ──
function measureTooltipSize(el: HTMLDivElement, minWidth: number, minHeight: number) {
  const r = el.getBoundingClientRect()
  return {
    width: Math.max(minWidth, Math.round(r.width)),
    height: Math.max(minHeight, Math.round(r.height)),
  }
}

function setTooltipEl(el: HTMLDivElement | null) {
  if (!el) return
  nextTick(() => {
    if (!el.isConnected) return
    const size = measureTooltipSize(el, 180, 80)
    controller.value?.setTooltipSize(size)
  })
}

function setMarkerTooltipEl(el: HTMLDivElement | null) {
  if (!el) return
  nextTick(() => {
    if (!el.isConnected) return
    markerTooltipSize.value = measureTooltipSize(el, 120, 60)
  })
}

// ── Marker Tooltip & Container Rect Cache ──
const mousePos = ref({ x: 0, y: 0 })
const useAnchorPositioning = ref(false)

let _cachedContainerRect: DOMRect | null = null
function invalidateContainerRectCache(): void {
  _cachedContainerRect = null
}
function getContainerRect(container: HTMLDivElement): DOMRect {
  if (!_cachedContainerRect) {
    _cachedContainerRect = container.getBoundingClientRect()
  }
  return _cachedContainerRect
}

// ── Interaction State Bridge ──
const interactionState = shallowRef<InteractionSnapshot>({
  crosshairPos: null,
  crosshairIndex: null,
  crosshairPrice: null,
  hoveredIndex: null,
  activePaneId: null,
  tooltipPos: { x: 0, y: 0 },
  tooltipAnchorPlacement: 'right-bottom',
  hoveredMarkerData: null,
  hoveredCustomMarker: null,
  isDragging: false,
  isResizingPaneBoundary: false,
  isHoveringPaneBoundary: false,
  hoveredPaneBoundaryId: null,
  isHoveringRightAxis: false,
})

const paneSeparatorLines = ref<Array<{ id: string; top: number }>>([])
const markerTooltipSize = ref({ width: 220, height: 120 })
const tooltipLayerOffset = computed(() => {
  const container = containerRef.value
  const chartMain = chartMainRef.value
  if (!container || !chartMain) return { x: 0, y: 0 }
  return {
    x: container.offsetLeft,
    y: container.offsetTop,
  }
})

const hoveredMarker = computed(() => interactionState.value.hoveredMarkerData)
const hoveredCustomMarker = computed(() => interactionState.value.hoveredCustomMarker)
const isDragging = computed(() => interactionState.value.isDragging)
const isResizingPane = computed(() => interactionState.value.isResizingPaneBoundary)
const isHoveringPaneSeparator = computed(() => interactionState.value.isHoveringPaneBoundary)
const hoveredPaneBoundaryId = computed(() => interactionState.value.hoveredPaneBoundaryId)
const isHoveringRightAxis = computed(() => interactionState.value.isHoveringRightAxis)
const hoveredIdx = computed(() => interactionState.value.hoveredIndex)
const crosshairIdx = computed(() => interactionState.value.crosshairIndex)

// ── Derived Computed (Cursor, Hovered, Tooltip) ──
const containerCursor = computed(() => {
  if (isDragging.value) return 'grabbing'
  if (isResizingPane.value || isHoveringPaneSeparator.value) return 'ns-resize'
  if (hoveredIdx.value !== null) return 'pointer'
  return 'crosshair'
})

const hovered = computed(() => {
  const idx = interactionState.value.hoveredIndex
  if (typeof idx !== 'number') return null
  void dataVersion.value
  const data = controller.value?.getData()
  if (data && idx >= 0 && idx < data.length) {
    return data[idx]
  }
  return null
})
const hoveredIndex = computed(() => interactionState.value.hoveredIndex)
const tooltipPos = computed(() => interactionState.value.tooltipPos)
const teleportedTooltipPos = computed(() => ({
  x: tooltipPos.value.x + tooltipLayerOffset.value.x,
  y: tooltipPos.value.y + tooltipLayerOffset.value.y,
}))
const klineTooltipAnchorStyle = computed(() => ({
  left: `${teleportedTooltipPos.value.x}px`,
  top: `${teleportedTooltipPos.value.y}px`,
}))
const teleportedMarkerTooltipPos = computed(() => ({
  x: mousePos.value.x + tooltipLayerOffset.value.x,
  y: mousePos.value.y + tooltipLayerOffset.value.y,
}))
const markerTooltipAnchorStyle = computed(() => ({
  left: `${teleportedMarkerTooltipPos.value.x}px`,
  top: `${teleportedMarkerTooltipPos.value.y}px`,
}))
const tooltipAnchorPlacement = computed(() => interactionState.value.tooltipAnchorPlacement)
const markerTooltipAnchorPlacement = computed<'right-bottom' | 'left-bottom'>(() => {
  const c = controller.value
  const viewport = c?.viewport.peek()
  const container = containerRef.value
  const plotWidth = viewport?.plotWidth ?? (container ? container.clientWidth : 0)
  const padding = 12
  const gap = 12
  const rightCandidateX = mousePos.value.x + gap
  const wouldOverflowRight = rightCandidateX + markerTooltipSize.value.width + padding > plotWidth
  return wouldOverflowRight ? 'left-bottom' : 'right-bottom'
})

const chartData = computed(() => {
  void dataVersion.value
  return controller.value?.getData() ?? []
})

// ── Pointer Event Handlers ──
function onToggleIndicator() {
  indicatorSelectorRef.value?.toggleMenu()
}

function onBatchApply(codes: string[]) {
  batchStockCodes.value = codes
}

function handleSelectTool(toolId: string) {
  activeToolId.value = toolId
  if (toolId === 'range-select') {
    drawingController.value?.setTool('cursor')
    selectedDrawingId.value = null
    return
  }

  clearRangeSelection()
  handleDrawingToolSelect(toolId)
}

function onPointerDown(e: PointerEvent) {
  controller.value?.handlePointerEvent(e, {
    onPointerDown: (event, container) => {
      if (handleRangePointerDown(event, container)) {
        return true
      }
      if (drawingController.value?.onPointerDown(event, container)) {
        return true
      }
      return false
    },
  })
}

function onPointerMove(e: PointerEvent) {
  const container = containerRef.value
  if (container) {
    const rect = getContainerRect(container)
    mousePos.value = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }
  }
  controller.value?.handlePointerEvent(e, {
    onPointerMove: (event, container) => {
      if (handleRangePointerMove(event, container)) {
        return true
      }
      if (drawingController.value?.onPointerMove(event, container)) {
        drawings.value = drawingController.value.getDrawings()
        return true
      }
      return false
    },
  })
}

function onPointerUp(e: PointerEvent) {
  controller.value?.handlePointerEvent(e, {
    onPointerUp: (event, container) => {
      if (handleRangePointerUp(event, container)) {
        return true
      }
      if (drawingController.value?.onPointerUp(event, container)) {
        return true
      }
      return false
    },
  })
}

function onPointerLeave(e: PointerEvent) {
  controller.value?.handlePointerEvent(e)
}

function onRightAxisPointerDown(e: PointerEvent) {
  controller.value?.handlePointerEvent(e)
}

function onRightAxisPointerMove(e: PointerEvent) {
  controller.value?.handlePointerEvent(e)
}

function onRightAxisPointerUp(e: PointerEvent) {
  controller.value?.handlePointerEvent(e)
}

function onRightAxisPointerLeave(e: PointerEvent) {
  controller.value?.handlePointerEvent(e)
}

function onScroll() {
  onRangeScroll()
  controller.value?.handleScrollEvent()
}

// ── Width / Zoom / Expose ──
const axisHostWidth = computed(() => props.rightAxisWidth + props.priceLabelWidth)

const totalWidth = computed(() => {
  void dataVersion.value
  void viewWidth.value
  void kWidth.value
  void kGap.value
  void viewportDpr.value
  return controller.value?.getContentWidth() ?? 0
})

function applyZoomToLevel(targetLevel: number, anchorX?: number) {
  controller.value?.zoomToLevel(targetLevel, anchorX)
}

defineExpose({
  scheduleRender,
  addSubPane,
  removeSubPane,
  switchSubIndicator,
  clearAllSubPanes,
  zoomToLevel: applyZoomToLevel,
  zoomIn: (anchorX?: number) => applyZoomToLevel(zoomLevel.value + 1, anchorX),
  zoomOut: (anchorX?: number) => applyZoomToLevel(zoomLevel.value - 1, anchorX),
  getZoomLevel: () => zoomLevel.value,
  getZoomLevelCount: () => controller.value?.getZoomLevelCount() ?? 10,
  getController: () => controller.value,
})

// ── Lifecycle Setup ──

function setupWheelHandler(): (e: WheelEvent) => void {
  const onWheelHandler = (e: WheelEvent) => {
    e.preventDefault()
    controller.value?.handleWheelEvent(e)
  }
  return onWheelHandler
}

function initChart(
  container: HTMLDivElement,
  canvasLayer: HTMLDivElement,
  rightAxisLayer: HTMLDivElement,
  xAxisCanvas: HTMLCanvasElement,
): Promise<ChartController> {
  const ctrl = createChartController({
    container,
    data: [],
    canvasLayer,
    rightAxisLayer,
    xAxisCanvas,
    initialZoomLevel: props.initialZoomLevel,
    zoomLevels: props.zoomLevels,
    yPaddingPx: props.yPaddingPx,
    rightAxisWidth: props.rightAxisWidth,
    bottomAxisHeight: props.bottomAxisHeight,
    priceLabelWidth: props.priceLabelWidth,
    minKWidth: props.minKWidth,
    maxKWidth: props.maxKWidth,
    mcp: props.mcp,
  })
  return ctrl
}

function setupChartCallbacks(ctrl: ChartController): void {
  const unsubscribePaneLayout = ctrl.paneLayout.subscribe(() => {
    invalidateContainerRectCache()
    const borderTop = containerRef.value
      ? parseInt(getComputedStyle(containerRef.value).borderTopWidth) || 0
      : 0
    const panes = ctrl.paneLayout.peek()
    // 使用 pane 的实际渲染位置计算分隔线位置，确保与鼠标检测一致
    paneSeparatorLines.value = panes.slice(0, -1).map((pane) => {
      const paneInfo = ctrl.getPaneInfo(pane.id)
      // 分隔线位置 = pane 顶部位置 + pane 实际高度
      const separatorTop = (paneInfo?.top ?? 0) + (paneInfo?.height ?? 0)
      return { id: pane.id, top: separatorTop + borderTop }
    })
  })

  const unsubscribePaneRatios = ctrl.paneRatios.subscribe(() => {
    const ratios = ctrl.paneRatios.peek()
    paneRatios.value = { ...ratios }
  })

  const unsubscribeViewport = ctrl.viewport.subscribe(() => {
    const vp = ctrl.viewport.peek()

    viewportVersion.value++

    if (viewportDpr.value !== vp.dpr) {
      viewportDpr.value = vp.dpr
    }
    if (viewWidth.value !== vp.plotWidth) {
      viewWidth.value = vp.plotWidth
    }
    if (zoomLevel.value !== vp.zoomLevel || kWidth.value !== vp.kWidth || kGap.value !== vp.kGap) {
      zoomLevel.value = vp.zoomLevel
      kWidth.value = vp.kWidth
      kGap.value = vp.kGap
    }

    nextTick(() => {
      requestAnimationFrame(() => {
        syncRangeScrollLeft()
      })
    })
  })

  const unsubscribeData = ctrl.data.subscribe(() => {
    const data = ctrl.data.peek()
    dataLength.value = data.length
    dataVersion.value++
    symbolError.value = data.length === 0
  })

  const unsubscribeDataLoading = ctrl.dataLoading.subscribe(() => {
    symbolLoading.value = ctrl.dataLoading.peek()
  })

  const unsubscribeTheme = ctrl.theme.subscribe(() => {
    const newTheme = ctrl.theme.peek()
    chartTheme.value = newTheme
    emit('themeChange', newTheme)
  })

  const unsubscribeIndicators = setupIndicatorSubscriptions(ctrl)

  const unsubscribeComparisonColors = ctrl.comparisonColors.subscribe(() => {
    comparisonColorsMap.value = new Map(ctrl.comparisonColors.peek())
  })

  const unsubscribeComparisonLoading = ctrl.comparisonLoading.subscribe(() => {
    comparisonLoading.value = ctrl.comparisonLoading.peek()
  })

  onUnmounted(() => {
    unsubscribeViewport()
    unsubscribeData()
    unsubscribeDataLoading()
    unsubscribePaneRatios()
    unsubscribePaneLayout()
    unsubscribeTheme()
    unsubscribeIndicators()
    unsubscribeComparisonColors()
    unsubscribeComparisonLoading()
  })
}

function applyInitialSettings(ctrl: ChartController): void {
  const initialSettings = toolbarRef.value?.getSettings() ?? { showVolumePriceMarkers: true }
  chartSettings.value = initialSettings
  applyThemeFromSettings(initialSettings.theme as string)
  ctrl.updateSettingsFacade(initialSettings)
}

function setupInteractionCallbacks(ctrl: ChartController): void {
  ctrl.setTooltipAnchorPositioning(useAnchorPositioning.value)
  ctrl.interactionState.subscribe(() => {
    interactionState.value = ctrl.interactionState.peek()
  })

  interactionState.value = ctrl.interactionState.peek()
  viewportDpr.value = ctrl.viewport.peek().dpr
}

function setupSemanticController(ctrl: ChartController): void {
  ctrl.setDataFetcher(props.dataFetcher)
  semanticController.value = new SemanticChartController(ctrl)

  semanticController.value.on('config:error', (error) => {
    console.error('Semantic config error:', error)
  })

  // config:ready → Chart 侧已完成创建，Vue 回读状态
  semanticController.value.on('config:ready', () => {
    initIndicatorsFromConfig(props.semanticConfig)
    nextTick(() => controller.value?.scrollToRight())
  })
  // 暂时断开语义化配置加载，由搜索结果驱动
  // semanticController.value.applyConfig(props.semanticConfig).then((result) => {
  //   if (result && !result.success) {
  //     console.error('Semantic config apply failed:', result.errors)
  //   }
  // })
}

// ── onMounted ──
onMounted(async () => {
  useAnchorPositioning.value = false

  const container = containerRef.value
  const chartMain = chartMainRef.value
  if (!container || !chartMain) return

  // 1) 滚轮缩放处理
  const onWheelHandler = setupWheelHandler()
  container.addEventListener('wheel', onWheelHandler, { passive: false })

  // 2) 创建 Chart 控制器（使用模板 DOM 元素）
  const canvasLayer = container.querySelector<HTMLDivElement>('.canvas-layer')
  const xAxisCanvas = container.querySelector<HTMLCanvasElement>('.x-axis-canvas')
  const rightAxisLayer = chartMain.querySelector<HTMLDivElement>('.right-axis-host')
  const ctrl = await initChart(container, canvasLayer!, rightAxisLayer!, xAxisCanvas!)
  if (!containerRef.value || !chartMainRef.value) return // 组件已卸载
  controller.value = ctrl

  // 3) 信号回调
  setupChartCallbacks(ctrl)

  // 3.5) 在任何 draw 之前注册主图指标（BOLL/MA 等）
  //      initIndicatorsFromConfig 是同步的，读 props.semanticConfig 即可注册，
  //      确保 scheduler 首次 applyResults 时 BOLL 已在 registry 里
  initIndicatorsFromConfig(props.semanticConfig)

  // 4) 工具栏初始设置
  applyInitialSettings(ctrl)

  // 5) 绘图交互控制器
  setupDrawing(ctrl)

  // 6) 交互信号桥接
  setupInteractionCallbacks(ctrl)

  // 7) 语义化配置
  setupSemanticController(ctrl)
})

// ── onUnmounted & Watchers ──
onUnmounted(() => {
  const ctrl = controller.value
  if (ctrl) {
    controller.value = null
    ctrl.dispose()
  }
  drawingController.value = null
})

// kWidth/kGap 由 zoomLevel 派生，不再通过 props 直接修改
// 如需程序化控制缩放，请使用 expose 的 zoomToLevel/zoomIn/zoomOut 方法

watch(
  () => props.yPaddingPx,
  (newVal) => {
    controller.value?.updateOptionsFacade({ yPaddingPx: newVal })
  },
)

// 监听 semanticConfig 变化（唯一数据源）
watch(
  () => props.semanticConfig,
  async (newConfig, oldConfig) => {
    if (newConfig && newConfig !== oldConfig) {
      const result = await semanticController.value?.applyConfig(newConfig)
      if (result && !result.success) {
        console.error('Semantic config apply failed:', result.errors)
      }
    }
  },
  { deep: true },
)
</script>

<style scoped>
.chart-wrapper {
  --kmap-height: var(--kmap-chart-height, 100%);
  --kmap-width: var(--kmap-chart-width, 100%);

  --chart-bg: var(--klc-color-chart-background);
  --chart-bg-secondary: var(--klc-color-chart-background);
  --chart-border: var(--klc-color-border-chart);
  --chart-border-active: #1890ff;
  --chart-text: var(--klc-color-foreground);
  --chart-text-secondary: var(--klc-color-axis-text);

  display: flex;
  align-items: center;
  width: var(--kmap-width);
  height: calc(var(--kmap-height) - 32px);
  min-height: 300px;
  flex-direction: column;
  margin: 16px 0;
  padding: 0;
  box-sizing: border-box;
  gap: 4px;
}

.chart-stage {
  width: 95%;
  flex: 1;
  min-height: 255px;
  display: flex;
  align-items: stretch;
  gap: 4px;
}

.chart-main {
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  display: flex;
  align-items: stretch;
  gap: 0;
  position: relative;
}

.pane-separator-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 20;
}

.pane-separator-line {
  position: absolute;
  left: 0;
  right: 0;
  height: 0;
  border-top: 1px solid var(--chart-border);
  opacity: 1;
  box-sizing: border-box;
  transition:
    border-top-color 120ms ease,
    border-top-width 120ms ease,
    margin-top 120ms ease,
    opacity 120ms ease;
}

.pane-separator-line.is-active {
  border-top-color: var(--chart-border-active);
  border-top-width: 2px;
  margin-top: -1px;
}

.chart-stage.is-resizing-pane,
.chart-stage.is-hovering-pane-separator {
  cursor: ns-resize;
}

.chart-stage.is-hovering-kline {
  cursor: pointer;
}

.chart-stage.is-hovering-right-axis {
  cursor: ns-resize;
}

.chart-stage.is-dragging {
  cursor: grabbing;
}

.chart-container {
  position: relative;
  flex: 1 1 auto;
  overflow-x: auto;
  overflow-y: hidden;
  height: 100%;
  min-height: inherit;
  scrollbar-width: none;
  -ms-overflow-style: none;
  border: 1px solid var(--chart-border);
  border-right: 0;
  border-radius: 3px 0 0 3px;
  box-sizing: border-box;
  background: var(--chart-bg);

  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
  touch-action: none;
}

.chart-container::-webkit-scrollbar {
  display: none;
}

.right-axis-host {
  position: relative;
  flex: 0 0 auto;
  height: 100%;
  min-height: inherit;
  box-sizing: border-box;
  background: var(--chart-bg);
  overflow: visible;
  border: 1px solid var(--chart-border);
  border-top-right-radius: 3px;
  border-bottom-right-radius: 3px;

  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
  touch-action: none;
}

.scroll-content {
  height: 100%;
  min-height: inherit;
  position: relative;
}

.range-selection-overlay {
  position: absolute;
  top: 0;
  z-index: 25;
  box-sizing: border-box;
  border: 1px solid rgba(24, 144, 255, 0.75);
  background: rgba(24, 144, 255, 0.14);
  pointer-events: none;
}

.range-selection-overlay.is-dragging {
  background: rgba(24, 144, 255, 0.2);
}

.range-selection-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 8px;
  cursor: ew-resize;
  pointer-events: auto;
  z-index: 101;
}

.range-selection-handle--left { left: -4px; }

.range-selection-handle--right { right: -4px; }

.range-selection-export {
  position: absolute;
  left: 50%;
  top: 8px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  height: 32px;
  background: color-mix(in srgb, var(--klc-color-tag-bg-white) 88%, transparent);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid var(--klc-color-border-button);
  border-radius: 6px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  z-index: 100;
  user-select: none;
  pointer-events: auto;
}

.range-selection-export .toolbar-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 24px;
  padding: 0 8px;
  border: 1px solid var(--klc-color-border-button);
  border-radius: 4px;
  background: transparent;
  color: var(--klc-color-axis-text);
  font-size: 12px;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background 0.15s ease,
    color 0.15s ease;
  white-space: nowrap;
}

.range-selection-export .toolbar-btn:hover {
  border-color: var(--klc-color-axis-line);
  background: var(--klc-color-grid-minor);
  color: var(--klc-color-foreground);
}

.range-selection-export .toolbar-btn.delete-btn {
  padding: 0;
  width: 24px;
  border-color: transparent;
}

.range-selection-export .toolbar-btn.delete-btn:hover {
  color: #dc2626;
  border-color: #fca5a5;
  background: #fef2f2;
}

.range-selection-export .delete-icon {
  width: 14px;
  height: 14px;
}

.range-selection-export__label {
  color: var(--klc-color-axis-text);
  font-size: 11px;
  white-space: nowrap;
  border: 1px solid var(--klc-color-border-button);
  background: none;
  outline: none;
  padding: 1px 4px;
  width: 80px;
  font-family: inherit;
  border-radius: 3px;
  text-align: center;
}

.range-selection-export__sep {
  color: var(--klc-color-axis-text);
  font-size: 11px;
  user-select: none;
}

.canvas-layer {
  position: sticky;
  left: 0;
  top: 0;
  pointer-events: none;
}

.tooltip-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 30;
}

.tooltip-anchor {
  position: absolute;
  width: 1px;
  height: 1px;
  pointer-events: none;
}

.tooltip-anchor.kline-tooltip-anchor.use-anchor {
  anchor-name: --kline-tooltip-anchor;
}

.tooltip-anchor.marker-tooltip-anchor.use-anchor {
  anchor-name: --marker-tooltip-anchor;
}

@media (max-width: 768px), (max-height: 640px) {
  .chart-wrapper {
    gap: 4px;
  }

  .chart-stage {
    gap: 4px;
  }
}
</style>

<style>
.plot-canvas {
  position: absolute;
  left: 0;
  top: 0;
  display: block;
}

.right-axis {
  position: absolute;
  display: block;
  left: 0;
}

.x-axis-canvas {
  position: absolute;
  left: 0;
  bottom: 0;
  display: block;
  z-index: 10;
}

.right-axis {
  z-index: 15;
}
</style>
