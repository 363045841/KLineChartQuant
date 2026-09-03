/**
 * Manages drawing interaction state (selected drawing, drawings list),
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
  /** 镜像 kernel.selectedDrawingId（shallowRef 避免 deep proxy 破坏 Object.is） */
  const selectedDrawingId = shallowRef<string | null>(null)
  const drawings = shallowRef<ReadonlyArray<DrawingObject>>([])
  const readonlySelectedDrawingId = computed(() => selectedDrawingId.value)
  const readonlyDrawings = computed(() => drawings.value)
  const selectedDrawing = computed(() => {
    const id = selectedDrawingId.value
    if (!id) return null
    return drawings.value.find((d) => d.id === id) ?? null
  })

  let unsubDrawings: (() => void) | null = null
  let unsubSelected: (() => void) | null = null

  function handleSelectTool(toolId: string) {
    // Chart 单写路径：kernel + session side effects
    ctrl.value?.setDrawingToolId(toolId as DrawingToolId)
  }

  function onUpdateDrawingStyle(style: Partial<DrawingStyle>) {
    const d = selectedDrawing.value
    if (!d) return
    ctrl.value?.updateDrawing(d.id, { style })
  }

  function onDeleteDrawing() {
    const d = selectedDrawing.value
    if (!d) return
    ctrl.value?.removeDrawing(d.id)
  }

  function setupDrawing(chartCtrl: ChartController): void {
    drawingController.value = new DrawingInteractionController(chartCtrl)
    chartCtrl.registerDrawingSession(drawingController.value)
    drawingController.value.setCallbacks({
      onDrawingCreated: (drawing) => {
        // selection 写 kernel；UI 由 selectedDrawingId signal 回推
        chartCtrl.setSelectedDrawingId(drawing.id)
      },
      onToolChange: () => {},
      onDrawingSelected: (drawing) => {
        chartCtrl.setSelectedDrawingId(drawing?.id ?? null)
      },
    })

    // UI 只镜像 kernel 已确认列表；预览/拖拽不进 Vue ref
    unsubDrawings = chartCtrl.drawings.subscribe(() => {
      drawings.value = chartCtrl.drawings.peek()
    })
    drawings.value = chartCtrl.drawings.peek()

    const syncSelected = () => {
      selectedDrawingId.value = chartCtrl.selectedDrawingId.peek()
    }
    unsubSelected = chartCtrl.selectedDrawingId.subscribe(syncSelected)
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
    selectedDrawingId: readonlySelectedDrawingId,
    selectedDrawing,
    drawings: readonlyDrawings,
    handleSelectTool,
    onUpdateDrawingStyle,
    onDeleteDrawing,
    setupDrawing,
  }
}
