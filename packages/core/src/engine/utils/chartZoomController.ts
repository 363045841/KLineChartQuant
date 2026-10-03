/** 缩放手势协调：所有入口通过同一槽位变换原子提交视口。 */
import { isTimeSharePeriod } from '../../controllers/types.js'
import { batch, type ReadonlySignal } from '../../foundation/reactivity/signal.js'
import type { OptionsStateModule } from '../state/optionsState.js'
import type { ViewportStateModule } from '../state/viewportState.js'
import type { ZoomStateModule } from '../state/zoomState.js'
import { createKLineSlotGrid, createTimeShareSlotGrid, zoomSlotGrid } from '../viewport/slotGrid.js'
import { clampZoomLevel, deriveKGap, kGapFromKWidth, zoomLevelToKWidth } from './zoom.js'

export interface ZoomDependencies {
  viewport: ViewportStateModule
  options: OptionsStateModule
  period$: ReadonlySignal<string>
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
    return this.zoomState.readonly.kWidth.peek()
  }

  /** 当前绘制间隙。 */
  get currentKGap(): number {
    return deriveKGap({
      kWidth: this.currentKWidth,
      dpr: this.deps.viewport.readonly.dpr.peek(),
      period: this.deps.period$.peek(),
    })
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

  /** 保存指针槽位坐标，更新几何后直接求解滚动量，不以数据边界改变锚点。 */
  private applyZoom(level: number, pointerX?: number): void {
    if (!Number.isFinite(level) || (pointerX !== undefined && !Number.isFinite(pointerX))) return
    const target = clampZoomLevel(level, this.zoomLevelCount)
    const current = this.currentZoomLevel
    if (target === current) return
    const viewport = this.deps.viewport
    const before = viewport.readonly.slotGrid.peek()
    const scroll = viewport.readonly.scrollLeftLogical.peek()
    const anchor = pointerX ?? viewport.readonly.plotWidth.peek() / 2
    if (!(before.step > 0)) return

    const dpr = viewport.readonly.dpr.peek()
    const timeShare = isTimeSharePeriod(this.deps.period$.peek())
    const width = Math.max(1, Math.round(before.step * dpr) + target - current) / dpr
    const options = this.deps.options.readonly.options.peek()
    const kWidth = zoomLevelToKWidth(target, options)
    const after = timeShare
      ? createTimeShareSlotGrid(
          Math.max(
            viewport.readonly.minimumTimeShareContentWidth.peek(),
            viewport.readonly.timeShareSlotCount.peek() * width,
          ),
          viewport.readonly.timeShareSlotCount.peek(),
          dpr,
        )
      : createKLineSlotGrid(kWidth, kGapFromKWidth(kWidth, dpr), dpr)
    const nextScroll = zoomSlotGrid(before, after, scroll, anchor)
    batch(() => {
      if (timeShare) this.zoomState.actions.setTimeShareSlotWidth(width)
      this.zoomState.actions.setZoomLevel(target)
      viewport.actions.scrollToLogical(nextScroll)
    })
    this.deps.onChange?.()
  }
}
