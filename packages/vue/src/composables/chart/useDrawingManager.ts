/**
 * Manages drawing interaction state (selected drawings, drawings list),
 * tool activation, style updates, and deletion.
 * Provides setupDrawing() to initialize DrawingInteractionController
 * with lifecycle callbacks that sync back to Vue refs.
 */
import {
  DrawingInteractionController,
  type ChartController,
  type DrawingToolId,
} from '@363045841yyt/klinechart-core/controllers'
import type { DrawingObject, DrawingStyle } from '@363045841yyt/klinechart-core/plugin'
import { computed, shallowRef, onUnmounted, type Ref } from 'vue'

export function useDrawingManager(ctrl: Ref<ChartController | null>) {
  const drawingController = shallowRef<DrawingInteractionController | null>(null)
  /** 镜像 kernel.selectedDrawingIds（shallowRef 避免 deep proxy 破坏 Object.is）。 */
  const selectedDrawingIds = shallowRef<ReadonlyArray<string>>([])
  const drawings = shallowRef<ReadonlyArray<DrawingObject>>([])
  const readonlySelectedDrawingIds = computed(() => selectedDrawingIds.value)
  const readonlyDrawings = computed(() => drawings.value)
  const selectedDrawings = computed(() => {
    const selectedIds = new Set(selectedDrawingIds.value)
    return drawings.value.filter((drawing) => selectedIds.has(drawing.id))
  })
  const selectedDrawingStyleKeys = computed(() => {
    drawings.value
    return ctrl.value?.getBatchStyleKeys(selectedDrawingIds.value) ?? []
  })

  let unsubDrawings: (() => void) | null = null
  let unsubSelected: (() => void) | null = null

  function handleSelectTool(toolId: string) {
    // Chart 单写路径：kernel + session side effects
    ctrl.value?.setDrawingToolId(toolId as DrawingToolId)
  }

  function onUpdateDrawingStyle(style: Partial<DrawingStyle>) {
    const ids = selectedDrawingIds.value
    if (ids.length === 0) return
    ctrl.value?.updateBatch(ids, { style })
  }

  function onDeleteDrawing() {
    const ids = selectedDrawingIds.value
    if (ids.length === 0) return
    ctrl.value?.removeBatch(ids)
  }

  function setupDrawing(chartCtrl: ChartController): void {
    drawingController.value = new DrawingInteractionController(chartCtrl)
    chartCtrl.registerDrawingSession(drawingController.value)
    drawingController.value.setCallbacks({
      onDrawingCreated: (drawing) => {
        // selection 写 kernel；UI 由 selectedDrawingIds signal 回推
        chartCtrl.setSelectedDrawingIds([drawing.id])
      },
      onToolChange: () => {},
      onDrawingSelected: (drawings) => {
        chartCtrl.setSelectedDrawingIds(drawings.map((drawing) => drawing.id))
      },
    })

    // UI 只镜像 kernel 已确认列表；预览/拖拽不进 Vue ref
    unsubDrawings = chartCtrl.drawings.subscribe(() => {
      drawings.value = chartCtrl.drawings.peek()
    })
    drawings.value = chartCtrl.drawings.peek()

    const syncSelected = () => {
      selectedDrawingIds.value = chartCtrl.selectedDrawingIds.peek()
    }
    unsubSelected = chartCtrl.selectedDrawingIds.subscribe(syncSelected)
    syncSelected()
  }

  onUnmounted(() => {
    unsubDrawings?.()
    unsubDrawings = null
    unsubSelected?.()
    unsubSelected = null
  })

  return {
    drawingController,
    selectedDrawingIds: readonlySelectedDrawingIds,
    selectedDrawings,
    selectedDrawingStyleKeys,
    drawings: readonlyDrawings,
    handleSelectTool,
    onUpdateDrawingStyle,
    onDeleteDrawing,
    setupDrawing,
  }
}
