/**
 * Manages drawing interaction state (selected drawings, drawings list),
 * tool activation, style updates, and deletion.
 * Provides setupDrawing() to initialize DrawingInteractionController
 * while confirmed drawings and selections are read directly from Core signals.
 */
import {
  type ChartController,
  DrawingInteractionController,
  type DrawingLabelIndex,
  type DrawingLabelPosition,
  type DrawingObject,
  type DrawingStyle,
  type DrawingToolId,
  type MagnetMode,
} from '@363045841yyt/klinechart-core/controllers'
import { computed, type Ref, shallowRef } from 'vue'
import { useControllerSignal } from './useControllerSignal.js'

export function useDrawingManager(ctrl: Ref<ChartController | null>) {
  const drawingController = shallowRef<DrawingInteractionController | null>(null)
  const magnetMode = shallowRef<MagnetMode>('off')
  const continuousDrawing = shallowRef(false)
  const selectedDrawingIds = useControllerSignal<ReadonlyArray<string>>(
    ctrl,
    (chart) => chart.selectedDrawingIds,
    () => [],
  )
  const drawings = useControllerSignal<ReadonlyArray<DrawingObject>>(
    ctrl,
    (chart) => chart.drawings,
    () => [],
  )
  const selectedDrawings = computed(() => {
    const selectedIds = new Set(selectedDrawingIds.value)
    return drawings.value.filter((drawing) => selectedIds.has(drawing.id))
  })
  const selectedDrawingStyleKeys = computed(() => {
    drawings.value
    return ctrl.value?.getBatchStyleKeys(selectedDrawingIds.value) ?? []
  })
  const globalDrawingLock = useControllerSignal(
    ctrl,
    (chart) => chart.globalDrawingLock,
    () => false,
  )

  function handleSelectTool(toolId: string) {
    // Chart 单写路径：kernel + session side effects
    ctrl.value?.setDrawingToolId(toolId as DrawingToolId)
  }

  function setMagnetMode(mode: MagnetMode) {
    magnetMode.value = mode
    drawingController.value?.setMagnetMode(mode)
  }

  function setContinuousDrawing(enabled: boolean) {
    continuousDrawing.value = enabled
    drawingController.value?.setContinuousDrawing(enabled)
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

  /** 复制当前选择，位置与选中状态由 Core 原子处理。 */
  function onCopyDrawings() {
    ctrl.value?.copyDrawings(selectedDrawingIds.value)
  }

  /** 批量写入选中图元的锁定状态。 */
  function onToggleDrawingLock(locked: boolean) {
    const ids = selectedDrawingIds.value
    if (ids.length === 0) return
    ctrl.value?.updateBatch(ids, { locked })
  }

  /** 隐藏选中图元；Core 同步移除其选中状态。 */
  function onHideSelectedDrawings() {
    const ids = selectedDrawingIds.value.filter((id) =>
      drawings.value.some((drawing) => drawing.id === id && drawing.visible),
    )
    if (ids.length > 0) ctrl.value?.updateBatch(ids, { visible: false })
  }

  /** 一次事务设置整张图表的图元可见性。 */
  function onSetAllDrawingsVisible(visible: boolean) {
    const ids = drawings.value
      .filter((drawing) => drawing.visible !== visible)
      .map((drawing) => drawing.id)
    if (ids.length > 0) ctrl.value?.updateBatch(ids, { visible })
  }

  /** 切换全局绘图锁定；只冻结移动，不改写各图元自身 locked。 */
  function onSetGlobalDrawingLock(locked: boolean) {
    ctrl.value?.setGlobalDrawingLock(locked)
  }

  function setupDrawing(chartCtrl: ChartController): void {
    drawingController.value = new DrawingInteractionController(chartCtrl)
    drawingController.value.setMagnetMode(magnetMode.value)
    drawingController.value.setContinuousDrawing(continuousDrawing.value)
    chartCtrl.registerDrawingSession(drawingController.value)
  }

  return {
    drawingController,
    magnetMode,
    setMagnetMode,
    continuousDrawing,
    setContinuousDrawing,
    selectedDrawingIds,
    selectedDrawings,
    selectedDrawingStyleKeys,
    drawings,
    globalDrawingLock,
    handleSelectTool,
    onUpdateDrawingStyle,
    updateDrawingLabel,
    onDeleteDrawing,
    onCopyDrawings,
    onToggleDrawingLock,
    onHideSelectedDrawings,
    onSetAllDrawingsVisible,
    onSetGlobalDrawingLock,
    setupDrawing,
  }
}
