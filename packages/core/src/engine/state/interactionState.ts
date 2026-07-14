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

function computeCrosshairIndex(
  crosshairPos: { x: number; y: number } | null,
  kLinePositions: number[] | null,
  kWidthPx: number | null,
  visibleRange: { start: number; end: number } | null,
  scrollLeftLogical: number,
  dpr: number,
): number | null {
  if (!crosshairPos || !kLinePositions || !kWidthPx || !visibleRange) return null
  const kWidthLogical = kWidthPx / dpr
  const worldX = scrollLeftLogical + crosshairPos.x
  const positions = kLinePositions

  let lo = 0
  let hi = positions.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (positions[mid]! < worldX) lo = mid + 1
    else hi = mid
  }
  let localIdx = lo
  if (lo > 0 && lo < positions.length) {
    const prevCenter = positions[lo - 1]! + kWidthLogical / 2
    const currCenter = positions[lo]! + kWidthLogical / 2
    if (Math.abs(worldX - prevCenter) < Math.abs(worldX - currCenter)) {
      localIdx = lo - 1
    }
  } else if (lo === positions.length && positions.length > 0) {
    localIdx = positions.length - 1
  }
  return localIdx + visibleRange.start
}

export function createInteractionState(deps: InteractionDeps) {
  const { signals, readonly } = createSubState(
    {
      crosshairPos: null as { x: number; y: number } | null,
      crosshairPrice: null as number | null,
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
      kLinePositions: null as number[] | null,
      kLineCenters: null as number[] | null,
      kWidthPx: null as number | null,
    },
    {
      crosshairIndex: (s) => {
        if (!s.crosshairPos()) return null
        return computeCrosshairIndex(
          s.crosshairPos(),
          s.kLinePositions(),
          s.kWidthPx(),
          deps.visibleRange$(),
          deps.scrollLeftLogical$(),
          deps.dpr$(),
        )
      },
    },
  )

  // ── 带引用缓存 + deps 收紧的 interactionSnapshot ──
  // crosshairPos 为 null 时跳过 visibleRange$/scrollLeftLogical$ 读取，
  // 避免滚动事件触发无十字线状态下的虚假重算
  let _cachedSnapshot: InteractionSnapshot | null = null
  const cachedInteractionSnapshot = computed<InteractionSnapshot>(() => {
    const crosshairPos = readonly.crosshairPos()
    const hoveredIndex = readonly.hoveredIndex()
    const dragMode = readonly.dragMode()
    const hoveredSep = readonly.hoveredSeparatorUpperPaneId()
    const hoveredRight = readonly.hoveredRightAxisPaneId()

    const crosshairIndex = crosshairPos
      ? computeCrosshairIndex(
          crosshairPos,
          readonly.kLinePositions(),
          readonly.kWidthPx(),
          deps.visibleRange$(),
          deps.scrollLeftLogical$(),
          deps.dpr$(),
        )
      : null

    const next: InteractionSnapshot = {
      crosshairPos,
      crosshairIndex,
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
      updateCrosshair(pos: { x: number; y: number } | null, price: number | null) {
        batch(() => {
          signals.crosshairPos.set(pos)
          signals.crosshairPrice.set(price)
        })
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

      updateFramePositions(
        positions: number[] | null,
        centers: number[] | null,
        kWidthPx: number | null,
      ) {
        batch(() => {
          signals.kLinePositions.set(positions)
          signals.kLineCenters.set(centers)
          signals.kWidthPx.set(kWidthPx)
        })
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

      updateTooltip(
        pos: { x: number; y: number },
        placement: 'right-bottom' | 'left-bottom',
      ) {
        batch(() => {
          signals.tooltipPos.set(pos)
          signals.tooltipAnchorPlacement.set(placement)
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
        signals.kLinePositions.set(null)
        signals.kLineCenters.set(null)
        signals.kWidthPx.set(null)
      })
    },
  }
}

export type InteractionStateModule = ReturnType<typeof createInteractionState>
