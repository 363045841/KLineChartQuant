/** 缩放手势协调：所有入口通过同一槽位变换原子提交视口。 */
import { batch } from '../../foundation/reactivity/signal.js'
import { SCALE_X_STRATEGIES } from '../scale/index.js'
import type { OptionsStateModule } from '../state/optionsState.js'
import type { ViewportStateModule } from '../state/viewportState.js'
import type { ZoomStateModule } from '../state/zoomState.js'
import { zoomSlotGrid } from './slotGrid.js'
import { clampZoomLevel, zoomLevelToKWidth } from './zoom.js'

export interface ZoomDependencies {
  viewport: ViewportStateModule
  options: OptionsStateModule
  onChange?: () => void
  onStart?: () => void
}

export class ChartZoomController {
  private animationFrame: number | null = null
  private targetLevel: number | null = null

  get isAnimating(): boolean {
    return this.animationFrame !== null
  }

  /** 新拖拽、视图切换和销毁时保留当前尺寸并取消过渡。 */
  stopAnimation(): void {
    if (this.animationFrame !== null) cancelAnimationFrame(this.animationFrame)
    this.animationFrame = null
    this.targetLevel = null
  }

  private animateZoom(level: number, pointerX?: number): void {
    if (!Number.isFinite(level) || (pointerX !== undefined && !Number.isFinite(pointerX))) return
    const initial = this.deps.viewport.readonly.viewSnapshot.peek()
    if (!initial.capabilities.allowZoom || !(initial.grid.step > 0)) return
    const target = clampZoomLevel(level, this.zoomLevelCount)
    if (target === this.targetLevel) return
    this.stopAnimation()
    if (target === this.currentZoomLevel) return
    this.deps.onStart?.()
    this.targetLevel = target
    const from = this.currentZoomLevel
    const anchor = pointerX ?? initial.viewportWidth / 2
    const slot = (initial.scroll + anchor - initial.grid.origin) / initial.grid.step
    const started = performance.now()
    let expectedLevel = from
    let expectedScroll = initial.scroll
    const advance = (time: number) => {
      const view = this.deps.viewport.readonly.viewSnapshot.peek()
      if (
        view.view !== initial.view ||
        !view.capabilities.allowZoom ||
        this.currentZoomLevel !== expectedLevel ||
        view.scroll !== expectedScroll
      ) {
        this.stopAnimation()
        return
      }
      const progress = Math.max(0, Math.min(1, (time - started) / 180))
      const eased = 1 - (1 - progress) ** 3
      this.applyZoom(from + (target - from) * eased, anchor, true, slot)
      expectedLevel = this.currentZoomLevel
      expectedScroll = this.deps.viewport.readonly.scrollLeftLogical.peek()
      if (progress >= 1) {
        this.stopAnimation()
        this.deps.onChange?.()
        return
      }
      this.animationFrame = requestAnimationFrame(advance)
    }
    this.animationFrame = requestAnimationFrame(advance)
  }
  /** 注入唯一的缩放状态与视口状态。 */
  constructor(
    private readonly deps: ZoomDependencies,
    private readonly zoomState: ZoomStateModule,
  ) {}

  /** 当前缩放级别。 */
  get currentZoomLevel(): number {
    return this.zoomState.readonly.zoomLevel.peek()
  }

  /** 当前 K 线宽度。 */
  get currentKWidth(): number {
    return this.deps.viewport.readonly.viewSnapshot.peek().kWidth
  }

  /** 当前绘制间隙。 */
  get currentKGap(): number {
    return this.deps.viewport.readonly.viewSnapshot.peek().kGap
  }

  /** 配置中的缩放级别数量。 */
  get zoomLevelCount(): number {
    return this.deps.options.readonly.options.peek().zoomLevelCount
  }

  /** 切换级别，以指定视口位置为中心；无指针时使用视口中心。 */
  zoomToLevel(level: number, anchorX?: number): void {
    this.stopAnimation()
    this.deps.onStart?.()
    this.applyZoom(level, anchorX)
  }

  /** 围绕指针槽位放大一级。 */
  zoomIn(anchorX?: number): void {
    this.animateZoom((this.targetLevel ?? Math.round(this.currentZoomLevel)) + 1, anchorX)
  }

  /** 围绕指针槽位缩小一级。 */
  zoomOut(anchorX?: number): void {
    this.animateZoom((this.targetLevel ?? Math.round(this.currentZoomLevel)) - 1, anchorX)
  }

  /** 将有效滚轮输入转换为一级缩放。 */
  handleWheel(deltaY: number, viewportX: number): void {
    if (deltaY === 0 || !Number.isFinite(deltaY)) return
    this.animateZoom(
      (this.targetLevel ?? Math.round(this.currentZoomLevel)) + (deltaY < 0 ? 1 : -1),
      viewportX,
    )
  }

  /** 双指中心与鼠标使用相同的槽位变换。 */
  handlePinch(delta: number, viewportX: number): void {
    this.stopAnimation()
    this.deps.onStart?.()
    this.applyZoom(this.currentZoomLevel + delta, viewportX, true)
  }

  /** 先保持指针槽位坐标，再由策略在可见数据边界处修正视口。 */
  private applyZoom(
    level: number,
    pointerX?: number,
    continuous = false,
    anchoredSlot?: number,
  ): void {
    if (!Number.isFinite(level) || (pointerX !== undefined && !Number.isFinite(pointerX))) return
    const target = continuous
      ? Math.max(1, Math.min(this.zoomLevelCount, level))
      : clampZoomLevel(level, this.zoomLevelCount)
    const current = this.currentZoomLevel
    if (target === current) return
    const viewport = this.deps.viewport
    const input = viewport.readonly.viewInput.peek()
    const strategy = SCALE_X_STRATEGIES[input.view]
    if (!strategy.capabilities.allowZoom) return
    const before = viewport.readonly.viewSnapshot.peek()
    const anchor = pointerX ?? viewport.readonly.plotWidth.peek() / 2
    if (!(before.grid.step > 0)) return
    const options = this.deps.options.readonly.options.peek()
    const kWidth = zoomLevelToKWidth(target, options)
    const nextInput = strategy.zoomInput(input, target - current, kWidth)
    const after = strategy.project(nextInput)
    const nextScroll =
      anchoredSlot === undefined
        ? zoomSlotGrid(before.grid, after.grid, before.scroll, anchor)
        : after.grid.origin + anchoredSlot * after.grid.step - anchor
    batch(() => {
      this.zoomState.actions.setSessionSlotWidth(nextInput.sessionSlotWidth)
      this.zoomState.actions.setZoomProgress(target)
      viewport.actions.setNavigation(strategy.navigate(after, nextScroll))
    })
    this.deps.onChange?.()
  }
}
