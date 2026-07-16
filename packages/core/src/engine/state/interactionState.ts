import { createSubState, computed, batch, type ReadonlySignal } from '../../foundation/reactivity/signal'
import type { MarkerEntity, CustomMarkerEntity } from '../marker/registry'

export interface InteractionSnapshot {
  crosshairPos: { x: number; y: number } | null
  crosshairIndex: number | null
  crosshairPrice: number | null
  hoveredIndex: number | null
  activePaneId: string | null
  tooltipPos: { x: number; y: number }
  tooltipAnchorPlacement: 'right-bottom' | 'left-bottom'
  hoveredMarkerData: MarkerEntity | null
  hoveredCustomMarker: CustomMarkerEntity | null
  isDragging: boolean
  isResizingPaneBoundary: boolean
  isHoveringPaneBoundary: boolean
  hoveredPaneBoundaryId: string | null
  isHoveringRightAxis: boolean
}

export type DragMode = 'none' | 'pan' | 'resize-separator' | 'scale-price' | 'explore'

export interface InteractionDeps {
  visibleRange$: ReadonlySignal<{ start: number; end: number } | null>
  scrollLeftLogical$: ReadonlySignal<number>
  dpr$: ReadonlySignal<number>
  scheduleDraw: (level?: unknown) => void
}

/**
 * 交互业务态（kernel）。
 * 帧几何 kLinePositions/centers/kWidth 不在此模块，由 InteractionController 私有持有。
 */
export function createInteractionState(_deps: InteractionDeps) {
  const { signals, readonly } = createSubState({
    crosshairPos: null as { x: number; y: number } | null,
    crosshairPrice: null as number | null,
    /** 由 controller 在 flush hover 时写入，不再从几何 signal 推导 */
    crosshairIndex: null as number | null,
    hoveredIndex: null as number | null,
    activePaneId: null as string | null,
    isDragging: false,
    dragMode: 'none' as DragMode,
    hoveredSeparatorUpperPaneId: null as string | null,
    hoveredRightAxisPaneId: null as string | null,
    tooltipPos: { x: 0, y: 0 },
    tooltipAnchorPlacement: 'right-bottom' as 'right-bottom' | 'left-bottom',
    hoveredMarkerData: null as MarkerEntity | null,
    hoveredCustomMarker: null as CustomMarkerEntity | null,
    hoveredMarkerId: null as string | null,
  })

  // ── 带引用缓存的 interactionSnapshot ──
  let _cachedSnapshot: InteractionSnapshot | null = null
  const cachedInteractionSnapshot = computed<InteractionSnapshot>(() => {
    const crosshairPos = readonly.crosshairPos()
    const hoveredIndex = readonly.hoveredIndex()
    const dragMode = readonly.dragMode()
    const hoveredSep = readonly.hoveredSeparatorUpperPaneId()
    const hoveredRight = readonly.hoveredRightAxisPaneId()

    const next: InteractionSnapshot = {
      crosshairPos,
      crosshairIndex: readonly.crosshairIndex(),
      crosshairPrice: readonly.crosshairPrice(),
      hoveredIndex,
      activePaneId: readonly.activePaneId(),
      tooltipPos: readonly.tooltipPos(),
      tooltipAnchorPlacement: readonly.tooltipAnchorPlacement(),
      hoveredMarkerData: readonly.hoveredMarkerData(),
      hoveredCustomMarker: readonly.hoveredCustomMarker(),
      isDragging: readonly.isDragging(),
      isResizingPaneBoundary: dragMode === 'resize-separator',
      isHoveringPaneBoundary: hoveredSep !== null,
      hoveredPaneBoundaryId: hoveredSep,
      isHoveringRightAxis: hoveredRight !== null,
    }

    if (_cachedSnapshot) {
      const c = _cachedSnapshot
      if (
        c.crosshairPos === next.crosshairPos &&
        c.crosshairIndex === next.crosshairIndex &&
        c.crosshairPrice === next.crosshairPrice &&
        c.hoveredIndex === next.hoveredIndex &&
        c.activePaneId === next.activePaneId &&
        c.tooltipPos === next.tooltipPos &&
        c.tooltipAnchorPlacement === next.tooltipAnchorPlacement &&
        c.hoveredMarkerData === next.hoveredMarkerData &&
        c.hoveredCustomMarker === next.hoveredCustomMarker &&
        c.isDragging === next.isDragging &&
        c.isResizingPaneBoundary === next.isResizingPaneBoundary &&
        c.isHoveringPaneBoundary === next.isHoveringPaneBoundary &&
        c.hoveredPaneBoundaryId === next.hoveredPaneBoundaryId &&
        c.isHoveringRightAxis === next.isHoveringRightAxis
      ) {
        return _cachedSnapshot
      }
    }
    _cachedSnapshot = next
    return next
  })

  const mergedReadonly = {
    ...readonly,
    interactionSnapshot: cachedInteractionSnapshot,
  }

  return {
    readonly: mergedReadonly,

    actions: {
      /**
       * 更新十字线位置与价格。坐标结构相等时保留旧对象引用。
       * @param index 可选；传入时同步写入 crosshairIndex（与几何同帧）
       */
      updateCrosshair(
        pos: { x: number; y: number } | null,
        price: number | null,
        index?: number | null,
      ) {
        const prevPos = signals.crosshairPos.peek()
        const prevPrice = signals.crosshairPrice.peek()
        const prevIndex = signals.crosshairIndex.peek()
        const nextIndex = index === undefined ? prevIndex : index
        const posUnchanged =
          prevPos === pos ||
          (prevPos === null && pos === null) ||
          (prevPos !== null &&
            pos !== null &&
            prevPos.x === pos.x &&
            prevPos.y === pos.y)
        if (posUnchanged && prevPrice === price && prevIndex === nextIndex) return
        batch(() => {
          if (!posUnchanged) signals.crosshairPos.set(pos)
          if (prevPrice !== price) signals.crosshairPrice.set(price)
          if (prevIndex !== nextIndex) signals.crosshairIndex.set(nextIndex)
        })
      },

      setCrosshairIndex(index: number | null) {
        if (signals.crosshairIndex.peek() === index) return
        signals.crosshairIndex.set(index)
      },

      updateHover(index: number | null, paneId: string | null) {
        batch(() => {
          signals.hoveredIndex.set(index)
          signals.activePaneId.set(paneId)
        })
      },

      setHoveredIndex(index: number | null) {
        signals.hoveredIndex.set(index)
      },

      setActivePaneId(paneId: string | null) {
        signals.activePaneId.set(paneId)
      },

      startDrag(mode: DragMode) {
        batch(() => {
          signals.isDragging.set(true)
          signals.dragMode.set(mode)
        })
      },

      endDrag() {
        batch(() => {
          signals.isDragging.set(false)
          signals.dragMode.set('none')
        })
      },

      setDragMode(mode: DragMode) {
        signals.dragMode.set(mode)
      },

      setSeparatorHover(paneId: string | null) {
        signals.hoveredSeparatorUpperPaneId.set(paneId)
      },

      setRightAxisHover(paneId: string | null) {
        signals.hoveredRightAxisPaneId.set(paneId)
      },

      /**
       * 更新 tooltip。位置与锚点均未变时跳过写入。
       */
      updateTooltip(
        pos: { x: number; y: number },
        placement: 'right-bottom' | 'left-bottom',
      ) {
        const prevPos = signals.tooltipPos.peek()
        const prevPlacement = signals.tooltipAnchorPlacement.peek()
        if (
          prevPos.x === pos.x &&
          prevPos.y === pos.y &&
          prevPlacement === placement
        ) {
          return
        }
        batch(() => {
          if (prevPos.x !== pos.x || prevPos.y !== pos.y) {
            signals.tooltipPos.set(pos)
          }
          if (prevPlacement !== placement) {
            signals.tooltipAnchorPlacement.set(placement)
          }
        })
      },

      updateMarkerHover(
        markerId: string | null,
        markerData: MarkerEntity | null,
        customMarkerData: CustomMarkerEntity | null,
      ) {
        batch(() => {
          signals.hoveredMarkerId.set(markerId)
          signals.hoveredMarkerData.set(markerData)
          signals.hoveredCustomMarker.set(customMarkerData)
        })
      },

      reset() {
        batch(() => {
          signals.crosshairPos.set(null)
          signals.crosshairPrice.set(null)
          signals.crosshairIndex.set(null)
          signals.hoveredIndex.set(null)
          signals.activePaneId.set(null)
          signals.isDragging.set(false)
          signals.dragMode.set('none')
          signals.hoveredSeparatorUpperPaneId.set(null)
          signals.hoveredRightAxisPaneId.set(null)
          signals.tooltipPos.set({ x: 0, y: 0 })
          signals.tooltipAnchorPlacement.set('right-bottom')
          signals.hoveredMarkerData.set(null)
          signals.hoveredCustomMarker.set(null)
          signals.hoveredMarkerId.set(null)
        })
      },
    },

    dispose() {
      batch(() => {
        signals.crosshairPos.set(null)
        signals.crosshairPrice.set(null)
        signals.crosshairIndex.set(null)
        signals.hoveredIndex.set(null)
        signals.activePaneId.set(null)
        signals.isDragging.set(false)
        signals.dragMode.set('none')
        signals.hoveredSeparatorUpperPaneId.set(null)
        signals.hoveredRightAxisPaneId.set(null)
        signals.tooltipPos.set({ x: 0, y: 0 })
        signals.tooltipAnchorPlacement.set('right-bottom')
        signals.hoveredMarkerData.set(null)
        signals.hoveredCustomMarker.set(null)
        signals.hoveredMarkerId.set(null)
      })
    },
  }
}

export type InteractionStateModule = ReturnType<typeof createInteractionState>
