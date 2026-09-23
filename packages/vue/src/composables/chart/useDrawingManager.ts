/**
 * Manages drawing interaction state (selected drawings, drawings list),
 * tool activation, style updates, and deletion.
 * Provides setupDrawing() to initialize DrawingInteractionController
 * with lifecycle callbacks that sync back to Vue refs.
 */
import {
  type ChartController,
  DrawingInteractionController,
  type DrawingLabelIndex,
  type DrawingLabelPosition,
  type DrawingObject,
  type DrawingStyle,
  type DrawingToolId,
} from '@363045841yyt/klinechart-core/controllers'
import { computed, onUnmounted, type Ref, shallowRef } from 'vue'

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

  /** 原子替换指定图元的完整文本模型快照。 */
  function updateDrawingLabel(
    drawingId: string,
    targetKind: 'line' | 'area',
    targetIndex: number,
    label: string,
    position: DrawingLabelPosition,
  ) {
    const drawing = drawings.value.find((item) => item.id === drawingId)
    if (!drawing) return
    const labels = {
      line: { ...(drawing.labels?.line ?? {}) },
      area: { ...(drawing.labels?.area ?? {}) },
    }
    const target = targetKind === 'line' ? labels.line : labels.area
    // 标签键是 DrawingLabelIndex 契约（`${number}`），用模板字面量构造而非 String()。
    const key: DrawingLabelIndex = `${targetIndex}`
    if (label.trim() === '') delete target[key]
    else target[key] = { text: label, position }
    ctrl.value?.updateDrawing({ ...drawing, labels })
  }

  function onDeleteDrawing() {
    const ids = selectedDrawingIds.value
    if (ids.length === 0) return
    ctrl.value?.removeBatch(ids)
  }

  /** 批量写入选中图元的锁定状态。 */
  function onToggleDrawingLock(locked: boolean) {
    const ids = selectedDrawingIds.value
    if (ids.length === 0) return
    ctrl.value?.updateBatch(ids, { locked })
  }

  function setupDrawing(chartCtrl: ChartController): void {
    drawingController.value = new DrawingInteractionController(chartCtrl)
    chartCtrl.registerDrawingSession(drawingController.value)

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
    updateDrawingLabel,
    onDeleteDrawing,
    onToggleDrawingLock,
    setupDrawing,
  }
}
