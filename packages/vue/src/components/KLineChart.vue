<template>
  <div ref="chartWrapperRef" class="chart-wrapper" :data-theme="chartTheme">
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
    <IndicatorSelector
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
  __setDataFetcher,
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
  type PaneSpec,
  type IndicatorInstance,
  type SubIndicatorType,
  type InteractionSnapshot,
  type DrawingToolId,
  type KLineData,
  zoomLevelToKWidth,
  kGapFromKWidth,
  getPhysicalKLineConfig,
  SUB_PANE_INDICATOR_CONFIGS,
  SUB_PANE_INDICATORS,
  DrawingInteractionController,
} from '@363045841yyt/klinechart-core/controllers'
import type { DrawingObject, DrawingStyle } from '@363045841yyt/klinechart-core/plugin'
import LeftToolbar from './LeftToolbar.vue'

const props = withDefaults(
  defineProps<{
    /** 语义化配置（必需，唯一控制源） */
    semanticConfig: SemanticChartConfig

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
  },
)

const emit = defineEmits<{
  (e: 'zoomLevelChange', level: number, kWidth: number): void
  (e: 'toggleFullscreen'): void
}>()

const containerRef = ref<HTMLDivElement | null>(null)
const chartMainRef = ref<HTMLDivElement | null>(null)
const chartWrapperRef = ref<HTMLDivElement | null>(null)
const tooltipLayerRef = ref<HTMLDivElement | null>(null)
const toolbarRef = ref<InstanceType<typeof LeftToolbar> | null>(null)
provideFullscreenTeleportTarget(chartWrapperRef)

/* ========== 图表控制器 ========== */
const controller = shallowRef<ChartController | null>(null)

/* ========== 语义化控制器 ========== */
const semanticController = shallowRef<SemanticChartController | null>(null)

/* ========== 本地响应式状态（信号驱动，取代 ChartStore） ========== */
const dataLength = ref(0)
const dataVersion = ref(0)
const viewportDpr = ref(1)
const zoomLevel = ref(props.initialZoomLevel ?? 1)
const kWidth = ref(0)
const kGap = ref(1)
const viewWidth = ref(0)
const paneRatios = ref<Record<string, number>>({})
const selectedDrawingId = ref<string | null>(null)
const drawings = ref<DrawingObject[]>([])

// 初始化 kWidth / kGap（与 Chart 引擎 zoom→物理值 转换一致）
const initZoom = zoomLevel.value
kWidth.value = zoomLevelToKWidth(initZoom, {
  minKWidth: props.minKWidth,
  maxKWidth: props.maxKWidth,
  zoomLevelCount: props.zoomLevels,
  dpr: viewportDpr.value,
})
kGap.value = kGapFromKWidth(kWidth.value, viewportDpr.value)

/* ========== 主题状态 ========== */
const chartTheme = ref<'light' | 'dark'>('light')

function scheduleRender() {
  /* Controller auto-renders on state changes */
}

function handleSettingsChange(settings: Record<string, boolean | string>) {
  controller.value?.updateSettingsFacade(settings)

  if (settings.performanceTest10kKlines) {
    const testData = generate10kKLineData()
    console.time('updateData-10k')
    controller.value?.updateData(testData)
    console.timeEnd('updateData-10k')
    dataLength.value = testData.length
    dataVersion.value++
  } else {
    if (semanticController.value && controller.value?.getData()?.length === 10000) {
      semanticController.value.applyConfig(props.semanticConfig)
    }
  }
}

// 生成1万条K线测试数据
function generate10kKLineData() {
  const data: KLineData[] = []
  const startTime = new Date('2020-01-01').getTime()
  const dayMs = 24 * 60 * 60 * 1000

  let lastClose = 3000 // 起始价格

  for (let i = 0; i < 10000; i++) {
    const timestamp = startTime + i * dayMs

    // 生成随机波动
    const volatility = 0.02 // 2%日波动率
    const trend = 0.0001 // 轻微上涨趋势
    const change = (Math.random() - 0.5) * 2 * volatility + trend

    const open = lastClose
    const close = open * (1 + change)
    const high = Math.max(open, close) * (1 + Math.random() * 0.01)
    const low = Math.min(open, close) * (1 - Math.random() * 0.01)
    const volume = Math.floor(1000000 + Math.random() * 5000000)

    data.push({
      timestamp,
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
      volume,
    })

    lastClose = close
  }

  return data
}

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

// ===== Marker tooltip 状态 =====
const mousePos = ref({ x: 0, y: 0 })
const useAnchorPositioning = ref(false)

// 容器 rect 缓存，避免 pointermove 中反复 getBoundingClientRect 强制同步布局
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

// ===== 交互状态（单一来源：InteractionController snapshot） =====
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

const drawingController = shallowRef<DrawingInteractionController | null>(null)
const selectedDrawing = computed(() => {
  const id = selectedDrawingId.value
  if (!id) return null
  return drawings.value.find((d) => d.id === id) ?? null
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

// 统一光标样式：用内联 style 替代 CSS 类后代选择器，切断级联失效链
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

// 通知数据变化（在数据更新后调用）
function handleSelectTool(toolId: string) {
  drawingController.value?.setTool(toolId as DrawingToolId)
}

function onUpdateDrawingStyle(style: Partial<DrawingStyle>) {
  const d = selectedDrawing.value
  if (!d || !drawingController.value) return
  drawingController.value.updateDrawingStyle(d.id, style)
}

function onDeleteDrawing() {
  const d = selectedDrawing.value
  if (!d || !drawingController.value) return
  drawingController.value.removeDrawing(d.id)
  selectedDrawingId.value = null
  drawings.value = drawingController.value.getDrawings()
}

function onPointerDown(e: PointerEvent) {
  controller.value?.handlePointerEvent(e, {
    onPointerDown: (event, container) => {
      if (drawingController.value?.onPointerDown(event, container)) {
        drawings.value = drawingController.value.getDrawings()
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
      if (drawingController.value?.onPointerUp(event, container)) {
        drawings.value = drawingController.value.getDrawings()
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
  controller.value?.handleScrollEvent()
}

// 主图指标显式状态（副图指标从 subPanes 派生）
const mainActiveIndicators = ref<string[]>([])

// 副图指标列表从 subPanes 自动派生
const subActiveIndicators = computed(() => {
  const ids: string[] = []
  const seen = new Set<string>()
  for (const pane of subPanes.value) {
    if (!seen.has(pane.indicatorId)) {
      seen.add(pane.indicatorId)
      ids.push(pane.indicatorId)
    }
  }
  return ids
})

// 最终合并列表（主图 + 副图），保持显示顺序
const activeIndicators = computed(() => [
  ...mainActiveIndicators.value,
  ...subActiveIndicators.value,
])

// 指标参数配置（MA 的 periods 是数组，需要更宽松的类型）
const indicatorParams = ref<Record<string, Record<string, unknown>>>({})

// 副图槽位状态
interface SubPaneSlot {
  id: string // pane ID: 'RSI_0', 'MACD_0', ...
  indicatorId: SubIndicatorType
  params: Record<string, unknown>
}

// 副图槽位数组（支持多副图）
const subPanes = ref<SubPaneSlot[]>([])

// 最大副图数量
const maxSubPanes = 4

function buildPaneLayoutIntent(): PaneSpec[] {
  const mainRatio = paneRatios.value['main'] ?? 3
  return subPanes.value.length === 0
    ? [{ id: 'main', ratio: mainRatio, visible: true, role: 'price' }]
    : [
        { id: 'main', ratio: mainRatio, visible: true, role: 'price' },
        ...subPanes.value.map((pane) => ({
          id: pane.id,
          ratio: paneRatios.value[pane.id] ?? 1,
          visible: true,
          role: 'indicator' as const,
        })),
      ]
}

// 获取指标默认参数
function getDefaultParams(
  indicatorId: SubIndicatorType,
): Record<string, number | boolean | string> {
  return { ...SUB_PANE_INDICATOR_CONFIGS[indicatorId].defaultParams }
}

// 副图实例计数器：用于生成 'RSI_0', 'MACD_0' 这样的 paneId
const subPaneCounters = new Map<SubIndicatorType, number>()

function generatePaneId(indicatorId: SubIndicatorType): string {
  const count = subPaneCounters.get(indicatorId) ?? 0
  subPaneCounters.set(indicatorId, count + 1)
  return `${indicatorId}_${count}`
}

// 添加副图（使用 Chart API）
function addSubPane(
  indicatorId: SubIndicatorType = 'VOLUME',
  params?: Record<string, number | boolean | string>,
): boolean {
  if (subPanes.value.length >= maxSubPanes) {
    return false
  }

  const mergedParams = params ?? getDefaultParams(indicatorId)

  const paneId = controller.value?.addIndicator(indicatorId, 'sub', mergedParams)
  if (!paneId) return false
  return true
}

function removeSubPane(paneId: string): void {
  controller.value?.removeIndicator(paneId)
}

function clearAllSubPanes(): void {
  for (const pane of subPanes.value) {
    controller.value?.removeIndicator(pane.id)
  }
  subPaneCounters.clear()
}

function initIndicatorsFromConfig(): void {
  const config = props.semanticConfig
  const c = controller.value
  if (!c) return

  const mainIndicators = config.indicators?.main
  if (mainIndicators) {
    for (const indicator of mainIndicators) {
      if (indicator.enabled) {
        c.addIndicator(indicator.type, 'main', indicator.params as Record<string, number | boolean | string>)
      }
    }
  }
}

function syncSubPanesFromChart(): void {
  const entries = controller.value?.subPanes.peek() ?? []
  for (const entry of entries) {
    const { paneId, indicatorId, params } = entry
    const match = paneId.match(/^(.+)_(\d+)$/)
    if (match) {
      const [, indicator, countStr] = match
      const count = parseInt(countStr!, 10)
      const currentCount = subPaneCounters.get(indicator as SubIndicatorType) ?? 0
      if (count >= currentCount) {
        subPaneCounters.set(indicator as SubIndicatorType, count + 1)
      }
    }
  }
}

function switchSubIndicator(paneId: string, newIndicatorId: SubIndicatorType): void {
  const nextParams = getDefaultParams(newIndicatorId)
  controller.value?.replaceSubPaneIndicator(paneId, newIndicatorId, nextParams)
}

function handleIndicatorToggle(indicatorId: string, active: boolean) {
  const c = controller.value
  if (!c) return

  const mainIndicatorIds = [
    'MA', 'BOLL', 'EXPMA', 'ENE', 'WMA', 'DEMA', 'TEMA', 'HMA',
    'KAMA', 'SAR', 'SUPERTREND', 'KELTNER', 'DONCHIAN', 'ICHIMOKU',
    'PIVOT', 'FIB', 'STRUCTURE', 'ZONES',
  ]
  if (mainIndicatorIds.includes(indicatorId)) {
    const existingIndicator = mainActiveIndicators.value.find((id) => id === indicatorId)
    if (active && !existingIndicator) {
      c.addIndicator(indicatorId, 'main', indicatorParams.value[indicatorId])
    } else if (!active && existingIndicator) {
      c.removeIndicator(indicatorId.toUpperCase())
    }
    return
  }

  if (SUB_PANE_INDICATORS.includes(indicatorId as SubIndicatorType)) {
    if (active) {
      const existingPane = subPanes.value.find((p) => p.indicatorId === indicatorId)
      if (existingPane) return
      if (subPanes.value.length >= maxSubPanes) return

      const paneId = c.addIndicator(indicatorId, 'sub', indicatorParams.value[indicatorId])
      if (!paneId && subPanes.value.length > 0) {
        const lastPane = subPanes.value[subPanes.value.length - 1]
        switchSubIndicator(lastPane.id, indicatorId as SubIndicatorType)
      }
    } else {
      const panesToRemove = subPanes.value.filter((p) => p.indicatorId === indicatorId)
      panesToRemove.forEach((pane) => {
        c.removeIndicator(pane.id)
      })
    }
  }
}

function handleUpdateParams(indicatorId: string, params: Record<string, unknown>) {
  if (
    indicatorId === 'MA' || indicatorId === 'BOLL' ||
    indicatorId === 'EXPMA' || indicatorId === 'ENE'
  ) {
    controller.value?.updateIndicatorParams(indicatorId, params)
    return
  }
  if (SUB_PANE_INDICATORS.includes(indicatorId as SubIndicatorType)) {
    subPanes.value
      .filter((p) => p.indicatorId === indicatorId)
      .forEach((pane) => {
        controller.value?.updateIndicatorParams(pane.id, params)
      })
  }
}

function handleReorderSubIndicators(orderedIndicatorIds: string[]) {
  if (!orderedIndicatorIds.length || subPanes.value.length <= 1) return

  const validOrder = orderedIndicatorIds.filter((id): id is SubIndicatorType =>
    SUB_PANE_INDICATORS.includes(id as SubIndicatorType),
  )
  if (!validOrder.length) return

  const paneByIndicator = new Map(subPanes.value.map((pane) => [pane.indicatorId, pane] as const))
  const nextSubPanes: SubPaneSlot[] = []

  for (const indicatorId of validOrder) {
    const pane = paneByIndicator.get(indicatorId)
    if (pane) {
      nextSubPanes.push(pane)
      paneByIndicator.delete(indicatorId)
    }
  }

  if (nextSubPanes.length === 0) return

  for (const pane of subPanes.value) {
    if (paneByIndicator.has(pane.indicatorId)) {
      nextSubPanes.push(pane)
      paneByIndicator.delete(pane.indicatorId)
    }
  }

  const currentSubIds = subPanes.value.map((p) => p.id)
  const nextSubIds = nextSubPanes.map((p) => p.id)
  if (currentSubIds.join('|') === nextSubIds.join('|')) return

  subPanes.value = nextSubPanes

  const c = controller.value
  if (!c) return
  c.updatePaneLayout(buildPaneLayoutIntent())
}

/* 计算总宽度：从 Vue 响应式状态读取，zoom 变化时自动重算 */
const axisHostWidth = computed(() => props.rightAxisWidth + props.priceLabelWidth)

const totalWidth = computed(() => controller.value?.getContentWidth() ?? 0)

function scrollToRight() {
  const container = containerRef.value
  const c = controller.value
  if (!container || !c) return

  const dataLength = c.getData()?.length ?? 0
  if (dataLength === 0) return

  const vp = c.viewport.peek()
  const dpr = vp.dpr
  const { unitPx, startXPx } = getPhysicalKLineConfig(kWidth.value, kGap.value, dpr)

  const lastKLineEndPx = (startXPx + dataLength * unitPx) / dpr
  const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth)
  const targetScrollLeft = Math.min(
    maxScrollLeft,
    Math.max(0, lastKLineEndPx - container.clientWidth),
  )

  container.scrollLeft = Math.round(targetScrollLeft * dpr) / dpr
}

function applyZoomToLevel(targetLevel: number, anchorX?: number) {
  controller.value?.zoomToLevel(targetLevel, anchorX)
}

defineExpose({
  scheduleRender,
  scrollToRight,
  addSubPane,
  removeSubPane,
  switchSubIndicator,
  clearAllSubPanes,
  zoomToLevel: applyZoomToLevel,
  zoomIn: (anchorX?: number) => applyZoomToLevel(zoomLevel.value + 1, anchorX),
  zoomOut: (anchorX?: number) => applyZoomToLevel(zoomLevel.value - 1, anchorX),
  getZoomLevel: () => zoomLevel.value,
  getZoomLevelCount: () => controller.value?.getZoomLevelCount() ?? 10,
})

// ==================== onMounted 拆分函数 ====================

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
): ChartController {
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

    const desiredLeft = vp.desiredScrollLeft
    if (desiredLeft !== undefined && desiredLeft !== containerRef.value?.scrollLeft) {
      invalidateContainerRectCache()
      nextTick(() => {
        const c = containerRef.value
        if (!c) return
        const maxScrollLeft = Math.max(0, c.scrollWidth - c.clientWidth)
        const clampedScrollLeft = Math.min(Math.max(0, desiredLeft), maxScrollLeft)
        const dpr = vp.dpr
        c.scrollLeft = Math.round(clampedScrollLeft * dpr) / dpr
      })
    }
  })

  const unsubscribeData = ctrl.data.subscribe(() => {
    const data = ctrl.data.peek()
    dataLength.value = data.length
    dataVersion.value++
  })

  const unsubscribeTheme = ctrl.theme.subscribe(() => {
    chartTheme.value = ctrl.theme.peek()
  })

  const unsubscribeIndicators = ctrl.indicators.subscribe(() => {
    const instances = ctrl.indicators.peek()

    const mains = instances
      .filter((i): i is IndicatorInstance & { role: 'main' } => i.role === 'main')
      .map((i) => i.definitionId)
    mainActiveIndicators.value = mains

    const nextParams = { ...indicatorParams.value }
    for (const inst of instances) {
      if (inst.role === 'main' && inst.params && Object.keys(inst.params).length > 0) {
        nextParams[inst.definitionId] = { ...inst.params }
      }
    }

    ctrl.updateRendererConfig('mainIndicatorLegend', {
      indicators: {
        MA: { enabled: mains.includes('MA'), params: nextParams['MA'] || {} },
        BOLL: { enabled: mains.includes('BOLL'), params: nextParams['BOLL'] || {} },
        EXPMA: { enabled: mains.includes('EXPMA'), params: nextParams['EXPMA'] || {} },
        ENE: { enabled: mains.includes('ENE'), params: nextParams['ENE'] || {} },
      },
    })

    indicatorParams.value = nextParams
  })

  const unsubscribeSubPanes = ctrl.subPanes.subscribe(() => {
    const subPaneInfos = ctrl.subPanes.peek()
    const signalIds = new Set(subPaneInfos.map((sp) => sp.paneId))

    const merged = subPanes.value.filter((p) => signalIds.has(p.id))
    const existingIds = new Set(merged.map((p) => p.id))
    for (const sp of subPaneInfos) {
      if (!existingIds.has(sp.paneId)) {
        merged.push({
          id: sp.paneId,
          indicatorId: sp.indicatorId as SubIndicatorType,
          params: sp.params,
        })
      }
    }
    subPanes.value = merged

    const nextParams = { ...indicatorParams.value }
    for (const sp of subPaneInfos) {
      if (sp.params && Object.keys(sp.params).length > 0) {
        nextParams[sp.indicatorId] = { ...sp.params }
      }
    }
    indicatorParams.value = nextParams
  })

  onUnmounted(() => {
    unsubscribeViewport()
    unsubscribeData()
    unsubscribePaneRatios()
    unsubscribePaneLayout()
    unsubscribeTheme()
    unsubscribeIndicators()
    unsubscribeSubPanes()
  })
}

function applyInitialSettings(ctrl: ChartController): void {
  const initialSettings = toolbarRef.value?.getSettings() ?? { showVolumePriceMarkers: true }
  ctrl.updateSettingsFacade(initialSettings)

  if (initialSettings.performanceTest10kKlines) {
    const testData = generate10kKLineData()
    console.time('updateData-10k')
    ctrl.updateData(testData)
    console.timeEnd('updateData-10k')
  }
}

function setupDrawingController(ctrl: ChartController): void {
  drawingController.value = new DrawingInteractionController(ctrl)
  drawingController.value.setCallbacks({
    onDrawingCreated: (drawing) => {
      drawings.value = [...drawings.value, drawing]
      selectedDrawingId.value = drawing.id
    },
    onToolChange: () => {},
    onDrawingSelected: (drawing) => {
      selectedDrawingId.value = drawing?.id ?? null
    },
  })
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
  __setDataFetcher(props.dataFetcher)
  semanticController.value = new SemanticChartController(ctrl)

  semanticController.value.on('config:error', (error) => {
    console.error('Semantic config error:', error)
  })

  // config:ready → Chart 侧已完成创建，Vue 回读状态
  semanticController.value.on('config:ready', () => {
    initIndicatorsFromConfig()
    syncSubPanesFromChart()
    nextTick(() => scrollToRight())
  })
  // 应用副图、主图配置
  semanticController.value.applyConfig(props.semanticConfig).then((result) => {
    if (result && !result.success) {
      console.error('Semantic config apply failed:', result.errors)
    }
  })
}

onMounted(() => {
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
  const ctrl = initChart(container, canvasLayer!, rightAxisLayer!, xAxisCanvas!)
  controller.value = ctrl

  // 3) 信号回调
  setupChartCallbacks(ctrl)

  // 4) 工具栏初始设置
  applyInitialSettings(ctrl)

  // 5) 绘图交互控制器
  setupDrawingController(ctrl)

  // 6) 交互信号桥接
  setupInteractionCallbacks(ctrl)

  // 7) 语义化配置
  setupSemanticController(ctrl)
})

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

  --chart-bg: #ffffff;
  --chart-bg-secondary: #f8f9fa;
  --chart-border: #e5e7eb;
  --chart-border-active: #3b82f6;
  --chart-text: #374151;
  --chart-text-secondary: #6b7280;

  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--kmap-width);
  height: var(--kmap-height);
  min-height: 300px;
  flex-direction: column;
}

.chart-wrapper[data-theme='dark'] {
  --chart-bg: #1a1a2e;
  --chart-bg-secondary: #16162a;
  --chart-border: #2d2d44;
  --chart-border-active: #60a5fa;
  --chart-text: #e5e7eb;
  --chart-text-secondary: #9ca3af;
}

.chart-stage {
  width: 95%;
  height: 85%;
  min-height: 255px;
  display: flex;
  align-items: stretch;
  gap: 8px;
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
  border-radius: 6px 0 0 6px;
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
  border-top-right-radius: 6px;
  border-bottom-right-radius: 6px;

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
  .chart-stage {
    gap: 6px;
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
