/** 重置按钮显隐：只有真正改变视图的用户交互（拖拽、缩放）才恢复，鼠标移动不算交互。 */
import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
import { type Ref, ref, watch } from 'vue'
import { useControllerSignalValue } from './useControllerSignal.js'

/** 导航浮层中的重置命令 id；只有它会收起按钮，其余视图命令都恢复按钮。 */
const RESET_COMMAND = 'view.reset'

/** 一次拖拽开始时的 X 轴视图快照，用于从纯点击里区分出真正发生平移的拖拽。 */
interface DragView {
  readonly visibleFrom: number
  readonly visibleTo: number
  readonly kWidth: number
}

/**
 * 读取当前 X 轴视图。
 *
 * @param controller 图表控制器；未就绪时返回 null
 * @returns 用于拖拽前后对比的视图快照
 */
function readView(controller: ChartController | null): DragView | null {
  if (!controller) return null
  const viewport = controller.viewport.peek()
  return {
    visibleFrom: viewport.visibleFrom,
    visibleTo: viewport.visibleTo,
    kWidth: viewport.kWidth,
  }
}

/**
 * 判断拖拽是否真的改变了 X 轴视图。
 *
 * @param from 拖拽开始时的视图
 * @param to 拖拽结束时的视图
 * @returns 可见区间或缩放宽度发生变化时为 true
 */
function viewChanged(from: DragView, to: DragView): boolean {
  return (
    from.visibleFrom !== to.visibleFrom ||
    from.visibleTo !== to.visibleTo ||
    from.kWidth !== to.kWidth
  )
}

/**
 * 导航浮层里重置按钮的收起规则。
 *
 * @remarks
 * 订阅 Core 原始状态而不是 DOM 事件：`interactionState.isDragging` 表示拖拽，
 * `viewport.zoomLevel` 表示缩放。可见区间只用于拖拽首尾对比，不能作为订阅触发条件，
 * 因为数据加载与前插补偿也会改变它。
 * @param controller 当前图表控制器
 * @returns 收起态与命令执行入口
 */
export function useResetChartVisibility(controller: Readonly<Ref<ChartController | null>>) {
  /** 重置后按钮是否处于收起态。 */
  const dismissed = ref(false)

  const zoomLevel = useControllerSignalValue(
    controller,
    (chart) => chart.viewport,
    (viewport) => viewport.zoomLevel,
    () => 1,
  )
  const isDragging = useControllerSignalValue(
    controller,
    (chart) => chart.interactionState,
    (snapshot) => snapshot.isDragging,
    () => false,
  )

  /** 收起时的缩放基线；重置自身会改 zoomLevel，必须取重置完成后的值。 */
  let zoomBaseline = zoomLevel.value
  let dragStart: DragView | null = null

  // 缩放离开基线即视为用户重新缩放：滚轮、捏合、按钮和快捷键最终都写 zoomLevel。
  watch(zoomLevel, (level) => {
    if (dismissed.value && level !== zoomBaseline) dismissed.value = false
  })

  // 同步取样拖拽首尾视图：纯点击没有平移，不应恢复按钮。
  watch(
    isDragging,
    (dragging) => {
      if (dragging) {
        dragStart = readView(controller.value)
        return
      }
      const start = dragStart
      dragStart = null
      if (!dismissed.value || !start) return
      const end = readView(controller.value)
      if (end && viewChanged(start, end)) dismissed.value = false
    },
    { flush: 'sync' },
  )

  /**
   * 导航按钮执行后更新收起态。
   *
   * @param command 已执行的命令 id
   */
  function onCommandExecuted(command: string): void {
    if (command === RESET_COMMAND) {
      zoomBaseline = controller.value?.viewport.peek().zoomLevel ?? zoomLevel.value
      dismissed.value = true
      return
    }
    dismissed.value = false
  }

  return { dismissed, onCommandExecuted }
}
