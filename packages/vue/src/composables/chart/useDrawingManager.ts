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
  const drawings = shallowRef<DrawingObject[]>([])
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
    if (!d || !drawingController.value) return
    drawingController.value.updateDrawingStyle(d.id, style)
    drawings.value = drawingController.value.getDrawings()
  }

  function onDeleteDrawing() {
    const d = selectedDrawing.value
    if (!d || !drawingController.value) return
    drawingController.value.removeDrawing(d.id)
    drawings.value = drawingController.value.getDrawings()
  }

  function setupDrawing(chartCtrl: ChartController): void {
    drawingController.value = new DrawingInteractionController(chartCtrl)
    chartCtrl.registerDrawingSession(drawingController.value)
    drawingController.value.setCallbacks({
      onDrawingCreated: (drawing) => {
        drawings.value = [...drawings.value, drawing]
        // selection 写 kernel；UI 由 selectedDrawingId signal 回推
        chartCtrl.setSelectedDrawingId(drawing.id)
      },
      onToolChange: () => {},
      onDrawingSelected: (drawing) => {
        chartCtrl.setSelectedDrawingId(drawing?.id ?? null)
      },
    })

    let syncing = false
    unsubDrawings = chartCtrl.drawings.subscribe(() => {
      if (syncing) return
      syncing = true
      const full = chartCtrl.getFullDrawings()
      drawingController.value?.setDrawings(full)
      drawings.value = full as DrawingObject[]
      syncing = false
    })
    drawings.value = chartCtrl.getFullDrawings() as DrawingObject[]

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
    selectedDrawingId,
    selectedDrawing,
    drawings,
    handleSelectTool,
    onUpdateDrawingStyle,
    onDeleteDrawing,
    setupDrawing,
  }
}
