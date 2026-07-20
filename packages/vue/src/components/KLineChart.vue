<template>
  <div ref="chartWrapperRef" class="chart-wrapper" :data-theme="chartTheme" :style="themeCssVars">
    <TopToolbar
      :symbol="currentSymbol"
      :symbols="symbolPool"
      :k-line-level="kLineLevel"
      :k-line-adjust="kLineAdjust"
      :symbol-loading="symbolStatus === 'loading'"
      :symbol-error="symbolStatus === 'error'"
      :overlay-symbols="overlaySymbols"
      :overlay-symbol-items="overlaySymbolItems"
      :comparison-colors="comparisonColorsMap"
      :comparison-loading="comparisonLoading"
      :show-back-button="kLineLevel === 'timeshare'"
      @add-overlay-symbol="onAddOverlaySymbol"
      @remove-overlay-symbol="onRemoveOverlaySymbol"
      @k-line-level-change="onKLineLevelChange"
      @k-line-adjust-change="onKLineAdjustChange"
      @symbol-change="onSymbolChange"
      @back="onBackFromTimeShare"
    />
    <div
      class="chart-stage"
      :class="{
        'is-dragging': isDragging,
        'is-resizing-pane': isResizingPane,
        'is-hovering-pane-separator': isHoveringPaneSeparator,
        'is-hovering-right-axis': isHoveringRightAxis,
        'is-hovering-kline': hoveredIndex !== null,
      }"
    >
      <LeftToolbar
        ref="toolbarRef"
        :is-fullscreen="effectiveIsFullscreen"
        :alert-controller="controller"
        :effective-settings="chartSettings"
        :renderer-runtime="rendererRuntime"
        :drawing-tool-id="drawingToolId"
        :is-range-select-mode="isRangeSelectMode"
        @select-tool="handleSelectTool"
        @toggle-indicator="onToggleIndicator"
        @toggle-fullscreen="handleToggleFullscreen"
        @zoom-in="applyZoomToLevel(zoomLevel + 1)"
        @zoom-out="applyZoomToLevel(zoomLevel - 1)"
        @settings-change="handleSettingsChange"
      />
      <div ref="chartMainRef" class="chart-main">
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
          v-if="computedLeftAxisWidth > 0"
          ref="leftAxisLayerRef"
          class="left-axis-host"
          :style="leftAxisHostStyle"
        ></div>
        <div
          ref="containerRef"
          class="chart-container"
          :style="chartContainerStyle"
          @scroll.passive="onScroll"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointerleave="onPointerLeave"
          @dblclick="onDoubleClick"
          @contextmenu.prevent
        >
          <div class="scroll-content">
            <div ref="canvasLayerRef" class="canvas-layer">
              <canvas ref="xAxisCanvasRef" class="x-axis-canvas"></canvas>

              <div
                v-if="hasLegendSlot && legendTemplateContext"
                class="main-legend-overlay"
                :style="legendOverlayStyle"
              >
                <slot name="legend" v-bind="legendTemplateContext" />
              </div>

              <CanvasToolbarStack>
                <RangeSelectionExport
                  v-if="rangeSelectionReady"
                  v-model:start-date="customStartDate"
                  v-model:end-date="customEndDate"
                  :start-label="rangeSelectionStartLabel"
                  :end-label="rangeSelectionEndLabel"
                  :count="rangeSelectionCount"
                  @export="exportRangeToCsv"
                  @clear="clearRangeSelection"
                  @batch-setting="showBatchStockDialog = true"
                />
                <DrawingStyleToolbar
                  v-if="selectedDrawing"
                  :drawing="selectedDrawing"
                  @update-style="onUpdateDrawingStyle"
                  @delete="onDeleteDrawing"
                />
              </CanvasToolbarStack>
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
          <template v-if="hoveredKLine && !isMobile">
            <div v-if="slots['kline-tooltip']" :style="klineTooltipStyle">
              <slot
                name="kline-tooltip"
                :hover-data="hoveredKLine!"
                :hovered-index="hoveredIndex"
                :data="chartData"
                :up-color="tooltipColors.upColor"
                :down-color="tooltipColors.downColor"
              />
            </div>
            <slot
              v-else
              name="kline-tooltip"
              :hover-data="hoveredKLine!"
              :hovered-index="hoveredIndex"
              :data="chartData"
              :up-color="tooltipColors.upColor"
              :down-color="tooltipColors.downColor"
            >
              <div
                class="tooltip-anchor kline-tooltip-anchor"
                :class="{ 'use-anchor': useAnchorPositioning }"
                :style="klineTooltipAnchorStyle"
              ></div>
              <div
                ref="tooltipContentRef"
                class="kline-tooltip"
                :class="{
                  'use-anchor': useAnchorPositioning,
                  'is-draggable': (chartSettings?.tooltipPosition ?? 'adaptive') === 'adaptive',
                }"
                :style="useAnchorPositioning ? undefined : { left: teleportedTooltipPos.x + 'px', top: teleportedTooltipPos.y + 'px' }"
                @pointerdown="onTooltipPointerDown"
                @dblclick="onTooltipDblClick"
              ></div>
            </slot>
          </template>
          <template v-if="hoveredMarker || hoveredCustomMarker">
            <slot
              name="marker-tooltip"
              :marker="hoveredMarker || hoveredCustomMarker"
              :tooltip-style="markerTooltipStyle"
            >
              <div
                class="tooltip-anchor marker-tooltip-anchor"
                :class="{ 'use-anchor': useAnchorPositioning }"
                :style="markerTooltipAnchorStyle"
              ></div>
              <MarkerTooltip
                :marker="hoveredMarker || hoveredCustomMarker"
                :pos="teleportedMarkerTooltipPos"
                :use-anchor="useAnchorPositioning"
                :anchor-placement="markerTooltipAnchorPlacement"
                :set-el="setMarkerTooltipEl"
              />
            </slot>
          </template>
        </Teleport>
        <div
          ref="rightAxisLayerRef"
          class="right-axis-host"
          :style="{ width: axisHostWidth + 'px' }"
          @pointerdown="onRightAxisPointerDown"
          @pointermove="onRightAxisPointerMove"
          @pointerup="onRightAxisPointerUp"
          @pointerleave="onRightAxisPointerLeave"
          @contextmenu.prevent
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
  import {
    SETTINGS_STORAGE_KEY,
    migrateStoredSettings,
    resolveSettings,
    type ChartSettings,
  } from '@363045841yyt/klinechart-core/config'
  import type { RendererBackendRuntime } from '@363045841yyt/klinechart-core/controllers'
  import {
    createChartController,
    routerDataFetcher,
    type ChartController,
    type InteractionSnapshot,
    type LegendTemplateContext,
    type SymbolSpec,
    type SymbolInfo,
    type CustomDataSource,
  } from '@363045841yyt/klinechart-core/controllers'
  import {
    SemanticChartController,
    type SemanticChartConfig,
    type DataFetcher,
  } from '@363045841yyt/klinechart-core/semantic'
  import {
    ref,
    computed,
    onBeforeUpdate,
    onMounted,
    onUnmounted,
    watch,
    nextTick,
    shallowRef,
    useSlots,
  } from 'vue'
  import { formatTimestamp } from '@363045841yyt/klinechart-core'

  const slots = useSlots()

  import { useChartState } from '../composables/chart/useChartState'
  import { useChartTheme } from '../composables/chart/useChartTheme'
  import { useDrawingManager } from '../composables/chart/useDrawingManager'
  import { useIndicatorManager } from '../composables/chart/useIndicatorManager'
  import { useRangeSelection } from '../composables/chart/useRangeSelection'
  import { provideFullscreenTeleportTarget } from '../composables/useFullscreenTeleportTarget'

  import BatchStockDialog from './BatchStockDialog.vue'
  import DrawingStyleToolbar from './DrawingStyleToolbar.vue'
  import ExportProgressDialog from './ExportProgressDialog.vue'
  import IndicatorSelector from './IndicatorSelector.vue'
import LeftToolbar from './LeftToolbar.vue'
import MarkerTooltip from './MarkerTooltip.vue'
  import RangeSelectionExport from './RangeSelectionExport.vue'
  import TopToolbar, { type SymbolItem } from './TopToolbar.vue'
  import CanvasToolbarStack from './common/CanvasToolbarStack.vue'

  // ── Props & Emits ──
  const props = withDefaults(
    defineProps<{
      /** 语义化配置（可选，唯一控制源） */
      semanticConfig?: SemanticChartConfig

      /** 数据获取函数（可选）。默认使用内置 routerDataFetcher，亦可由使用者注入覆盖。 */
      dataFetcher?: DataFetcher

      yPaddingPx?: number
      minKWidth?: number
      maxKWidth?: number
      /** 右侧价格轴宽度 */
      rightAxisWidth?: number
      /** 左侧价格轴宽度（默认 0，不显示） */
      leftAxisWidth?: number
      /** 底部时间轴高度 */
      bottomAxisHeight?: number
      /** 价格标签额外宽度（用于显示涨跌幅，默认 60px） */
      priceLabelWidth?: number

      /** 缩放级别数量（默认 10） */
      zoomLevels?: number
      /** 初始缩放级别（1 ~ zoomLevels，默认居中） */
      initialZoomLevel?: number
      /** 是否全屏（受控）。不绑定时为非受控模式，组件内部接管全屏 DOM 操作 */
      isFullscreen?: boolean
      /** 时区，默认 Asia/Shanghai */
      timezone?: string

      /** 初始化图表设置（传入后覆盖工具栏/localStorage 中的同名设置） */
      settings?: Partial<ChartSettings>

      /** 用户自定义数据源（传入后 bypass fetcher，使用此数据） */
      customData?: CustomDataSource

      /** MCP / AI runtime bridge 配置。传入后自动连接 MCP WebSocket server */
      mcp?: {
        wsUrl?: string
        onToolCall?: (call: {
          name: string
          input: Record<string, unknown>
        }) =>
          | Promise<{ success: boolean; error?: string; data?: unknown }>
          | { success: boolean; error?: string; data?: unknown }
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
      // 显式 undefined：覆盖 Vue 对 Boolean 缺省值的强制转换（默认会变成 false），
      // 保证未绑定 isFullscreen 时为非受控模式（props.isFullscreen === undefined）
      isFullscreen: undefined,
      timezone: 'Asia/Shanghai',
    },
  )

  const emit = defineEmits<{
    (e: 'zoomLevelChange', level: number, kWidth: number): void
    (e: 'toggleFullscreen'): void
    (e: 'update:isFullscreen', value: boolean): void
    (e: 'themeChange', theme: 'light' | 'dark'): void
    (e: 'kLineLevelChange', level: string): void
    (e: 'kLineAdjustChange', adjust: 'qfq' | 'hfq' | 'splits' | 'none'): void
  }>()

  // ── Slot Props Types ──

  /** kline-tooltip 插槽作用域。hoveredKLine && !isMobile 时渲染，hoverData 一定不为 null。 */
  export interface KlineTooltipSlotProps {
    hoverData: import('@363045841yyt/klinechart-core/types/price').KLineData
    hoveredIndex: number | null
    data: ReadonlyArray<import('@363045841yyt/klinechart-core/types/price').KLineData>
    upColor: string
    downColor: string
  }

  /** marker-tooltip 插槽作用域。hoveredMarker || hoveredCustomMarker 时渲染。 */
  export interface MarkerTooltipSlotProps {
    marker:
      | import('@363045841yyt/klinechart-core/engine/marker/registry').MarkerEntity
      | import('@363045841yyt/klinechart-core/engine/marker/registry').CustomMarkerEntity
      | null
    tooltipStyle: {
      left: string
      top: string
      position: 'absolute'
      pointerEvents: 'none'
      zIndex: number
    }
  }

  /**
   * legend 插槽作用域。
   * 存在 #legend 时完全替换主图左上角 Canvas 图例；字段与 core LegendTemplateContext 一致。
   */
  export type LegendSlotProps = LegendTemplateContext

  // ── Symbol / Comparison State ──

  // Default symbol catalog — registered into the controller on mount so the
  // dropdown picker shows a meaningful list out of the box. Consumers can
  // replace/extend via ctrl.registerSymbols() after mount.
  const DEFAULT_SYMBOLS: SymbolInfo[] = [
    // TradingView global
    { symbol: 'XAUUSD', description: '现货黄金', exchange: 'OANDA', source: 'tradingview' },
    {
      symbol: 'BTCUSDT',
      description: 'Bitcoin / Tether',
      exchange: 'BINANCE',
      source: 'tradingview',
    },
    {
      symbol: 'ETHUSDT',
      description: 'Ethereum / Tether',
      exchange: 'BINANCE',
      source: 'tradingview',
    },
    { symbol: 'EURUSD', description: '欧元/美元', exchange: 'OANDA', source: 'tradingview' },
    { symbol: 'SPX', description: '标普 500 指数', exchange: 'SP', source: 'tradingview' },
    { symbol: 'AAPL', description: 'Apple Inc.', exchange: 'NASDAQ', source: 'tradingview' },
    { symbol: 'TSLA', description: 'Tesla, Inc.', exchange: 'NASDAQ', source: 'tradingview' },
    { symbol: '1810', description: '小米集团', exchange: 'HKEX', source: 'tradingview' },
    // gotdx A shares
    { symbol: '600519', description: '贵州茅台', exchange: 'SSE', source: 'gotdx' },
    { symbol: '601360', description: '三六零', exchange: 'SSE', source: 'gotdx' },
    { symbol: '000858', description: '五 粮 液', exchange: 'SZSE', source: 'gotdx' },
    { symbol: '000001', description: '平安银行', exchange: 'SZSE', source: 'gotdx' },
    // Mock
    { symbol: 'MOCK-100', description: 'Mock 100 条', exchange: 'MOCK', source: 'mock-100' },
    { symbol: 'MOCK-10000', description: 'Mock 10000 条', exchange: 'MOCK', source: 'mock-10000' },
  ]

  const kLineLevel = ref<string>(props.semanticConfig?.data?.period ?? 'daily')
  const previousKLineLevel = ref<string>('daily')
  const kLineAdjust = ref(props.semanticConfig?.data?.adjust ?? 'none')
  const isIntraday = computed(() => kLineLevel.value.includes('min'))
  const currentSymbol = ref('选择商品')
  const currentSymbolItem = ref<SymbolItem | null>(null)
  const overlaySymbols = ref<string[]>([])
  const overlaySymbolItems = ref<SymbolItem[]>([])
  const symbolPool = ref<SymbolItem[]>([])

  function onKLineLevelChange(level: string) {
    if (level === 'timeshare') {
      previousKLineLevel.value = kLineLevel.value as string
    }
    kLineLevel.value = level as typeof kLineLevel.value
    emit('kLineLevelChange', level)
    syncSymbolsToController()
  }

  function onBackFromTimeShare() {
    const prevLevel = previousKLineLevel.value
    if (prevLevel && prevLevel !== 'timeshare') {
      onKLineLevelChange(prevLevel)
    }
  }

  function onKLineAdjustChange(adjust: 'qfq' | 'hfq' | 'splits' | 'none') {
    kLineAdjust.value = adjust
    emit('kLineAdjustChange', adjust)
    syncSymbolsToController()
  }

  function onSymbolChange(item: SymbolItem) {
    symbolStatus.value = 'loading'
    const ctrl = controller.value
    if (!ctrl) return
    ctrl.setDataFetcher(effectiveDataFetcher.value)
    const current = ctrl.symbols.peek() ?? []
    const comparisonSpecs = current.slice(1)
    ctrl.setSymbols([toSymbolSpec(item), ...comparisonSpecs])
  }

  function onAddOverlaySymbol(item: SymbolItem) {
    const ctrl = controller.value
    if (!ctrl) return
    const current = ctrl.symbols.peek()
    const currentCodes = current.map((s) => s.symbol)
    if (currentCodes.includes(item.symbol)) return
    forcePercentAxis()
    ctrl.addComparisonSymbol(toSymbolSpec(item))
  }

  function onRemoveOverlaySymbol(code: string) {
    controller.value?.removeComparisonSymbol(code)
  }

  function toSymbolSpec(item: SymbolItem): SymbolSpec {
    return {
      symbol: item.symbol,
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
    const nextSettings = migrateStoredSettings({
      ...chartSettings.value,
      axisType: 'percent',
    })
    chartSettings.value = nextSettings
    controller.value?.updateSettingsFacade(resolveSettings(nextSettings))
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
  const tooltipContentRef = ref<HTMLDivElement | null>(null)
  const toolbarRef = ref<InstanceType<typeof LeftToolbar> | null>(null)
  const indicatorSelectorRef = ref<InstanceType<typeof IndicatorSelector> | null>(null)
  const leftAxisLayerRef = ref<HTMLDivElement | null>(null)
  provideFullscreenTeleportTarget(chartWrapperRef)

  // ── DataFetcher 默认值（未绑定时回退到内置 routerDataFetcher）──
  // 用 computed 解析默认值，避免依赖 Vue 对「函数类型 prop 默认值」的特殊语义
  // （函数类型 prop 的 withDefaults 默认值会被原样使用而非作为工厂调用，跨编译条件不稳定）
  const effectiveDataFetcher = computed(() => props.dataFetcher ?? routerDataFetcher)

  // ── Fullscreen (controlled / uncontrolled) ──
  const internalIsFullscreen = ref(false)
  const effectiveIsFullscreen = computed(() => props.isFullscreen ?? internalIsFullscreen.value)
  let onFullscreenChange: (() => void) | null = null

  function handleToggleFullscreen() {
    // 受控模式：保持旧行为，仅通知，不操作 DOM
    if (props.isFullscreen !== undefined) {
      emit('toggleFullscreen')
      return
    }

    // 非受控模式：组件内部接管全屏 DOM 操作
    if (typeof document !== 'undefined') {
      const el = chartWrapperRef.value
      if (!document.fullscreenElement) {
        if (el && typeof el.requestFullscreen === 'function') {
          el.requestFullscreen().catch(() => {
            /* 用户拒绝或浏览器不支持，忽略 */
          })
        }
      } else if (typeof document.exitFullscreen === 'function') {
        document.exitFullscreen().catch(() => {
          /* 忽略 */
        })
      }
    }
    emit('toggleFullscreen')
  }

  // ── Controller & Composable Wiring ──
  const controller = shallowRef<ChartController | null>(null)

  // Resolve initial theme synchronously before first render
  const _initialResolved = resolveSettings(props.settings)
  const _initialTheme: 'light' | 'dark' = (() => {
    const theme = _initialResolved.theme as string
    if (theme === 'auto') {
      return typeof window !== 'undefined' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
    }
    return theme as 'light' | 'dark'
  })()

  const {
    chartTheme,
    chartSettings,
    tooltipColors,
    themeCssVars,
    handleSettingsChange,
    applyThemeFromSettings,
  } = useChartTheme(controller, _initialTheme)

  const semanticController = shallowRef<SemanticChartController | null>(null)

  const showBatchStockDialog = ref(false)
  const batchSymbols = ref<string[]>([])

  const chartState = useChartState(props.initialZoomLevel ?? 1, {
    minKWidth: props.minKWidth,
    maxKWidth: props.maxKWidth,
    zoomLevelCount: props.zoomLevels,
  })
  const {
    symbolStatus,
    zoomLevel,
    kWidth,
    kGap,
    viewWidth,
    viewportDpr,
    viewportVersion,
    dataLength,
    dataVersion,
    paneRatios,
    comparisonColorsMap,
    comparisonLoading,
    isRangeSelectMode,
  } = chartState

  /** 镜像 kernel.drawingTool，供工具栏高亮 */
  const drawingToolId = shallowRef('cursor')
  /** 镜像 kernel.rendererRuntime，供设置页显示有效后端 */
  const rendererRuntime = shallowRef<RendererBackendRuntime | null>(null)

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
    isRangeSelectActive,
    rangeSelectionReady,
    rangeSelectionBounds,
    rangeSelectionCount,
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
  } = useRangeSelection({
    controller,
    isRangeSelectMode,
    containerRef,
    dataVersion,
    viewportVersion,
    dataFetcher: effectiveDataFetcher,
    batchSymbols,
  })

  // ── No-op Render Trigger (exposed) ──
  function scheduleRender() {
    /* Controller auto-renders on state changes */
  }

  // ── Tooltip — 直接订阅 kernel，绕过 Vue 的 VNode ──
  const _measuredTooltips = new WeakSet<HTMLElement>()
  let _tooltipRO: ResizeObserver | null = null
  let _markerTooltipRO: ResizeObserver | null = null
  let _prevTooltipIdx: number | null = null
  let _unsubTooltip: (() => void) | null = null
  let _tooltipSlots: _TooltipSlots | null = null

  const NEUTRAL_COLOR = '#6b7280'
  interface _KLineData { timestamp: number; open: number; high: number; low: number; close: number; volume?: number; turnover?: number; amplitude?: number; changePercent?: number; changeAmount?: number; turnoverRate?: number; symbol?: string }
  interface _TooltipSlots {
    container: HTMLDivElement
    symbol: HTMLSpanElement | null
    date: HTMLSpanElement
    open: HTMLSpanElement
    high: HTMLSpanElement
    low: HTMLSpanElement
    close: HTMLSpanElement
    volume: HTMLSpanElement | null
    turnover: HTMLSpanElement | null
    amplitude: HTMLSpanElement | null
    changePercent: HTMLSpanElement | null
    changeAmount: HTMLSpanElement | null
    turnoverRate: HTMLSpanElement | null
  }
  function _formatVolume(v: number): string {
    if (v >= 1e8) return (v / 1e8).toFixed(2) + '亿'
    if (v >= 1e4) return (v / 1e4).toFixed(2) + '万'
    return v.toFixed(2)
  }
  function _formatSigned(val: number, unit: string): string {
    return (val >= 0 ? '+' : '') + val.toFixed(2) + unit
  }
  function _calcDirection(data: _KLineData, allData: ReadonlyArray<_KLineData>, idx: number | null): number {
    if (data.close >= data.open) return 1
    const prev = typeof idx === 'number' && idx > 0 ? allData[idx - 1] : undefined
    if (prev && data.close > prev.close) return 1
    if (prev && data.close < prev.close) return -1
    return 0
  }

  function _buildTooltipDOM(el: HTMLDivElement, kline: _KLineData): _TooltipSlots {
    const title = document.createElement('div')
    title.className = 'kline-tooltip__title'
    let symbolSpan: HTMLSpanElement | null = null
    if (kline.symbol) {
      symbolSpan = document.createElement('span')
      title.appendChild(symbolSpan)
    }
    const dateSpan = document.createElement('span')
    title.appendChild(dateSpan)
    el.appendChild(title)

    const grid = document.createElement('div')
    grid.className = 'kline-tooltip__grid'

    function addRow(label: string): HTMLSpanElement {
      const row = document.createElement('div')
      row.className = 'row'
      const lbl = document.createElement('span')
      lbl.textContent = label
      row.appendChild(lbl)
      const val = document.createElement('span')
      row.appendChild(val)
      grid.appendChild(row)
      return val
    }

    const openV = addRow('开')
    const highV = addRow('高')
    const lowV = addRow('低')
    const closeV = addRow('收')
    const volumeV = typeof kline.volume === 'number' ? addRow('成交量') : null
    const turnoverV = typeof kline.turnover === 'number' ? addRow('成交额') : null
    const amplitudeV = typeof kline.amplitude === 'number' ? addRow('振幅') : null
    const changePercentV = typeof kline.changePercent === 'number' ? addRow('涨跌幅') : null
    const changeAmountV = typeof kline.changeAmount === 'number' ? addRow('涨跌额') : null
    const turnoverRateV = typeof kline.turnoverRate === 'number' ? addRow('换手率') : null

    el.appendChild(grid)

    return {
      container: el,
      symbol: symbolSpan,
      date: dateSpan,
      open: openV,
      high: highV,
      low: lowV,
      close: closeV,
      volume: volumeV,
      turnover: turnoverV,
      amplitude: amplitudeV,
      changePercent: changePercentV,
      changeAmount: changeAmountV,
      turnoverRate: turnoverRateV,
    }
  }

  function _updateTooltipDOM(
    slots: _TooltipSlots,
    kline: _KLineData,
    idx: number,
    allData: ReadonlyArray<_KLineData>,
    upColor: string,
    downColor: string,
    timezone: string,
    showTime: boolean,
  ): void {
    const openDir = _calcDirection(kline, allData, idx)
    const closeDiff = kline.close - kline.open
    const changePct = kline.changePercent ?? ((kline.close - kline.open) / kline.open) * 100
    const openC = openDir > 0 ? upColor : openDir < 0 ? downColor : NEUTRAL_COLOR
    const closeC = closeDiff > 0 ? upColor : closeDiff < 0 ? downColor : NEUTRAL_COLOR
    const changeC = changePct > 0 ? upColor : changePct < 0 ? downColor : NEUTRAL_COLOR

    slots.date.textContent = formatTimestamp(kline.timestamp, { timeZone: timezone, showTime })
    if (slots.symbol) slots.symbol.textContent = kline.symbol ?? ''

    slots.open.textContent = kline.open.toFixed(2)
    slots.open.style.color = openC
    slots.high.textContent = kline.high.toFixed(2)
    slots.low.textContent = kline.low.toFixed(2)
    slots.close.textContent = kline.close.toFixed(2)
    slots.close.style.color = closeC
    if (slots.volume && typeof kline.volume === 'number') slots.volume.textContent = _formatVolume(kline.volume)
    if (slots.turnover && typeof kline.turnover === 'number') slots.turnover.textContent = _formatVolume(kline.turnover)
    if (slots.amplitude && typeof kline.amplitude === 'number') slots.amplitude.textContent = kline.amplitude + '%'
    if (slots.changePercent && typeof kline.changePercent === 'number') {
      slots.changePercent.textContent = _formatSigned(kline.changePercent, '%')
      slots.changePercent.style.color = changeC
    }
    if (slots.changeAmount && typeof kline.changeAmount === 'number') {
      slots.changeAmount.textContent = _formatSigned(kline.changeAmount, '')
      slots.changeAmount.style.color = changeC
    }
    if (slots.turnoverRate && typeof kline.turnoverRate === 'number') slots.turnoverRate.textContent = kline.turnoverRate.toFixed(2) + '%'
  }

  function _setupTooltipSub(): void {
    const ctrl = controller.value
    if (!ctrl) return
    _unsubTooltip = ctrl.interactionState.subscribe(() => {
      const el = tooltipContentRef.value
      if (!el) return
      // 订阅整包 snapshot；内容更新仅依赖 hoveredIndex，索引未变时只动 display
      const snapshot = ctrl.interactionState.peek()
      const idx = snapshot.hoveredIndex
      const data = ctrl.getData()
      const kline = typeof idx === 'number' && data && idx >= 0 && idx < data.length ? data[idx] : undefined
      if (!kline || !data) {
        el.style.display = 'none'
        return
      }
      el.style.display = ''
      if (idx !== _prevTooltipIdx) {
        _prevTooltipIdx = idx
        if (!_tooltipSlots || _tooltipSlots.container !== el) {
          _tooltipSlots = null
          el.textContent = ''
          _tooltipSlots = _buildTooltipDOM(el, kline)
        }
        const colors = tooltipColors.value
        _updateTooltipDOM(
          _tooltipSlots, kline, idx!, data,
          colors.upColor, colors.downColor,
          props.timezone, isIntraday.value,
        )
        if (!_tooltipRO) {
          _tooltipRO = new ResizeObserver((entries) => {
            for (const entry of entries) {
              const el2 = entry.target as HTMLDivElement
              if (!el2.isConnected) continue
              const w = entry.borderBoxSize[0]?.inlineSize ?? entry.contentRect.width
              const h = entry.borderBoxSize[0]?.blockSize ?? entry.contentRect.height
              ctrl.setTooltipSize({
                width: Math.max(180, Math.round(w)),
                height: Math.max(80, Math.round(h)),
              })
            }
          })
        }
        _tooltipRO.observe(el)
      }
    })
  }

  function setMarkerTooltipEl(el: HTMLDivElement | null) {
    if (!el || _measuredTooltips.has(el)) return
    _measuredTooltips.add(el)
    if (!_markerTooltipRO) {
      _markerTooltipRO = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const target = entry.target as HTMLDivElement
          if (!target.isConnected) continue
          const w = entry.borderBoxSize[0]?.inlineSize ?? entry.contentRect.width
          const h = entry.borderBoxSize[0]?.blockSize ?? entry.contentRect.height
          markerTooltipSize.value = {
            width: Math.max(120, Math.round(w)),
            height: Math.max(60, Math.round(h)),
          }
        }
      })
    }
    _markerTooltipRO.observe(el)
  }

  // ── Marker Tooltip & Container Rect Cache ──
  const mousePos = ref({ x: 0, y: 0 })
  const useAnchorPositioning = ref(false)
  const tooltipDragPos = ref<{ x: number; y: number } | null>(null)
  let _tooltipDragOffset = { x: 0, y: 0 }

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

  /** 主图图例模板上下文（#legend slot 消费） */
  const legendTemplateContext = shallowRef<LegendTemplateContext | null>(null)
  let _unsubLegend: (() => void) | null = null

  const hasLegendSlot = ref(!!slots.legend)

  onBeforeUpdate(() => {
    hasLegendSlot.value = !!slots.legend
  })

  const legendOverlayStyle = computed(() => {
    const ctx = legendTemplateContext.value
    if (!ctx) return undefined
    return {
      left: `${ctx.layout.x}px`,
      top: `${ctx.layout.y}px`,
    }
  })

  function applyLegendRenderMode(ctrl: ChartController | null, external: boolean): void {
    if (!ctrl) return
    ctrl.updateRendererConfig('mainIndicatorLegend', {
      renderMode: external ? 'external' : 'canvas',
    })
  }

  function syncLegendSubscription(ctrl: ChartController): void {
    _unsubLegend?.()
    _unsubLegend = null
    if (!hasLegendSlot.value) {
      legendTemplateContext.value = null
      return
    }

    _unsubLegend = ctrl.legendTemplateContext.subscribe(() => {
      const next = ctrl.legendTemplateContext.peek()
      if (legendTemplateContext.value === next) return
      legendTemplateContext.value = next
    })
    legendTemplateContext.value = ctrl.legendTemplateContext.peek()
  }

  watch(
    hasLegendSlot,
    (external) => {
      if (controller.value) syncLegendSubscription(controller.value)
      applyLegendRenderMode(controller.value, external)
    },
    { immediate: false },
  )

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
  const isMobile = window.matchMedia('(pointer: coarse)').matches
  const crosshairIdx = computed(() => interactionState.value.crosshairIndex)

  // ── Derived Computed (Cursor, Hovered, Tooltip) ──
  const containerCursor = computed(() => {
    if (isDragging.value) return 'grabbing'
    if (isResizingPane.value || isHoveringPaneSeparator.value) return 'ns-resize'
    if (hoveredIndex.value !== null) return 'pointer'
    return 'crosshair'
  })

  const hoveredKLine = computed(() => {
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
  const effectiveTooltipPos = computed(() => tooltipDragPos.value ?? tooltipPos.value)
  let _cachedTooltipPos = { x: 0, y: 0 }
  const teleportedTooltipPos = computed(() => {
    const nextX = effectiveTooltipPos.value.x + tooltipLayerOffset.value.x
    const nextY = effectiveTooltipPos.value.y + tooltipLayerOffset.value.y
    if (nextX === _cachedTooltipPos.x && nextY === _cachedTooltipPos.y) {
      return _cachedTooltipPos
    }
    _cachedTooltipPos = { x: nextX, y: nextY }
    return _cachedTooltipPos
  })
  const klineTooltipAnchorStyle = computed(() => ({
    left: `${teleportedTooltipPos.value.x}px`,
    top: `${teleportedTooltipPos.value.y}px`,
  }))
  let _cachedMarkerTooltipPos = { x: 0, y: 0 }
  const teleportedMarkerTooltipPos = computed(() => {
    const nextX = mousePos.value.x + tooltipLayerOffset.value.x
    const nextY = mousePos.value.y + tooltipLayerOffset.value.y
    if (nextX === _cachedMarkerTooltipPos.x && nextY === _cachedMarkerTooltipPos.y) {
      return _cachedMarkerTooltipPos
    }
    _cachedMarkerTooltipPos = { x: nextX, y: nextY }
    return _cachedMarkerTooltipPos
  })
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

  const klineTooltipStyle = computed(() => ({
    left: `${teleportedTooltipPos.value.x}px`,
    top: `${teleportedTooltipPos.value.y}px`,
    position: 'absolute' as const,
    pointerEvents: 'none' as const,
    zIndex: 10,
  }))
  const markerTooltipStyle = computed(() => ({
    left: `${teleportedMarkerTooltipPos.value.x}px`,
    top: `${teleportedMarkerTooltipPos.value.y}px`,
    position: 'absolute' as const,
    pointerEvents: 'none' as const,
    zIndex: 10,
  }))

  const chartData = computed(() => {
    void dataVersion.value
    return controller.value?.getData() ?? []
  })

  // ── Pointer Event Handlers ──
  function onToggleIndicator() {
    indicatorSelectorRef.value?.toggleMenu()
  }

  function onBatchApply(codes: string[]) {
    batchSymbols.value = codes
  }

  function handleSelectTool(toolId: string) {
    if (toolId === 'range-select') {
      isRangeSelectMode.value = true
      controller.value?.setDrawingToolId('cursor')
      controller.value?.setSelectedDrawingId(null)
      return
    }

    isRangeSelectMode.value = false
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
          // 预览/拖拽只在会话层；UI 列表仍订 kernel.drawings，此处不镜像会话态
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
    const related = e.relatedTarget as Node | null
    if (tooltipLayerRef.value && related && tooltipLayerRef.value.contains(related)) {
      return
    }
    controller.value?.handlePointerEvent(e)
  }

  function onDoubleClick(e: MouseEvent) {
    if (kLineLevel.value !== 'daily' || !controller.value) return

    const container = containerRef.value
    if (!container) return
    const rect = container.getBoundingClientRect()
    const mouseX = e.clientX - rect.left

    const index = controller.value.getLogicalIndexAtX(mouseX)
    if (index == null) return

    const timestamp = controller.value.getTimestampAtLogicalIndex(index)
    if (timestamp == null) return

    const d = new Date(timestamp)
    const shD = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }))
    const yyyymmdd = shD.getFullYear() * 10000 + (shD.getMonth() + 1) * 100 + shD.getDate()

    previousKLineLevel.value = 'daily'
    kLineLevel.value = 'timeshare'
    controller.value.switchToTimeShareForDate(yyyymmdd)
    emit('kLineLevelChange', 'timeshare')
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
    controller.value?.handleScrollEvent()
  }

  // ── Tooltip Drag ──
  function onTooltipPointerDown(e: PointerEvent) {
    if ((chartSettings.value?.tooltipPosition ?? 'adaptive') !== 'adaptive') return
    e.preventDefault()
    e.stopPropagation()
    _tooltipDragOffset = {
      x: e.clientX - teleportedTooltipPos.value.x,
      y: e.clientY - teleportedTooltipPos.value.y,
    }
    document.addEventListener('pointermove', onTooltipPointerMove)
    document.addEventListener('pointerup', onTooltipPointerUp)
  }

  function onTooltipPointerMove(e: PointerEvent) {
    tooltipDragPos.value = {
      x: e.clientX - _tooltipDragOffset.x - tooltipLayerOffset.value.x,
      y: e.clientY - _tooltipDragOffset.y - tooltipLayerOffset.value.y,
    }
  }

  function onTooltipPointerUp() {
    document.removeEventListener('pointermove', onTooltipPointerMove)
    document.removeEventListener('pointerup', onTooltipPointerUp)
  }

  function onTooltipDblClick() {
    tooltipDragPos.value = null
  }

  // ── Width / Zoom / Expose ──
  const axisHostWidth = computed(() => props.rightAxisWidth + props.priceLabelWidth)

  const computedLeftAxisWidth = computed(() => props.leftAxisWidth ?? 0)

  const leftAxisHostStyle = computed(() => {
    const width = computedLeftAxisWidth.value
    if (width <= 0) return { display: 'none' }
    if (kLineLevel.value === 'timeshare') return { width: `${width}px` }
    const leftType = chartSettings.value?.leftAxisType
    if (!leftType || leftType === 'none') return { width: `${width}px`, display: 'none' }
    return { width: `${width}px` }
  })

  const chartContainerStyle = computed(() => {
    const base: Record<string, string> = { cursor: containerCursor.value }
    if (leftAxisHostStyle.value.display === 'none') {
      base.borderRadius = '3px 0 0 3px'
      base.borderLeft = '1px solid var(--chart-border)'
    }
    return base
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

  let cleanupChartCallbacks: (() => void) | null = null

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
    leftAxisLayer?: HTMLDivElement,
  ): Promise<ChartController> {
    const ctrl = createChartController({
      container,
      data: [],
      canvasLayer,
      rightAxisLayer,
      leftAxisLayer,
      xAxisCanvas,
      theme: _initialTheme,
      initialZoomLevel: props.initialZoomLevel,
      zoomLevels: props.zoomLevels,
      yPaddingPx: props.yPaddingPx,
      rightAxisWidth: props.rightAxisWidth,
      leftAxisWidth: props.leftAxisWidth,
      bottomAxisHeight: props.bottomAxisHeight,
      priceLabelWidth: props.priceLabelWidth,
      minKWidth: props.minKWidth,
      maxKWidth: props.maxKWidth,
      settings: props.settings,
      mcp: props.mcp,
    })
    return ctrl
  }

  function setupChartCallbacks(ctrl: ChartController): () => void {
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
      if (
        zoomLevel.value !== vp.zoomLevel ||
        kWidth.value !== vp.kWidth ||
        kGap.value !== vp.kGap
      ) {
        zoomLevel.value = vp.zoomLevel
        kWidth.value = vp.kWidth
        kGap.value = vp.kGap
      }
    })

    const unsubscribeData = ctrl.data.subscribe(() => {
      const data = ctrl.data.peek()
      dataLength.value = data.length
      dataVersion.value++
      if (data.length > 0 && (symbolStatus.value === 'loading' || symbolStatus.value === 'error')) {
        symbolStatus.value = 'ready'
      }
    })

    const unsubscribeDataLoading = ctrl.dataLoading.subscribe(() => {
      const loading = ctrl.dataLoading.peek()
      if (loading) {
        symbolStatus.value = 'loading'
      } else if (symbolStatus.value === 'loading') {
        symbolStatus.value = 'error'
      }
    })

    const unsubscribeTheme = ctrl.theme.subscribe(() => {
      const newTheme = ctrl.theme.peek()
      chartTheme.value = newTheme
      emit('themeChange', newTheme)
    })

    drawingToolId.value = ctrl.drawingTool.peek()
    const unsubscribeDrawingTool = ctrl.drawingTool.subscribe(() => {
      drawingToolId.value = ctrl.drawingTool.peek()
    })

    rendererRuntime.value = ctrl.rendererRuntime.peek()
    const unsubscribeRendererRuntime = ctrl.rendererRuntime.subscribe(() => {
      rendererRuntime.value = ctrl.rendererRuntime.peek()
    })

    const unsubscribeIndicators = setupIndicatorSubscriptions(ctrl)

    const unsubscribeComparisonColors = ctrl.comparisonColors.subscribe(() => {
      comparisonColorsMap.value = new Map(ctrl.comparisonColors.peek())
    })

    const unsubscribeComparisonLoading = ctrl.comparisonLoading.subscribe(() => {
      comparisonLoading.value = ctrl.comparisonLoading.peek()
    })

    // Sync symbol catalog from controller to dropdown pool.
    const unsubscribeSymbolCatalog = ctrl.symbolCatalog.subscribe(() => {
      symbolPool.value = ctrl.symbolCatalog.peek().map((info) => ({
        symbol: info.symbol,
        description: info.description ?? info.symbol,
        exchange: info.exchange ?? '',
        source: info.source ?? '',
      }))
    })
    // 立即同步当前值，确保 dropdown 在 subscribe 创建后立即拿到数据，
    // 不依赖 registerSymbols 在 subscribe 之前还是之后调用。
    symbolPool.value = ctrl.symbolCatalog.peek().map((info) => ({
      symbol: info.symbol,
      description: info.description ?? info.symbol,
      exchange: info.exchange ?? '',
      source: info.source ?? '',
    }))

    const unsubscribeSymbols = ctrl.symbols.subscribe(() => {
      const specs = ctrl.symbols.peek()
      if (specs.length === 0) return
      const primary = specs[0]
      currentSymbol.value = primary.symbol
      currentSymbolItem.value = {
        symbol: primary.symbol,
        description: primary.symbol,
        exchange: primary.exchange ?? '',
        source: primary.source ?? '',
      }
      if (primary.period) kLineLevel.value = primary.period
      if (primary.adjust) kLineAdjust.value = primary.adjust as 'qfq' | 'hfq' | 'splits' | 'none'

      const comparisonSpecs = specs.slice(1)
      overlaySymbols.value = comparisonSpecs.map((s) => s.symbol)
      overlaySymbolItems.value = comparisonSpecs.map((s) => ({
        symbol: s.symbol,
        description: s.symbol,
        exchange: s.exchange ?? '',
        source: s.source ?? '',
      }))
    })

    return () => {
      unsubscribeViewport()
      unsubscribeData()
      unsubscribeDataLoading()
      unsubscribePaneRatios()
      unsubscribePaneLayout()
      unsubscribeTheme()
      unsubscribeDrawingTool()
      unsubscribeRendererRuntime()
      unsubscribeIndicators()
      unsubscribeComparisonColors()
      unsubscribeComparisonLoading()
      unsubscribeSymbolCatalog()
      unsubscribeSymbols()
    }
  }

  function applyInitialSettings(ctrl: ChartController): void {
    const toolbarSettings = migrateStoredSettings(
      (toolbarRef.value?.getSettings() ?? {}) as Record<string, unknown>,
    )
    const propSettings = props.settings ?? {}
    const merged = { ...toolbarSettings, ...propSettings }
    chartSettings.value = merged
    const resolved = resolveSettings(merged)
    ctrl.updateSettingsFacade(resolved)
    applyThemeFromSettings(resolved.theme as string)
  }

  function setupInteractionCallbacks(ctrl: ChartController): void {
    ctrl.setTooltipAnchorPositioning(useAnchorPositioning.value)
    // 引用相等短路：kernel interactionSnapshot 已字段级缓存
    ctrl.interactionState.subscribe(() => {
      const next = ctrl.interactionState.peek()
      if (interactionState.value === next) return
      interactionState.value = next
    })

    interactionState.value = ctrl.interactionState.peek()
    viewportDpr.value = ctrl.viewport.peek().dpr

    syncLegendSubscription(ctrl)

    // #legend 存在时切换为 external，隐藏 Canvas 图例文字
    applyLegendRenderMode(ctrl, hasLegendSlot.value)
  }

  function setupSemanticController(ctrl: ChartController): void {
    if (props.customData) {
      try {
        ctrl.applyCustomData(props.customData)
      } catch (err) {
        console.error('[KLineChart] applyCustomData failed:', err)
      }
    }

    ctrl.setDataFetcher(effectiveDataFetcher.value)
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

    // 全屏状态监听（非受控模式下驱动内部状态与 update:isFullscreen）
    if (typeof document !== 'undefined') {
      onFullscreenChange = () => {
        internalIsFullscreen.value = !!document.fullscreenElement
        emit('update:isFullscreen', internalIsFullscreen.value)
      }
      document.addEventListener('fullscreenchange', onFullscreenChange)
    }

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
    const leftAxisLayer = chartMain.querySelector<HTMLDivElement>('.left-axis-host') ?? undefined
    let ctrl: ChartController
    try {
      ctrl = await initChart(container, canvasLayer!, rightAxisLayer!, xAxisCanvas!, leftAxisLayer)
    } catch (err) {
      console.error('[KLineChart] initChart failed:', err)
      return
    }
    if (!containerRef.value || !chartMainRef.value) return // 组件已卸载
    controller.value = ctrl

    // 3) 信号回调（必须在 registerSymbols 之前建立，否则订阅收不到初始通知）
    cleanupChartCallbacks = setupChartCallbacks(ctrl)

    // 4) 直接订阅 kernel 的 tooltip 信号，绕过 VNode
    _setupTooltipSub()

    // Seed the default symbol catalog — subscribe 已建立, set 会触发回调刷新 dropdown
    ctrl.registerSymbols(DEFAULT_SYMBOLS)

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
    try {
      setupSemanticController(ctrl)
    } catch (err) {
      console.error('[KLineChart] setupSemanticController failed:', err)
    }
  })

  // ── onUnmounted & Watchers ──
  onUnmounted(() => {
    if (typeof document !== 'undefined' && onFullscreenChange) {
      document.removeEventListener('fullscreenchange', onFullscreenChange)
    }
    document.removeEventListener('pointermove', onTooltipPointerMove)
    document.removeEventListener('pointerup', onTooltipPointerUp)
    onFullscreenChange = null
    cleanupChartCallbacks?.()
    cleanupChartCallbacks = null
    _unsubTooltip?.()
    _unsubTooltip = null
    _unsubLegend?.()
    _unsubLegend = null
    applyLegendRenderMode(controller.value, false)
    legendTemplateContext.value = null
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

  // customData 变化时同步数据；
  // 引擎层 applyCustomData 已改为首次初始化 period/spec，
  // 后续调用只更新 data，不覆盖 UI dropdown 选择的 period
  watch(
    () => props.customData,
    (newVal, oldVal) => {
      if (newVal && controller.value) {
        controller.value.applyCustomData(newVal)
      } else if (oldVal && controller.value) {
        const saved = controller.value.getPreCustomSpec()
        if (saved) {
          controller.value.setDataFetcher(effectiveDataFetcher.value)
          controller.value.resetToFetcher({
            ...saved,
            period: kLineLevel.value,
            adjust: kLineAdjust.value,
          })
        }
      }
    },
    { deep: true },
  )

  // tooltipPosition 切换为非 adaptive 时复位拖拽位置
  watch(
    () => chartSettings.value?.tooltipPosition,
    (val) => {
      if (val !== 'adaptive') tooltipDragPos.value = null
    },
  )

  // 受控设置：外部 settings 变化时 merge 到当前设置并同步到控制器
  watch(
    () => props.settings,
    (next) => {
      if (!next || !controller.value) return
      const merged = { ...chartSettings.value, ...next }
      chartSettings.value = merged
      controller.value.updateSettingsFacade(resolveSettings(merged))
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
    align-items: stretch;
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
    flex: 1;
    min-height: 255px;
    display: flex;
    align-items: stretch;
    gap: 4px;
  }

  .chart-main {
    flex: 1 1 auto;
    min-width: 0;
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
    min-height: inherit;
    scrollbar-width: none;
    -ms-overflow-style: none;
    border: 1px solid var(--chart-border);
    border-right: 0;
    border-left: 0;
    border-radius: 0;
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

  .left-axis-host {
    position: relative;
    flex: 0 0 auto;
    min-height: inherit;
    box-sizing: border-box;
    background: var(--chart-bg);
    overflow: visible;
    border: 1px solid var(--chart-border);
    border-top-left-radius: 3px;
    border-bottom-left-radius: 3px;

    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;
    touch-action: none;
  }

  .scroll-content {
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

  .range-selection-handle--left {
    left: -4px;
  }

  .range-selection-handle--right {
    right: -4px;
  }

  .main-legend-overlay {
    position: absolute;
    z-index: 8;
    pointer-events: none;
    font-size: 12px;
    line-height: 18px;
    color: var(--klc-color-foreground, #111);
  }

  .canvas-layer {
    position: sticky;
    left: 0;
    top: 0;
    z-index: 26;
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

  .right-axis,
  .right-axis-overlay,
  .left-axis,
  .left-axis-overlay {
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

  .right-axis,
  .left-axis {
    z-index: 15;
  }

  .right-axis-overlay,
  .left-axis-overlay {
    z-index: 16;
    pointer-events: none;
  }
</style>

<style>
  * {
    -webkit-tap-highlight-color: transparent;
  }

  .kline-tooltip {
    position: absolute;
    z-index: 10;
    min-width: 200px;
    max-width: 260px;
    padding: 10px 12px;
    border-radius: 8px;
    background: var(--klc-color-tooltip-bg);
    border: 1px solid var(--klc-color-tooltip-border);
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
    color: var(--klc-color-tooltip-text);
    font-size: 12px;
    line-height: 1.4;
    pointer-events: none;
    backdrop-filter: blur(6px);
    user-select: none;
  }
  .kline-tooltip.is-draggable {
    pointer-events: auto;
    cursor: grab;
  }
  .kline-tooltip.is-draggable:active {
    cursor: grabbing;
  }
  .kline-tooltip__title {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    font-weight: 600;
    margin-bottom: 6px;
  }
  .kline-tooltip__grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 2px;
  }
  .kline-tooltip__grid .row {
    display: flex;
    justify-content: space-between;
    gap: 10px;
  }
  .kline-tooltip__grid .row span:first-child {
    color: var(--klc-color-tooltip-text);
    opacity: 0.56;
  }
</style>
