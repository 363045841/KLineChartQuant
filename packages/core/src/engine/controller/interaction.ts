// 交互控制中心

import type { ChartSettings } from '../../foundation/config/chartSettings.js'
import { PRICE_AXIS_RANGE_MODE } from '../../foundation/config/priceAxisRangeMode.js'
import { pointInRect, rectFromPoints } from '../../foundation/geometry/index.js'
import { batch } from '../../foundation/reactivity/signal.js'
import { isTimeShareDataView } from '../../foundation/types/chartView.js'
import type { KLineData } from '../../foundation/types/price.js'
import { isOnRightHalf } from '../../foundation/utils/viewportSide.js'
import type { Chart } from '../chart.js'
import { UpdateLevel } from '../layout/pane.js'
import type { CustomMarkerEntity, MarkerEntity } from '../marker/registry.js'
import type { ScaleXSnapshot } from '../scale/index.js'
import type { InteractionSnapshot, InteractionStateModule } from '../state/interactionState.js'
import { MarkerInteractionState } from './markerInteraction.js'
import { PinchTracker } from './pinchTracker.js'
import { computeTooltipPosition, type TooltipPositionMode } from './tooltipPosition.js'

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

export type { InteractionSnapshot }

/**
 * 交互控制器，处理拖拽滚动、缩放、十字线 hover 等交互逻辑
 */
export class InteractionController {
  private chart: Chart
  private _state: InteractionStateModule

  // ── Plain fields (kept — internal event processing only, not exposed) ──
  private dragStartX = 0
  private scrollStartX = 0
  private panSamples: Array<{ scroll: number; time: number }> = []
  private inertiaFrame: number | null = null
  private dragStartY = 0
  /** maxScrollLeft at drag start, cached to prevent jumps when scrollWidth grows mid-drag */
  private _cachedMaxScrollLeft = -1
  private activePaneIdOnDrag: string | null = null
  private activeSeparatorUpperPaneId: string | null = null
  /** 当前由本控制器拥有的拖拽指针。手势结束不能依赖元素边界事件。 */
  private activePointerId: number | null = null
  private pointerCaptureElement: HTMLElement | null = null
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
  private frameView: ScaleXSnapshot | null = null
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
    if (prev.mainPriceAxisRangeMode !== next.mainPriceAxisRangeMode) {
      this.chart.setMainPriceAxisRangeMode(
        next.mainPriceAxisRangeMode ?? PRICE_AXIS_RANGE_MODE.AUTO,
      )
    }
  }

  /** @deprecated Use kernel's interactionSnapshot computed directly. */
  getInteractionSnapshot(): InteractionSnapshot {
    return this._state.readonly.interactionSnapshot.peek()
  }

  isPointerDown(): boolean {
    return (
      this._state.readonly.isDragging.peek() ||
      this.pinchTracker.getPointerCount() > 0 ||
      this.inertiaFrame !== null
    )
  }

  /** 新输入、视图重置及销毁时立即取消惯性。 */
  stopInertia(): void {
    if (this.inertiaFrame !== null) cancelAnimationFrame(this.inertiaFrame)
    this.inertiaFrame = null
    this.panSamples = []
  }

  private samplePan(time: number): void {
    this.panSamples.push({
      scroll: this.chart.kernel.viewport.readonly.scrollLeftLogical.peek(),
      time,
    })
    while (this.panSamples.length > 2 && this.panSamples[1]!.time <= time - 100) {
      this.panSamples.shift()
    }
  }

  private startInertia(releaseTime: number): boolean {
    const first = this.panSamples[0]
    const last = this.panSamples.at(-1)
    if (!first || !last || releaseTime - last.time >= 100) return false
    const elapsed = releaseTime - first.time
    if (elapsed <= 0) return false
    let velocity = Math.max(-3, Math.min(3, (last.scroll - first.scroll) / elapsed))
    if (Math.abs(velocity) < 0.15) return false

    const initialView = this.chart.kernel.viewport.readonly.viewSnapshot.peek()
    if (!initialView.capabilities.allowPan) return false
    let position = initialView.scroll
    let expectedScroll = initialView.scroll
    let lastTime = performance.now()
    const finish = () => {
      this.stopInertia()
      if (!this.isTouchSession && this.lastClientPos) this.queueHoverFlush()
      this.chart.checkVisibleRangeGapWhenIdle()
    }
    const advance = (time: number) => {
      const view = this.chart.kernel.viewport.readonly.viewSnapshot.peek()
      // 切换视图、缩放或外部导航后不再使用旧的运动轨迹。
      if (
        !view.capabilities.allowPan ||
        view.view !== initialView.view ||
        view.grid.step !== initialView.grid.step ||
        view.scroll !== expectedScroll
      ) {
        finish()
        return
      }
      const dt = Math.max(0, time - lastTime)
      lastTime = time
      const decay = Math.exp(-dt / 240)
      position += velocity * 240 * (1 - decay)
      velocity *= decay
      const { min, max } = view.scrollBounds
      const bounded = Math.max(min, Math.min(max, position))
      const dpr = this.chart.getCurrentDpr()
      const aligned = Math.max(min, Math.min(max, Math.round(bounded * dpr) / dpr))
      if (this.chart.kernel.viewport.actions.scrollToLogical(aligned)) {
        this.clearHover(true)
        this.chart.scheduleDraw()
      }
      expectedScroll = this.chart.kernel.viewport.readonly.scrollLeftLogical.peek()
      if (bounded !== position || Math.abs(velocity) < 0.02) {
        finish()
        return
      }
      this.inertiaFrame = requestAnimationFrame(advance)
    }
    this.clearHover(true)
    this.inertiaFrame = requestAnimationFrame(advance)
    return true
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
    this.stopInertia()
    this.isTouchSession = e.pointerType === 'touch'
    if (this.pinchTracker.handlePointerDown(e, this.isTouchSession)) {
      // 保留首指的 capture；第二指也需 capture，离开容器后仍能收到最后的 pointerup。
      this.endDragSession(false)
      try {
        this.chart.getDom().container?.setPointerCapture(e.pointerId)
      } catch {
        // 不支持 capture 的宿主继续依赖 pointerup / pointercancel。
      }
      return
    }

    // 单指操作（需要是主指针且不在捏合中，且不是捏合后的残余手指）
    if (e.isPrimary === false || this.pinchTracker.getIsPinching()) return
    if (this.pinchTracker.getPointerCount() > 1) return

    const location = this.getPlotPointerLocation(e.clientX, e.clientY)
    if (!location) return

    const { mouseX, mouseY } = location
    const scrollLeft = this.chart.kernel.viewport.readonly.scrollLeftLogical.peek()

    const markerManager = this.chart.markers.getManager()
    const worldX = scrollLeft + mouseX
    const hitMarker = markerManager.hitTest(worldX, mouseY, 3)

    if (hitMarker) {
      this.markerState.handleClick(hitMarker)
      return
    }

    const separatorUpperPaneId = this.hitTestPaneSeparator(mouseY)
    if (separatorUpperPaneId) {
      this._state.actions.startDrag('resize-separator')
      this.capturePointer(e, this.chart.getDom().container)
      this.dragStartY = e.clientY
      this.activeSeparatorUpperPaneId = separatorUpperPaneId
      this._state.actions.setSeparatorHover(separatorUpperPaneId)
      this.clearHover(true)
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
    this.samplePan(e.timeStamp ?? performance.now())
    this._cachedMaxScrollLeft = -1
    this.capturePointer(e, this.chart.getDom().container)
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
    if (e.isPrimary === false || !this.isActivePointer(e)) return
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

    const inertiaStarted = wasPanning && this.startInertia(e.timeStamp ?? performance.now())
    this.endDragSession()
    // 鼠标平移结束后按当前指针位置恢复 hover；触屏由 explore 模式单独控制。
    if (wasPanning && !this.isTouchSession && !inertiaStarted) {
      this.queueHoverFlush()
    }
  }

  /**
   * 处理 Pointer 离开事件
   * @param e PointerEvent
   */
  onPointerLeave(e: PointerEvent) {
    if (e.isPrimary === false) return

    // 容器尺寸或相邻轴宽度变化也可能触发 pointerleave。拖拽会话由
    // pointerup / pointercancel / lostpointercapture 终止，不能由边界事件终止。
    if (this._state.readonly.isDragging.peek()) return

    this.tooltipAdaptiveLock = null
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

  /** 浏览器取消指针流（例如系统手势接管）时，明确终止当前拖拽。 */
  onPointerCancel(e: PointerEvent) {
    this.pinchTracker.handlePointerUp(e)
    if (e.isPrimary === false || !this.isActivePointer(e)) return
    this.stopInertia()
    this.endDragSession()
    this.clearHover()
    this.chart.scheduleDraw()
    this.isTouchSession = false
  }

  /** capture 被浏览器或宿主释放时，不能再继续依据后续 move 推导拖拽。 */
  onLostPointerCapture(e: PointerEvent) {
    // 正常松手主动释放 capture 不应取消刚启动的惯性。
    if (this.activePointerId === null) return
    if (!this.isActivePointer(e)) return
    this.stopInertia()
    this.endDragSession(false)
    this.clearHover()
    this.chart.scheduleDraw()
    this.isTouchSession = false
  }

  /** 处理滚动事件 */
  onScroll(options: { scheduleDraw?: boolean } = {}) {
    this.frameView = null
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

    if (this._state.readonly.isDragging.peek()) {
      if (this._state.readonly.dragMode.peek() === 'resize-separator') {
        const deltaY = e.clientY - this.dragStartY
        if (deltaY !== 0 && this.activeSeparatorUpperPaneId) {
          const resized = this.chart.panes.resizeBoundary(this.activeSeparatorUpperPaneId, deltaY)
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
      if (
        this.isTouchSession &&
        this._state.readonly.dragMode.peek() === 'pan' &&
        this.exploreMode
      ) {
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
        const deltaX = this.dragStartX - e.clientX
        if (this._cachedMaxScrollLeft < 0) {
          this._cachedMaxScrollLeft = this.chart.kernel.viewport.readonly.maxScrollLeft.peek()
        }
        const clamped = Math.min(Math.max(0, this.scrollStartX + deltaX), this._cachedMaxScrollLeft)
        const dpr = this.chart.getCurrentDpr()
        if (this.chart.kernel.viewport.actions.scrollTo(Math.round(clamped * dpr) / dpr)) {
          // 平移期间隐藏十字线、tooltip 与 marker hover，但保留取值索引，Legend 数值不随视口变化。
          this.clearHover(true)
          // 程序化滚动不再依赖原生 scroll 回调驱动重绘；统一交给 ChartRenderer 帧事务。
          this.chart.scheduleDraw()
        }
        this.samplePan(e.timeStamp ?? performance.now())

        const deltaY = e.clientY - this.dragStartY
        this.dragStartY = e.clientY
        if (deltaY !== 0 && this.activePaneIdOnDrag) {
          if (
            this.chart.kernel.mainPriceAxis.readonly.paneRanges.peek()[this.activePaneIdOnDrag]
              ?.rangeMode === PRICE_AXIS_RANGE_MODE.HAND
          ) {
            // 手动范围允许平移当前 Pane，其他 Pane 的纵轴不受影响；隐藏十字线但保留取值索引。
            this.clearHover(true)
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
   * 标记指针派生态待重算，供 Chart 在帧几何变化（如容器尺寸变化）后调用。
   * 由下一个 flushPendingHover 用缓存的指针位置重算，避免光标陈旧到下一次指针移动。
   */
  invalidateHover(): void {
    if (!this.lastClientPos || this._state.readonly.isDragging.peek()) return
    this.hoverFlushPending = true
  }

  /**
   * 将 pending 指针推导为 crosshair/hover/tooltip 与绘图悬停目标并写入 kernel。
   * ChartRenderer 在 seal 几何之后、paint 之前调用，保证与本帧几何同代。
   * 无 pending 时为 no-op。
   */
  flushPendingHover(): void {
    if (this.inertiaFrame !== null) return
    if (!this.hoverFlushPending) return
    this.hoverFlushPending = false
    if (!this.lastClientPos) return

    const { x, y } = this.lastClientPos
    // 指针派生态一次通知：先算绘图悬停目标，再算 plot hover（后者可能清空悬停，连带清掉绘图悬停）
    batch(() => {
      this.chart.updateDrawingHover(x, y)
      this.updatePlotHoverFromPoint(x, y)
    })
    const hoverRenderKey = this.getHoverRenderKey()
    if (hoverRenderKey !== this.lastHoverRenderKey) {
      this.lastHoverRenderKey = hoverRenderKey
    }
  }

  /** 帧事务在跳帧前检查是否需要推导指针位置。 */
  hasPendingHover(): boolean {
    return this.hoverFlushPending
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
  setViewSnapshot(snapshot: ScaleXSnapshot) {
    const unchanged = this.frameView === snapshot
    this.frameView = snapshot

    // 几何变化时标记 hover 待刷新；由 flushPendingHover 与 paint 同帧完成
    if (!unchanged && this.lastClientPos && !this.isPointerDown()) {
      this.hoverFlushPending = true
      this.flushPendingHover()
    }
  }

  /** K 线按无界槽位投影，分时按封存的交易中心投影。 */
  getScreenXAtLogicalIndex(index: number): number | null {
    if (!Number.isInteger(index)) return null
    const view = this.chart.kernel.viewport.readonly.viewSnapshot.peek()
    const world = view.worldAtIndex(index)
    return world === null ? null : world - view.scroll
  }

  /** K 线直接求解指针槽位，分时按交易数据中心查找索引。 */
  getLogicalIndexAtScreenX(screenX: number): number | null {
    const view = this.chart.kernel.viewport.readonly.viewSnapshot.peek()
    return view.indexAtWorld(screenX + view.scroll)
  }

  /** 将价格轴滚轮增量归一到像素，以鼠标所在 pane 价位为锚点缩放。 */
  onRightAxisWheel(e: WheelEvent): void {
    if (this.isPointerDown() || !Number.isFinite(e.deltaY) || e.deltaY === 0) return
    const { mouseY } = this.getRightAxisPointerLocation(e.clientX, e.clientY)
    const pane = this.getPaneByY(mouseY)
    if (!pane?.capabilities.supportsPriceTranslate) return
    const pixelsPerLine = 16
    const maxWheelPixels = 100
    const wheelSensitivity = 0.1
    const unit = e.deltaMode === 1 ? pixelsPerLine : e.deltaMode === 2 ? pane.height : 1
    const delta = Math.max(-maxWheelPixels, Math.min(maxWheelPixels, e.deltaY * unit))
    e.preventDefault()
    this.chart.scalePrice(pane.id, delta * wheelSensitivity, mouseY - pane.top)
  }

  onRightAxisPointerDown(e: PointerEvent) {
    if (e.isPrimary === false) return
    this.isTouchSession = e.pointerType === 'touch'
    const location = this.getRightAxisPointerLocation(e.clientX, e.clientY)
    if (!location) return
    if (this.beginScalePriceDrag(e.clientY, location.mouseY)) {
      this.capturePointer(e, this.chart.getDom().rightAxisLayer)
      this.chart.scheduleDraw()
    }
  }

  onRightAxisPointerMove(e: PointerEvent) {
    if (!e.isPrimary) return
    // 右轴不在绘图区内：指针位置不参与 plot hover 推导，避免几何变化时用陈旧位置重算
    this.lastClientPos = null
    if (e.pointerType === 'touch') {
      this.isTouchSession = true
    }

    if (
      this._state.readonly.isDragging.peek() &&
      this._state.readonly.dragMode.peek() === 'scale-price'
    ) {
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
    if (
      this._state.readonly.isDragging.peek() &&
      this._state.readonly.dragMode.peek() === 'scale-price'
    )
      return
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
    if (
      this.chart.kernel.mainPriceAxis.readonly.paneRanges.peek()[pane.id]?.rangeMode !==
      PRICE_AXIS_RANGE_MODE.HAND
    ) {
      return false
    }
    this._state.actions.startDrag('scale-price')
    this.dragStartY = clientY
    this.activePaneIdOnDrag = pane.id
    this._state.actions.setRightAxisHover(pane.id)
    this._state.actions.setSeparatorHover(null)
    // 纵向缩放价格轴同样隐藏十字线，但保留取值索引，Legend 数值不随之变化。
    this._state.actions.updateCrosshair(null, null)
    this._state.actions.updateHover(null, pane.id)
    return true
  }

  private capturePointer(e: PointerEvent, element: HTMLElement | null | undefined): void {
    if (!element) return
    this.activePointerId = e.pointerId
    this.pointerCaptureElement = element
    try {
      element.setPointerCapture(e.pointerId)
    } catch {
      // 某些嵌入式宿主不支持 capture；仍以明确的结束事件维护会话。
    }
  }

  private isActivePointer(e: PointerEvent): boolean {
    return this.activePointerId === null || this.activePointerId === e.pointerId
  }

  /** 统一收束拖拽会话；先清指针字段，避免 release 触发 lostpointercapture 时重入。 */
  private endDragSession(releaseCapture = true): void {
    const pointerId = this.activePointerId
    const captureElement = this.pointerCaptureElement
    this.activePointerId = null
    this.pointerCaptureElement = null
    this._state.actions.endDrag()
    this.activePaneIdOnDrag = null
    this.activeSeparatorUpperPaneId = null
    this._cachedMaxScrollLeft = -1
    if (releaseCapture && pointerId !== null && captureElement?.hasPointerCapture(pointerId)) {
      captureElement.releasePointerCapture(pointerId)
    }
  }

  /**
   * 清除悬停派生状态。
   * @param keepValueIndex 拖拽期间为 true：只隐藏十字线，保留取值索引，避免 Legend 数值随视口漂移
   */
  clearHover(keepValueIndex = false) {
    this.hoverFlushPending = false
    this.lastHoverRenderKey = ''
    this._state.actions.setRightAxisHover(null)
    this._state.actions.updateCrosshair(null, null, keepValueIndex ? undefined : null)
    this._state.actions.updateHover(null, null)
    this._state.actions.updateMarkerHover(null, null, null)
    this.chart.clearDrawingHover()
    this.markerState.clearAll(this.chart.markers.getManager())
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
  /** @internal 公开给外部在合适的时机触发十字线重算（如封存新视图快照之后） */
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

    if (this.chart.kernel.viewport.readonly.viewSnapshot.peek().hoverKind === 'point') {
      this.handleTimeshareHover(ctx, bar)
      return
    }

    if (this.tooltipPositionMode === 'adaptive') {
      // 两侧空白槽位无 OHLC：十字线保留，hover/tooltip 不放行。
      this._state.actions.setHoveredIndex(
        bar.globalIdx >= 0 && bar.globalIdx < this.chart.getInternalData().length
          ? bar.globalIdx
          : null,
      )
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
    const markerManager = this.chart.markers.getManager()
    const result = this.markerState.updateHoverFromPoint(
      ctx.worldX,
      ctx.mouseX,
      ctx.mouseY,
      markerManager,
    )
    this._state.actions.updateMarkerHover(
      result.hitMarkerId,
      result.hitMarkerData,
      result.hitCustomMarker,
    )
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
   * K 线直接按网格求解，过去和未来槽位不依赖帧数组；分时查找真实交易数据中心。
   */
  private findNearestBar(ctx: HoverContext): NearestBar | null {
    const view = this.frameView
    if (!view || !view.ready) return null
    const globalIdx = view.indexAtWorld(ctx.worldX)
    if (globalIdx === null) return null
    const center = view.worldAtIndex(globalIdx)
    if (center === null) return null
    return {
      localIdx: globalIdx - view.range.start,
      globalIdx,
      kLineStartX: center - view.kWidth / 2,
      widthLogical: view.kWidth,
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

    const centerX = bar.kLineStartX + bar.widthLogical / 2
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
    const { mouseY, worldX } = ctx
    const data = this.chart.getInternalData()
    // 未来槽位无 OHLC：显式短路，语义不靠 data[idx] undefined 巧合
    if (typeof this.crosshairIndex === 'number' && this.crosshairIndex >= data.length) return false
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

    const point = { x: inUnitX, y: localY }
    const bodyRect = rectFromPoints(
      { x: 0, y: effectiveBodyTop },
      { x: bar.widthLogical, y: effectiveBodyBottom },
    )
    const wickRect = rectFromPoints(
      { x: cxLogical - HIT_WICK_HALF_EXTENDED, y: effectiveWickTop },
      { x: cxLogical + HIT_WICK_HALF_EXTENDED, y: effectiveWickBottom },
    )

    return pointInRect(point, bodyRect) || pointInRect(point, wickRect)
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
      crosshairX: this.crosshairPos?.x,
    })
    this._state.actions.updateTooltip(
      tooltipResult.pos,
      tooltipResult.anchorPlacement ?? 'right-bottom',
    )
  }

  /**
   * 重置所有交互状态（数据更新时调用）
   */
  reset(): void {
    this.stopInertia()
    this.endDragSession()
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
    this.frameView = null
    this.lastHoverRenderKey = ''
  }

  /** 获取十字线指向的 K 线索引 */
  getCrosshairIndex(): number | null {
    return this.crosshairIndex
  }
}
