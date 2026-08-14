// 交互控制中心

import type { ChartSettings } from '../../foundation/config/chartSettings'
import type { KLineData } from '../../foundation/types/price'
import type { Chart } from '../chart'
import { UpdateLevel } from '../layout/pane'
import type { MarkerEntity, CustomMarkerEntity } from '../marker/registry'

import { MarkerInteractionState } from './markerInteraction'
import { PinchTracker } from './pinchTracker'
import { computeTooltipPosition, type TooltipPositionMode } from './tooltipPosition'
import { isOnRightHalf } from '../../foundation/utils/viewportSide'
import type { InteractionStateModule } from '../state/interactionState'

interface PointerLocation {
  mouseX: number
  mouseY: number
}

/** 悬停上下文 — 由 resolveHoverContext 创建，传递给后续所有子步骤 */
interface HoverContext {
  mouseX: number
  mouseY: number
  plotWidth: number
  plotHeight: number
  viewWidth: number
  viewHeight: number
  scrollLeft: number
  dpr: number
  worldX: number
}

/** 最近邻 K 线 bar — 由 findNearestBar 返回 */
interface NearestBar {
  localIdx: number
  globalIdx: number
  kLineStartX: number
  widthLogical: number
}

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

/**
 * 交互控制器，处理拖拽滚动、缩放、十字线 hover 等交互逻辑
 */
export class InteractionController {
  private chart: Chart
  private _state: InteractionStateModule

  // ── Plain fields (kept — internal event processing only, not exposed) ──
  private dragStartX = 0
  private scrollStartX = 0
  private dragStartY = 0
  /** maxScrollLeft at drag start, cached to prevent jumps when scrollWidth grows mid-drag */
  private _cachedMaxScrollLeft = -1
  private activePaneIdOnDrag: string | null = null
  private activeSeparatorUpperPaneId: string | null = null
  private isTouchSession = false
  private exploreMode = true
  private touchStartTime = 0
  private touchStartX = 0
  private touchStartY = 0
  private pinchTracker = new PinchTracker()
  private lastClientPos: { x: number; y: number } | null = null
  /**
   * 空闲 hover 是否有未推导的指针输入。
   * pointermove 只置位；flushPendingHover 每帧最多推导一次并写 kernel。
   */
  private hoverFlushPending = false
  /**
   * 本帧封存的 K 线几何（非 kernel signal，避免每帧广播大数组）。
   * 仅 InteractionController hover 读取；绘制走 ChartRenderer FrameContext。
   */
  private framePositions: number[] | null = null
  private frameCenters: number[] | null = null
  private frameKWidthPx: number | null = null
  /** 与 framePositions 同代的可见区间（已 clamp start>=0，与 calcKLinePositions 一致） */
  private frameVisibleRange: { start: number; end: number } | null = null
  private markerState = new MarkerInteractionState()
  private lastHoverRenderKey = ''
  private useTooltipAnchorPositioning = false
  private tooltipPositionMode: TooltipPositionMode = 'crosshair'
  private tooltipAdaptiveLock: 'top-left' | 'top-right' | null = null
  tooltipSize: { width: number; height: number } = { width: 220, height: 180 }

  private get settings(): ChartSettings {
    return this.chart.kernel.settings.readonly.settings.peek()
  }

  /** 触屏长按判定时间 (ms) */
  private static readonly LONG_PRESS_MS = 400

  // ── Getters delegate to kernel module ──
  get crosshairPos(): { x: number; y: number } | null {
    return this._state.readonly.crosshairPos.peek()
  }
  get crosshairPrice(): number | null {
    return this._state.readonly.crosshairPrice.peek()
  }
  get hoveredIndex(): number | null {
    return this._state.readonly.hoveredIndex.peek()
  }
  get activePaneId(): string | null {
    return this._state.readonly.activePaneId.peek()
  }
  get tooltipPos(): { x: number; y: number } {
    return this._state.readonly.tooltipPos.peek()
  }
  get tooltipAnchorPlacement(): 'right-bottom' | 'left-bottom' {
    return this._state.readonly.tooltipAnchorPlacement.peek()
  }
  get crosshairIndex(): number | null {
    return this._state.readonly.crosshairIndex.peek()
  }

  constructor(chart: Chart, state: InteractionStateModule) {
    this.chart = chart
    this._state = state
    this.setupPinchZoom()
  }

  private setupPinchZoom(): void {
    this.pinchTracker.setOnPinchZoom((delta, centerClientX) => {
      const container = this.chart.getDom().container
      if (!container) return
      const rect = container.getBoundingClientRect()
      const centerX = centerClientX - rect.left
      this.chart.handlePinchZoom(delta, centerX)
    })
  }

  /**
   * 同步 settings 变更带来的交互侧效应（tooltip 模式 / 主图纵轴复位）。
   * 业务 settings 本体在 kernel.settings；此处不再持有 plain 副本。
   */
  onSettingsChanged(prev: ChartSettings, next: ChartSettings): void {
    const nextMode = (next.tooltipPosition as TooltipPositionMode) ?? 'crosshair'
    if (nextMode !== 'adaptive') this.tooltipAdaptiveLock = null
    this.tooltipPositionMode = nextMode
    if (!prev.disableMainPaneVerticalScroll && next.disableMainPaneVerticalScroll) {
      this.chart.resetPriceTransform('main')
    }
  }

  /** @deprecated Use kernel's interactionSnapshot computed directly. */
  getInteractionSnapshot(): InteractionSnapshot {
    return this._state.readonly.interactionSnapshot.peek()
  }

  isPointerDown(): boolean {
    return this._state.readonly.isDragging.peek() || this.pinchTracker.getPointerCount() > 0
  }

  /**
   * @deprecated Interaction state is now auto-derived from the kernel module.
   *             External consumers should subscribe to the interactionSnapshot signal.
   */
  setOnInteractionChange(_callback: (snapshot: InteractionSnapshot) => void): void {
    // no-op
  }

  private getHoverRenderKey(): string {
    const crosshairX = this.crosshairPos
      ? Math.round(this.crosshairPos.x * this.chart.getCurrentDpr())
      : 'n'
    const crosshairY = this.crosshairPos
      ? Math.round(this.crosshairPos.y * this.chart.getCurrentDpr())
      : 'n'
    return [
      this.crosshairIndex ?? 'n',
      this.hoveredIndex ?? 'n',
      this.activePaneId ?? 'n',
      this._state.readonly.hoveredRightAxisPaneId.peek() ?? 'n',
      this._state.readonly.hoveredSeparatorUpperPaneId.peek() ?? 'n',
      this._state.readonly.hoveredMarkerId.peek() ?? 'n',
      this._state.readonly.hoveredCustomMarker.peek()?.id ?? 'n',
      crosshairX,
      crosshairY,
    ].join('|')
  }

  /**
   * [触屏]:处理 Pointer 按下事件
   * @param e PointerEvent
   */
  onPointerDown(e: PointerEvent) {
    this.isTouchSession = e.pointerType === 'touch'
    if (this.pinchTracker.handlePointerDown(e, this.isTouchSession)) {
      this._state.actions.endDrag()
      return
    }

    // 单指操作（需要是主指针且不在捏合中，且不是捏合后的残余手指）
    if (e.isPrimary === false || this.pinchTracker.getIsPinching()) return
    if (this.pinchTracker.getPointerCount() > 1) return

    const location = this.getPlotPointerLocation(e.clientX, e.clientY)
    if (!location) return

    const { mouseX, mouseY } = location
    const scrollLeft = this.chart.kernel.viewport.readonly.scrollLeftLogical.peek()

    const markerManager = this.chart.getMarkerManager()
    const worldX = scrollLeft + mouseX
    const hitMarker = markerManager.hitTest(worldX, mouseY, 3)

    if (hitMarker) {
      this.markerState.handleClick(hitMarker)
      return
    }

    const separatorUpperPaneId = this.hitTestPaneSeparator(mouseY)
    if (separatorUpperPaneId) {
      this._state.actions.startDrag('resize-separator')
      this.dragStartY = e.clientY
      this.activeSeparatorUpperPaneId = separatorUpperPaneId
      this._state.actions.setSeparatorHover(separatorUpperPaneId)
      this.clearHover()
      this.chart.scheduleDraw()
      return
    }

    // 分时模式下禁止拖拽平移
    if (!this.chart.kernel.mode.readonly.interactionCapabilities.peek().allowPan) {
      this.clearHover()
      this.chart.scheduleDraw()
      return
    }

    const pane = this.getPaneByY(mouseY)
    this._state.actions.startDrag('pan')
    this.touchStartTime = Date.now()
    this.touchStartX = e.clientX
    this.touchStartY = e.clientY
    // 触屏始终以 pan 模式开始，长按后才切换为 explore
    this.dragStartX = e.clientX
    this.dragStartY = e.clientY
    this.scrollStartX = this.chart.kernel.viewport.readonly.scrollLeft.peek()
    this._cachedMaxScrollLeft = -1
    const captureContainer = this.chart.getDom().container
    captureContainer?.setPointerCapture(e.pointerId)
    this.activePaneIdOnDrag = pane?.id || null

    this.chart.scheduleDraw()
  }

  /**
   * 设置 tooltip 尺寸
   * @param size 宽高对象
   */
  setTooltipSize(size: { width: number; height: number }) {
    this.tooltipSize = size
  }

  setTooltipAnchorPositioning(enabled: boolean) {
    this.useTooltipAnchorPositioning = enabled
  }

  /**
   * 处理 Pointer 抬起事件
   * @param e PointerEvent
   */
  onPointerUp(e: PointerEvent) {
    this.pinchTracker.handlePointerUp(e)

    if (e.isPrimary === false) return
    const wasPanning = this._state.readonly.dragMode.peek() === 'pan'
    const wasExploring = this._state.readonly.dragMode.peek() === 'explore'

    if (this.isTouchSession) {
      if (wasExploring) {
        // 长按触发了 explore → 保持十字线
        this.exploreMode = true
        this.updatePlotHoverFromPoint(e.clientX, e.clientY)
        this.chart.scheduleDraw()
      } else if (wasPanning) {
        // 有实际滑动 → 下次支持长按
        this.exploreMode = true
      } else {
        // 既未触发 explore 也未滑动
        const elapsed = Date.now() - this.touchStartTime
        const dx = e.clientX - this.touchStartX
        const dy = e.clientY - this.touchStartY
        if (
          elapsed < InteractionController.LONG_PRESS_MS &&
          Math.abs(dx) < 10 &&
          Math.abs(dy) < 10
        ) {
          // 快速点击 → 锁定滚动模式，下次触摸不触发长按
          this.exploreMode = false
          this.clearHover()
          this.chart.scheduleDraw()
        } else {
          this.exploreMode = true
        }
      }
    }

    // 鼠标和触屏拖拽结束后都检查左侧缺口 → 触发增量加载
    if (wasPanning) {
      this.chart.checkVisibleRangeGap()
    }

    this._state.actions.endDrag()
    this.activePaneIdOnDrag = null
    this.activeSeparatorUpperPaneId = null
    this._cachedMaxScrollLeft = -1
  }

  /**
   * 处理 Pointer 离开事件
   * @param e PointerEvent
   */
  onPointerLeave(e: PointerEvent) {
    this.pinchTracker.handlePointerLeave(e)

    if (e.isPrimary === false) return

    this.tooltipAdaptiveLock = null
    this._state.actions.endDrag()
    this.activePaneIdOnDrag = null
    this.clearSeparatorState()
    if (!this.isTouchSession) {
      // 取消已排队 hover，避免后续帧用 lastClientPos 把十字线刷回来
      this.hoverFlushPending = false
      this.lastClientPos = null
      this.clearHover()
      this.chart.scheduleDraw()
    }
    this.isTouchSession = false
  }

  /** 处理滚动事件 */
  onScroll(options: { scheduleDraw?: boolean } = {}) {
    this.framePositions = null
    this.frameCenters = null
    this.frameKWidthPx = null
    this.frameVisibleRange = null
    this.hoverFlushPending = false
    this.clearHover()
    if (options.scheduleDraw !== false) {
      this.chart.scheduleDraw()
    }
  }

  /**
   * 处理 Pointer 移动事件（支持鼠标和触屏）
   * @param e PointerEvent
   */
  onPointerMove(e: PointerEvent) {
    this.lastClientPos = { x: e.clientX, y: e.clientY }

    if (this.pinchTracker.handlePointerMove(e)) return

    if (!e.isPrimary) return

    if (e.pointerType === 'touch') {
      this.isTouchSession = true
    }

    const container = this.chart.getDom().container

    if (this._state.readonly.isDragging.peek()) {
      if (this._state.readonly.dragMode.peek() === 'resize-separator') {
        const deltaY = e.clientY - this.dragStartY
        if (deltaY !== 0 && this.activeSeparatorUpperPaneId) {
          const resized = this.chart.resizePaneBoundary(this.activeSeparatorUpperPaneId, deltaY)
          if (resized) {
            this.dragStartY = e.clientY
          }
        }
        return
      }

      if (this._state.readonly.dragMode.peek() === 'scale-price') {
        const deltaY = e.clientY - this.dragStartY
        if (deltaY !== 0 && this.activePaneIdOnDrag) {
          this.chart.scalePrice(this.activePaneIdOnDrag, deltaY)
          this.dragStartY = e.clientY
        }
        return
      }

      // 触屏：长按达到阈值后从 pan 切换到 explore
      if (this.isTouchSession && this._state.readonly.dragMode.peek() === 'pan' && this.exploreMode) {
        const elapsed = Date.now() - this.touchStartTime
        const dx = Math.abs(e.clientX - this.touchStartX)
        const dy = Math.abs(e.clientY - this.touchStartY)
        if (elapsed >= InteractionController.LONG_PRESS_MS && dx < 10 && dy < 10) {
          this._state.actions.setDragMode('explore')
          this.queueHoverFlush()
          return
        }
      }

      if (this._state.readonly.dragMode.peek() === 'explore') {
        // explore 跟手：仍走 pending，由本帧 flush 推导（与空闲 hover 同路径）
        this.queueHoverFlush()
        return
      }

      if (this._state.readonly.dragMode.peek() === 'pan') {
        const container = this.chart.getDom().container
        const deltaX = this.dragStartX - e.clientX
        if (this._cachedMaxScrollLeft < 0) {
          this._cachedMaxScrollLeft = Math.max(0, (container?.scrollWidth ?? 0) - (container?.clientWidth ?? 0))
        }
        const clamped = Math.min(Math.max(0, this.scrollStartX + deltaX), this._cachedMaxScrollLeft)
        const dpr = this.chart.getCurrentDpr()
        this.chart.kernel.viewport.actions.scrollTo(Math.round(clamped * dpr) / dpr)

        const deltaY = e.clientY - this.dragStartY
        this.dragStartY = e.clientY
        if (deltaY !== 0 && this.activePaneIdOnDrag === 'main') {
          if (!this.settings.disableMainPaneVerticalScroll) {
            this.chart.translatePrice(this.activePaneIdOnDrag, deltaY)
          }
        }
      }
      return
    }

    // 空闲 hover：只记录指针，不写 crosshair/tooltip Signal
    this.queueHoverFlush()
  }

  /**
   * 标记有待推导的 hover 输入，并申请 Overlay 帧。
   * 真正的 updatePlotHoverFromPoint 在 flushPendingHover 中执行。
   */
  private queueHoverFlush(): void {
    this.hoverFlushPending = true
    this.chart.scheduleDraw(UpdateLevel.Overlay)
  }

  /**
   * 将 pending 指针推导为 crosshair/hover/tooltip 并写入 kernel。
   * ChartRenderer 在 seal 几何之后、paint 之前调用，保证与本帧几何同代。
   * 无 pending 时为 no-op。
   */
  flushPendingHover(): void {
    if (!this.hoverFlushPending) return
    this.hoverFlushPending = false
    if (!this.lastClientPos) return

    this.updatePlotHoverFromPoint(this.lastClientPos.x, this.lastClientPos.y)
    const hoverRenderKey = this.getHoverRenderKey()
    if (hoverRenderKey !== this.lastHoverRenderKey) {
      this.lastHoverRenderKey = hoverRenderKey
    }
  }

  /**
   * 封存本帧 K 线几何到 controller 私有字段（非 kernel signal）。
   * ChartRenderer 在 paint 前调用；引用未变则跳过 hover 重算。
   *
   * @param positions K 线起始 x 坐标数组
   * @param visibleRange 与 positions 同代的可见区间（start 已 clamp 到 >=0）
   * @param kWidthPx K 线宽度（物理像素）
   * @param centers K 线中心 x 坐标数组
   */
  setKLinePositions(
    positions: number[] | null,
    visibleRange: { start: number; end: number } | null,
    kWidthPx?: number,
    centers?: number[] | null,
  ) {
    const nextWidth = kWidthPx ?? null
    const nextCenters = centers ?? null
    const nextRange = visibleRange
    const unchanged =
      this.framePositions === positions &&
      this.frameCenters === nextCenters &&
      this.frameKWidthPx === nextWidth &&
      this.frameVisibleRange?.start === nextRange?.start &&
      this.frameVisibleRange?.end === nextRange?.end

    this.framePositions = positions
    this.frameCenters = nextCenters
    this.frameKWidthPx = nextWidth
    this.frameVisibleRange = nextRange

    // 几何变化时标记 hover 待刷新；由 flushPendingHover 与 paint 同帧完成
    if (!unchanged && this.lastClientPos && !this._state.readonly.isDragging.peek()) {
      this.hoverFlushPending = true
      this.flushPendingHover()
    }
  }

  onRightAxisPointerDown(e: PointerEvent) {
    if (e.isPrimary === false) return
    this.isTouchSession = e.pointerType === 'touch'
    const location = this.getRightAxisPointerLocation(e.clientX, e.clientY)
    if (!location) return
    if (this.beginScalePriceDrag(e.clientY, location.mouseY)) {
      this.chart.scheduleDraw()
    }
  }

  onRightAxisPointerMove(e: PointerEvent) {
    if (!e.isPrimary) return
    if (e.pointerType === 'touch') {
      this.isTouchSession = true
    }

    if (this._state.readonly.isDragging.peek() && this._state.readonly.dragMode.peek() === 'scale-price') {
      const deltaY = e.clientY - this.dragStartY
      if (deltaY !== 0 && this.activePaneIdOnDrag) {
        this.chart.scalePrice(this.activePaneIdOnDrag, deltaY)
        this.dragStartY = e.clientY
      }
      return
    }

    this.updateRightAxisHoverFromPoint(e.clientX, e.clientY)
    const hoverRenderKey = this.getHoverRenderKey()
    if (hoverRenderKey !== this.lastHoverRenderKey) {
      this.lastHoverRenderKey = hoverRenderKey
      this.chart.scheduleDraw(UpdateLevel.Overlay)
    }
  }

  onRightAxisPointerUp(e: PointerEvent) {
    this.onPointerUp(e)
  }

  onRightAxisPointerLeave(e: PointerEvent) {
    if (e.isPrimary === false) return
    if (this._state.readonly.isDragging.peek() && this._state.readonly.dragMode.peek() === 'scale-price') return
    this._state.actions.setRightAxisHover(null)
  }

  /** 检查是否正在拖拽 */
  isDraggingState(): boolean {
    return this._state.readonly.isDragging.peek()
  }

  setOnMarkerHover(callback: (marker: MarkerEntity | null) => void) {
    this.markerState.setOnMarkerHover(callback)
  }

  setOnMarkerClick(callback: (marker: MarkerEntity) => void) {
    this.markerState.setOnMarkerClick(callback)
  }

  setOnCustomMarkerHover(callback: (marker: CustomMarkerEntity | null) => void) {
    this.markerState.setOnCustomMarkerHover(callback)
  }

  setOnCustomMarkerClick(callback: (marker: CustomMarkerEntity) => void) {
    this.markerState.setOnCustomMarkerClick(callback)
  }

  /** 命中可拖拽分隔线（返回上方 paneId） */
  private hitTestPaneSeparator(mouseY: number): string | null {
    const paneRenderers = this.chart.getPaneRenderers()
    if (paneRenderers.length < 2) return null

    const SEP_HIT_HALF = 5
    for (let i = 0; i < paneRenderers.length - 1; i++) {
      const upper = paneRenderers[i]?.getPane()
      const lower = paneRenderers[i + 1]?.getPane()
      if (!upper || !lower) continue
      const boundaryY = upper.top + upper.height
      if (Math.abs(mouseY - boundaryY) <= SEP_HIT_HALF) {
        return upper.id
      }
    }
    return null
  }

  private getPaneByY(mouseY: number) {
    const paneRenderers = this.chart.getPaneRenderers()
    const renderer = paneRenderers.find((r) => {
      const pane = r.getPane()
      return mouseY >= pane.top && mouseY <= pane.top + pane.height
    })
    return renderer?.getPane() || null
  }

  private getPlotPointerLocation(clientX: number, clientY: number): PointerLocation | null {
    const container = this.chart.getDom().container
    const rect = container.getBoundingClientRect()
    const mouseX = clientX - rect.left
    const mouseY = clientY - rect.top
    return { mouseX, mouseY }
  }

  private getRightAxisPointerLocation(clientX: number, clientY: number): PointerLocation {
    const rightAxisLayer = this.chart.getDom().rightAxisLayer
    const rect = rightAxisLayer.getBoundingClientRect()
    const mouseX = clientX - rect.left
    const mouseY = clientY - rect.top
    return { mouseX, mouseY }
  }

  private beginScalePriceDrag(clientY: number, mouseY: number) {
    const pane = this.getPaneByY(mouseY)
    if (!pane) return false
    if (pane.id === 'main' && this.settings.disableMainPaneVerticalScroll) {
      return false
    }
    this._state.actions.startDrag('scale-price')
    this.dragStartY = clientY
    this.activePaneIdOnDrag = pane.id
    this._state.actions.setRightAxisHover(pane.id)
    this._state.actions.setSeparatorHover(null)
    this._state.actions.updateCrosshair(null, null, null)
    this._state.actions.updateHover(null, pane.id)
    return true
  }

  clearHover() {
    this.hoverFlushPending = false
    this.lastHoverRenderKey = ''
    this._state.actions.setRightAxisHover(null)
    this._state.actions.updateCrosshair(null, null, null)
    this._state.actions.updateHover(null, null)
    this._state.actions.updateMarkerHover(null, null, null)
    this.markerState.clearAll(this.chart.getMarkerManager())
  }

  private clearSeparatorState() {
    this.activeSeparatorUpperPaneId = null
    this._state.actions.setSeparatorHover(null)
    this._state.actions.setRightAxisHover(null)
  }

  /**
   * 从屏幕坐标更新 hover 状态
   * @param clientX 屏幕 x 坐标
   * @param clientY 屏幕 y 坐标
   */

  private updateRightAxisHoverFromPoint(clientX: number, clientY: number) {
    const location = this.getRightAxisPointerLocation(clientX, clientY)
    if (!location) return

    const { mouseY } = location
    const viewport = this.chart.getViewport()
    const plotHeight =
      viewport?.plotHeight ?? Math.max(1, Math.round(this.chart.getDom().container.clientHeight))
    if (mouseY < 0 || mouseY > plotHeight) {
      this._state.actions.setRightAxisHover(null)
      return
    }

    const pane = this.getPaneByY(mouseY)
    this._state.actions.setRightAxisHover(pane?.id || null)
    this._state.actions.setSeparatorHover(null)
    this._state.actions.updateCrosshair(null, null, null)
    this._state.actions.updateHover(null, pane?.id || null)
  }

  /**
   * 指针悬停检测（coordinator）
   *
   * 每次指针移动时触发，按优先级依次检测：
   * 边界 → pane 分隔器 → marker → K 线 bar → 十字线定位 → candle 命中 → tooltip。
   * 每个步骤都可能提前 return，无需执行后续检测。
   */
  /** @internal 公开给外部在合适的时机触发十字线重算（如 setKLinePositions 之后） */
  updatePlotHoverFromPoint(clientX: number, clientY: number) {
    const ctx = this.resolveHoverContext(clientX, clientY)
    if (!ctx) return

    if (this.handleSeparatorHit(ctx)) return
    if (this.handleMarkerHit(ctx)) return

    const bar = this.findNearestBar(ctx)
    if (!bar) {
      this.clearHover()
      return
    }

    this.positionCrosshair(ctx, bar)

    if (this.chart.currentPeriod === 'timeshare') {
      this.handleTimeshareHover(ctx, bar)
      return
    }

if (this.tooltipPositionMode === 'adaptive') {
      this._state.actions.setHoveredIndex(bar.globalIdx)
      this.updateTooltip(ctx)
      return
    }

    if (!this.hitTestCandle(ctx, bar)) {
      this._state.actions.setHoveredIndex(null)
      return
    }

    this._state.actions.setHoveredIndex(bar.globalIdx)
    this.updateTooltip(ctx)
  }

  /**
   * 解析悬停上下文
   *
   * 将 client 坐标转换为 plot 坐标，并做边界检查。
   * 返回 null 表示指针不在 plot 区域内。
   */
  private resolveHoverContext(clientX: number, clientY: number): HoverContext | null {
    const location = this.getPlotPointerLocation(clientX, clientY)
    if (!location) return null

    const { mouseX, mouseY } = location
    const container = this.chart.getDom().container
    const viewport = this.chart.getViewport()
    const viewWidth = viewport?.viewWidth ?? Math.max(1, Math.round(container.clientWidth))
    const viewHeight = viewport?.viewHeight ?? Math.max(1, Math.round(container.clientHeight))
    const plotWidth = viewport?.plotWidth ?? viewWidth
    const plotHeight = viewport?.plotHeight ?? viewHeight

    if (mouseX < 0 || mouseY < 0 || mouseX > plotWidth || mouseY > plotHeight) {
      this.clearHover()
      return null
    }

    const scrollLeft = this.chart.kernel.viewport.readonly.scrollLeftLogical.peek()
    const dpr = this.chart.getCurrentDpr()

    return {
      mouseX,
      mouseY,
      plotWidth,
      plotHeight,
      viewWidth,
      viewHeight,
      scrollLeft,
      dpr,
      worldX: scrollLeft + mouseX,
    }
  }

  /**
   * 检测 pane 分隔器悬停
   *
   * 若指针悬浮在 pane 分隔条上，清除十字线状态并返回 true。
   */
  private handleSeparatorHit(ctx: HoverContext): boolean {
    this._state.actions.setRightAxisHover(null)
    const separatorUpperPaneId = this.hitTestPaneSeparator(ctx.mouseY)
    this._state.actions.setSeparatorHover(separatorUpperPaneId)
    if (separatorUpperPaneId) {
      this._state.actions.updateCrosshair(null, null, null)
      this._state.actions.updateHover(null, null)
      return true
    }
    return false
  }

  /**
   * 检测 marker 悬停
   *
   * 若指针悬浮在 marker 上，清除十字线状态并返回 true。
   */
  private handleMarkerHit(ctx: HoverContext): boolean {
    const markerManager = this.chart.getMarkerManager()
    const result = this.markerState.updateHoverFromPoint(ctx.worldX, ctx.mouseX, ctx.mouseY, markerManager)
    this._state.actions.updateMarkerHover(result.hitMarkerId, result.hitMarkerData, result.hitCustomMarker)
    if (result.hit) {
      this._state.actions.updateCrosshair(null, null, null)
      this._state.actions.setHoveredIndex(null)
      return true
    }
    return false
  }

  /**
   * 查找最近邻 K 线 bar
   *
   * 使用二分搜索在 kLinePositions 中定位指针最近的 K 线 bar。
   * 若无 kLinePositions、visibleRange 或 kWidthPx，返回 null。
   */
  private findNearestBar(ctx: HoverContext): NearestBar | null {
    const kLinePositions = this.framePositions
    const kWidthPx = this.frameKWidthPx
    // 与 framePositions 同代的 seal range（viewport 已 clamp，此处仍用 seal 保证同帧一致）
    const visibleRange = this.frameVisibleRange
    if (!kLinePositions || !visibleRange || !kWidthPx) return null

    const { worldX, dpr, scrollLeft, plotWidth } = ctx
    const kWidthLogical = kWidthPx / dpr
    const positions = kLinePositions

    let lo = 0,
      hi = positions.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (positions[mid]! < worldX) {
        lo = mid + 1
      } else {
        hi = mid
      }
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

    // 跳过中心不在可视视口内的 K 线（边缘裁剪），取相邻可见 K 线
    const barCenter = positions[localIdx]! + kWidthLogical / 2
    if (barCenter < scrollLeft) {
      if (localIdx + 1 < positions.length) {
        localIdx += 1
      } else {
        return null
      }
    } else if (barCenter > scrollLeft + plotWidth) {
      if (localIdx > 0) {
        localIdx -= 1
      } else {
        return null
      }
    }

    return {
      localIdx,
      globalIdx: localIdx + visibleRange.start,
      kLineStartX: positions[localIdx]!,
      widthLogical: kWidthLogical,
    }
  }

  /**
   * 定位十字线
   *
   * 根据最近邻 bar 设置 crosshairIndex、crosshairPos（snap 到 K 线中心）
   * 以及 crosshairPrice（鼠标 Y → 价格）。
   * 索引无效时清除十字线状态。
   */
  private positionCrosshair(ctx: HoverContext, bar: NearestBar): void {
    const { mouseY, scrollLeft, plotWidth, plotHeight } = ctx
    const pane = this.getPaneByY(mouseY)
    this._state.actions.setActivePaneId(pane?.id || null)

    if (bar.globalIdx < 0 || bar.globalIdx >= this.chart.getInternalData().length) {
      this._state.actions.updateCrosshair(null, null, null)
      return
    }

    const kLineCenters = this.frameCenters
    const centerX = kLineCenters?.[bar.localIdx] ?? bar.kLineStartX + bar.widthLogical / 2
    const snappedX = centerX - scrollLeft

    const price = pane ? pane.yAxis.yToPrice(mouseY - pane.top) : null
    this._state.actions.updateCrosshair(
      {
        x: Math.min(Math.max(snappedX, 0), plotWidth),
        y: Math.min(Math.max(mouseY, 0), plotHeight),
      },
      price,
      bar.globalIdx,
    )
  }

  /**
   * 分时模式悬停处理
   *
   * 分时模式下直接设置 hoveredIndex 并计算 tooltip 位置后返回，
   * 不执行 candle body/wick 命中检测。
   */
  private handleTimeshareHover(ctx: HoverContext, bar: NearestBar): void {
    this._state.actions.setHoveredIndex(bar.globalIdx)
    this.updateTooltip(ctx)
  }

  /**
   * Candle 实体/影线命中检测
   *
   * 检测指针是否落在 K 线实体内或影线上。
   * 小实体（< 20px）和短影线（< 8px）会扩展命中区域以保证涨停/跌停等极端行情的可用性。
   * 未命中时返回 false。
   */
  private hitTestCandle(ctx: HoverContext, bar: NearestBar): boolean {
    const { mouseY, worldX, dpr } = ctx
    const data = this.chart.getInternalData()
    const k =
      typeof this.crosshairIndex === 'number'
        ? (data?.[this.crosshairIndex] as KLineData | undefined)
        : undefined
    const pane = this.getPaneByY(mouseY)

    if (!k || !pane || !pane.capabilities.candleHitTest) return false

    const localY = mouseY - pane.top
    const openY = pane.yAxis.priceToY(k.open)
    const closeY = pane.yAxis.priceToY(k.close)
    const highY = pane.yAxis.priceToY(k.high)
    const lowY = pane.yAxis.priceToY(k.low)
    const bodyTop = Math.min(openY, closeY)
    const bodyBottom = Math.max(openY, closeY)

    const inUnitX = worldX - bar.kLineStartX
    const cxLogical = bar.widthLogical / 2

    const MIN_BODY_HIT_HEIGHT = 100
    const bodyHeight = Math.abs(bodyBottom - bodyTop)
    const effectiveBodyTop =
      bodyHeight < MIN_BODY_HIT_HEIGHT
        ? (bodyTop + bodyBottom) / 2 - MIN_BODY_HIT_HEIGHT / 2
        : bodyTop
    const effectiveBodyBottom =
      bodyHeight < MIN_BODY_HIT_HEIGHT
        ? (bodyTop + bodyBottom) / 2 + MIN_BODY_HIT_HEIGHT / 2
        : bodyBottom

    const MIN_WICK_HIT_HEIGHT = 8
    const wickHeight = Math.abs(highY - lowY)
    const effectiveWickTop =
      wickHeight < MIN_WICK_HIT_HEIGHT
        ? (highY + lowY) / 2 - MIN_WICK_HIT_HEIGHT / 2
        : Math.min(highY, lowY)
    const effectiveWickBottom =
      wickHeight < MIN_WICK_HIT_HEIGHT
        ? (highY + lowY) / 2 + MIN_WICK_HIT_HEIGHT / 2
        : Math.max(highY, lowY)

    const HIT_WICK_HALF_EXTENDED = 3

    const hitBody =
      localY >= effectiveBodyTop &&
      localY <= effectiveBodyBottom &&
      inUnitX >= 0 &&
      inUnitX <= bar.widthLogical
    const hitWick =
      Math.abs(inUnitX - cxLogical) <= HIT_WICK_HALF_EXTENDED &&
      localY >= effectiveWickTop &&
      localY <= effectiveWickBottom

    return hitBody || hitWick
  }

  /**
   * 更新 tooltip 位置
   *
   * 使用 computeTooltipPosition 计算 tooltip 的显示位置和锚点方向。
   */
  private updateTooltip(ctx: HoverContext): void {
    const { mouseX, mouseY, viewWidth, viewHeight, plotWidth, plotHeight } = ctx

    if (this.tooltipPositionMode === 'adaptive' && this.tooltipAdaptiveLock === null) {
      this.tooltipAdaptiveLock = isOnRightHalf(mouseX, viewWidth) ? 'top-left' : 'top-right'
    }

    const tooltipResult = computeTooltipPosition({
      mouseX,
      mouseY,
      viewWidth,
      viewHeight,
      plotWidth,
      plotHeight,
      tooltipSize: this.tooltipSize,
      useAnchorPositioning: this.useTooltipAnchorPositioning,
      mode: this.tooltipPositionMode,
      adaptiveCorner: this.tooltipAdaptiveLock ?? undefined,
    })
    this._state.actions.updateTooltip(tooltipResult.pos, tooltipResult.anchorPlacement ?? 'right-bottom')
  }

  /**
   * 重置所有交互状态（数据更新时调用）
   */
  reset(): void {
    this._state.actions.endDrag()
    this.dragStartX = 0
    this.dragStartY = 0
    this.scrollStartX = 0
    this.activePaneIdOnDrag = null
    this.clearSeparatorState()
    this.isTouchSession = false
    this.pinchTracker.reset()
    this._state.actions.updateCrosshair(null, null, null)
    this._state.actions.updateHover(null, null)
    this.markerState.reset()
    this.framePositions = null
    this.frameCenters = null
    this.frameKWidthPx = null
    this.frameVisibleRange = null
    this.lastHoverRenderKey = ''
  }

  /** 获取十字线指向的 K 线索引 */
  getCrosshairIndex(): number | null {
    return this.crosshairIndex
  }
}
