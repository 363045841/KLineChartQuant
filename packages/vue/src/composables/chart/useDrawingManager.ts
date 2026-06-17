/**
 * Manages drawing interaction state (selected drawing, drawings list),
 * tool activation, style updates, and deletion.
 * Provides setupDrawing() to initialize DrawingInteractionController
 * with lifecycle callbacks that sync back to Vue refs.
 */
import { ref, computed, shallowRef, type Ref } from 'vue'
import {
  DrawingInteractionController,
  type ChartController,
  type DrawingToolId,
} from '@363045841yyt/klinechart-core/controllers'
import type { DrawingObject, DrawingStyle } from '@363045841yyt/klinechart-core/plugin'

export function useDrawingManager(ctrl: Ref<ChartController | null>) {
  const drawingController = shallowRef<DrawingInteractionController | null>(null)
  const selectedDrawingId = ref<string | null>(null)
  const drawings = ref<DrawingObject[]>([])
  const selectedDrawing = computed(() => {
    const id = selectedDrawingId.value
    if (!id) return null
    return drawings.value.find((d) => d.id === id) ?? null
  })

  function handleSelectTool(toolId: string) {
    drawingController.value?.setTool(toolId as DrawingToolId)
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
