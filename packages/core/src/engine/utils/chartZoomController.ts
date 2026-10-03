/** 缩放手势协调：所有入口通过同一槽位变换原子提交视口。 */
import { batch } from '../../foundation/reactivity/signal.js'
import type { OptionsStateModule } from '../state/optionsState.js'
import type { ViewportStateModule } from '../state/viewportState.js'
import type { ZoomStateModule } from '../state/zoomState.js'
import { VIEW_STRATEGIES } from '../view/impl/viewStrategies.js'
import { zoomSlotGrid } from '../viewport/slotGrid.js'
import { clampZoomLevel, zoomLevelToKWidth } from './zoom.js'

export interface ZoomDependencies {
  viewport: ViewportStateModule
  options: OptionsStateModule
  onChange?: () => void
}

export class ChartZoomController {
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
    this.applyZoom(level, anchorX)
  }

  /** 围绕指针槽位放大一级。 */
  zoomIn(anchorX?: number): void {
    this.applyZoom(this.currentZoomLevel + 1, anchorX)
  }

  /** 围绕指针槽位缩小一级。 */
  zoomOut(anchorX?: number): void {
    this.applyZoom(this.currentZoomLevel - 1, anchorX)
  }

  /** 将有效滚轮输入转换为一级缩放。 */
  handleWheel(deltaY: number, viewportX: number): void {
    if (deltaY === 0 || !Number.isFinite(deltaY)) return
    this.applyZoom(this.currentZoomLevel + (deltaY < 0 ? 1 : -1), viewportX)
  }

  /** 双指中心与鼠标使用相同的槽位变换。 */
  handlePinch(delta: number, viewportX: number): void {
    this.applyZoom(this.currentZoomLevel + delta, viewportX)
  }

  /** 先保持指针槽位坐标，再由策略在可见数据边界处修正视口。 */
  private applyZoom(level: number, pointerX?: number): void {
    if (!Number.isFinite(level) || (pointerX !== undefined && !Number.isFinite(pointerX))) return
    const target = clampZoomLevel(level, this.zoomLevelCount)
    const current = this.currentZoomLevel
    if (target === current) return
    const viewport = this.deps.viewport
    const input = viewport.readonly.viewInput.peek()
    const strategy = VIEW_STRATEGIES[input.view]
    if (!strategy.capabilities.allowZoom) return
    const before = viewport.readonly.viewSnapshot.peek()
    const anchor = pointerX ?? viewport.readonly.plotWidth.peek() / 2
    if (!(before.grid.step > 0)) return
    const options = this.deps.options.readonly.options.peek()
    const kWidth = zoomLevelToKWidth(target, options)
    const nextInput = strategy.zoomInput(input, target - current, kWidth)
    const after = strategy.project(nextInput)
    const nextScroll = zoomSlotGrid(before.grid, after.grid, before.scroll, anchor)
    batch(() => {
      this.zoomState.actions.setSessionSlotWidth(nextInput.sessionSlotWidth)
      this.zoomState.actions.setZoomLevel(target)
      viewport.actions.setNavigation(strategy.navigate(after, nextScroll))
    })
    this.deps.onChange?.()
  }
}
