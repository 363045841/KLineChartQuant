/**
 * useInteractionBridge：把 Controller 的 interactionState 快照桥接到舞台表现与 Vue 镜像。
 * 负责拖拽/悬停类名、容器光标、外部 K 线 tooltip 快照与 marker hover 镜像，
 * 并在 controller 更换或组件卸载时显式退订 interactionState。
 */
import { createIdleInteractionSnapshot } from '@363045841yyt/klinechart-core'
import type {
  ChartController,
  InteractionSnapshot,
} from '@363045841yyt/klinechart-core/controllers'
import type {
  CustomMarkerEntity,
  MarkerEntity,
} from '@363045841yyt/klinechart-core/engine/marker/registry'
import { type Ref, shallowRef, watch } from 'vue'

/** 交互绑定的依赖；stage/container 等均为组件内唯一实例。 */
export interface InteractionBridgeOptions {
  /** ChartController 引用；就绪后自动订阅 interactionState */
  controller: Ref<ChartController | null>
  /** 图表舞台元素，承接拖拽/悬停类名与 dataset */
  stageRef: Ref<HTMLElement | null>
  /** 图表容器，承接光标 */
  containerRef: Ref<HTMLElement | null>
  /** 是否由外部 #kline-tooltip 插槽消费快照 */
  hasExternalSlot: Ref<boolean>
  /** 图元拖拽会话冻结的光标；非空时优先于通用光标 */
  getDragCursor: () => string | null
  /** marker 进入悬停时回调，用于重定位 marker tooltip */
  onMarkerHover: () => void
}

/**
 * 光标优先级：图元拖拽会话冻结目标 > 实时绘图悬停 > 通用 hover。
 * 拖拽中 kernel 的 isDragging 恒为 true（记 `grabbing`），无法区分「平移」与「拖图元」，
 * 因此图元拖拽沿用按下时认定的 cursor；标尺/平移仍走 grabbing。
 */
function pickCursor(
  snapshot: InteractionSnapshot,
  dragCursor: string | null,
  fallbackCursor: string,
): string {
  if (dragCursor !== null && snapshot.drawingHoverTarget !== 'none') return dragCursor
  return resolveStageCursor(snapshot, fallbackCursor)
}

/**
 * 舞台光标：图表平移/框选 dragging；面板分隔与绘图中点手柄 ns-resize；
 * 图元线身 move（可整体拖动）；圆形锚点显式 default，避免沿用十字线/指针。
 */
function resolveStageCursor(state: InteractionSnapshot, fallbackCursor: string): string {
  if (state.isResizingPaneBoundary || state.isHoveringPaneBoundary) return 'ns-resize'
  if (state.drawingHoverTarget === 'vertical-handle') return 'ns-resize'
  if (state.drawingHoverTarget === 'all') return 'move'
  if (state.drawingHoverTarget === 'anchor') return 'default'
  if (state.isDragging) return 'grabbing'
  return fallbackCursor
}

/** 将快照映射为舞台类名、分隔线高亮与容器光标。 */
function applyStage(
  stage: HTMLElement | null,
  container: HTMLElement | null,
  next: InteractionSnapshot,
  dragCursor: string | null,
): void {
  stage?.classList.toggle('is-dragging', next.isDragging)
  const drawingDragging = dragCursor !== null && next.drawingHoverTarget !== 'none'
  stage?.classList.toggle('is-dragging-drawing', drawingDragging)
  if (stage && drawingDragging) {
    stage.dataset.drawingCursor = next.drawingHoverTarget
  } else if (stage) {
    delete stage.dataset.drawingCursor
  }
  stage?.classList.toggle('is-resizing-pane', next.isResizingPaneBoundary)
  stage?.classList.toggle('is-hovering-pane-separator', next.isHoveringPaneBoundary)
  stage?.classList.toggle('is-hovering-right-axis', next.isHoveringRightAxis)
  stage?.classList.toggle('is-hovering-kline', next.hoveredIndex !== null)
  stage?.querySelectorAll<HTMLElement>('.pane-separator-line').forEach((line) => {
    line.classList.toggle('is-active', line.dataset.paneId === next.hoveredPaneBoundaryId)
  })

  if (container) {
    // 下一帧兜底光标：本帧没有绘图会话时按通用 hover 推导。
    const fallback = next.hoveredIndex !== null ? 'pointer' : 'crosshair'
    container.style.cursor = pickCursor(next, dragCursor, fallback)
  }
}

/**
 * 订阅 interactionState 并同步舞台与镜像。
 * @param options 交互绑定依赖
 * @returns 外部 tooltip 快照与 marker hover 镜像
 */
export function useInteractionBridge(options: InteractionBridgeOptions) {
  const externalState = shallowRef<InteractionSnapshot>(createIdleInteractionSnapshot())
  const hoveredMarker = shallowRef<MarkerEntity | null>(null)
  const hoveredCustomMarker = shallowRef<CustomMarkerEntity | null>(null)

  /** 应用一帧交互快照：舞台表现 + 外部快照 + marker 镜像。 */
  function apply(next: InteractionSnapshot): void {
    applyStage(options.stageRef.value, options.containerRef.value, next, options.getDragCursor())

    // 自定义 K 线 tooltip 是调用方显式选择的 Vue slot；仅该分支保留高频响应式 props。
    if (options.hasExternalSlot.value) externalState.value = next

    if (hoveredMarker.value !== next.hoveredMarkerData) {
      hoveredMarker.value = next.hoveredMarkerData
    }
    if (hoveredCustomMarker.value !== next.hoveredCustomMarker) {
      hoveredCustomMarker.value = next.hoveredCustomMarker
    }
    if (next.hoveredMarkerData || next.hoveredCustomMarker) options.onMarkerHover()
  }

  watch(
    options.controller,
    (ctrl, _previous, onCleanup) => {
      if (!ctrl) return
      // 仅在快照实际变化时写入，保持挂载时舞台光标/类名与旧行为一致（不写入 idle 快照）。
      onCleanup(ctrl.interactionState.subscribe(() => apply(ctrl.interactionState.peek())))
    },
    { immediate: true },
  )

  return { externalState, hoveredMarker, hoveredCustomMarker }
}
