/**
 * @deprecated Phase 4 – Vue 组件不再使用 ChartStore。
 * computeContentWidth / TRAILING_DRAWING_SLOTS 将在后续重构中迁移至核心工具模块。
 * 此文件仅保留供 computeContentWidth 导出，将于 Phase 5 完全删除。
 */
import { reactive, computed, type UnwrapNestedRefs } from 'vue'
import { getPhysicalKLineConfig } from './utils/klineConfig'
import type { DrawingObject } from '../plugin'

/** 右侧空白绘制槽位数（逻辑 bar 数） */
export const TRAILING_DRAWING_SLOTS = 24

export interface ChartStoreOptions {
  initialZoomLevel: number
  minKWidth: number
  maxKWidth: number
  zoomLevels: number
  rightAxisWidth: number
  priceLabelWidth: number
}

export function computeContentWidth(params: {
  dataLength: number
  kWidth: number
  kGap: number
  viewWidth: number
  viewportDpr: number
}): number {
  const { dataLength, kWidth, kGap, viewWidth, viewportDpr } = params
  if (dataLength === 0) return 0
  const { startXPx, unitPx } = getPhysicalKLineConfig(kWidth, kGap, viewportDpr)
  const dataPlotWidth = (startXPx + (dataLength + TRAILING_DRAWING_SLOTS) * unitPx) / viewportDpr
  return Math.max(dataPlotWidth, viewWidth)
}

export function createChartStore(opts: ChartStoreOptions) {
  const state = reactive({
    zoomLevel: opts.initialZoomLevel,
    kWidth: 0,
    kGap: 1,
    viewportDpr: 1,
    dataLength: 0,
    dataVersion: 0,
    paneRatios: {} as Record<string, number>,
    drawings: [] as DrawingObject[],
    selectedDrawingId: null as string | null,
    drawingVersion: 0,
    viewWidth: 0,
  })

  // 右侧轴宽度
  const axisHostWidth = computed(() => opts.rightAxisWidth + opts.priceLabelWidth)

  const totalWidth = computed(() =>
    computeContentWidth({
      dataLength: state.dataLength,
      kWidth: state.kWidth,
      kGap: state.kGap,
      viewWidth: state.viewWidth,
      viewportDpr: state.viewportDpr,
    }),
  )

  function bumpDataVersion() {
    state.dataVersion++
  }

  function bumpDrawingVersion() {
    state.drawingVersion++
  }

  function setDataLength(length: number) {
    state.dataLength = length
  }

  function setViewportDpr(dpr: number) {
    state.viewportDpr = dpr
  }

  function setViewWidth(width: number) {
    state.viewWidth = width
  }

  function setZoomState(level: number, newKWidth: number, newKGap: number) {
    state.zoomLevel = level
    state.kWidth = newKWidth
    state.kGap = newKGap
  }

  function setPaneRatios(ratios: Record<string, number>) {
    state.paneRatios = ratios
  }

  function setDrawings(newDrawings: DrawingObject[]) {
    state.drawings = newDrawings
    if (state.selectedDrawingId && !newDrawings.some((d) => d.id === state.selectedDrawingId)) {
      state.selectedDrawingId = null
    }
    state.drawingVersion++
  }

  function setSelectedDrawingId(id: string | null) {
    state.selectedDrawingId = id
  }

  return {
    state: state as UnwrapNestedRefs<typeof state>,
    computed: {
      axisHostWidth,
      totalWidth,
    },
    actions: {
      bumpDataVersion,
      bumpDrawingVersion,
      setDataLength,
      setViewportDpr,
      setViewWidth,
      setZoomState,
      setPaneRatios,
      setDrawings,
      setSelectedDrawingId,
    },
  }
}

export type ChartStore = ReturnType<typeof createChartStore>
