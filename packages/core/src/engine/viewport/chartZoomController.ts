/** 缩放手势协调：所有入口通过同一槽位变换原子提交视口。 */
import { batch } from '../../foundation/reactivity/signal.js'
import type { ChartDataView } from '../../foundation/types/chartView.js'
import { SCALE_X_STRATEGIES } from '../scale/index.js'
import type { OptionsStateModule } from '../state/optionsState.js'
import type { ViewportStateModule } from '../state/viewportState.js'
import type { ZoomStateModule } from '../state/zoomState.js'
import { zoomSlotGrid } from './slotGrid.js'
import { clampZoomLevel, zoomLevelToKWidth } from './zoom.js'

/** 临界阻尼响应速度（每毫秒）及连续轨迹到达精确终点的时间。 */
const ZOOM_FREQUENCY = 0.035
const ZOOM_DURATION_MS = 300
const WHEEL_ZOOM_RATE = Math.LN2 / 500
const WHEEL_LINE_PIXELS = 16
const TRACKPAD_PIXEL_THRESHOLD = 4
const WHEEL_GESTURE_IDLE_MS = 150

interface ZoomMotion {
  view: ChartDataView
  targetLevel: number
  position: number
  velocity: number
  direction: number
  started: number
  from: number
  initialVelocity: number
  finalFrame: boolean
  anchor: number
  slot: number
  expectedLevel: number
  expectedScroll: number
}

export interface ZoomDependencies {
  viewport: ViewportStateModule
  options: OptionsStateModule
  onChange?: () => void
  onStart?: () => void
}

export class ChartZoomController {
  private animationFrame: number | null = null
  private motion: ZoomMotion | null = null
  private lastWheelTime = -Infinity
  private directWheelGesture = false

  get isAnimating(): boolean {
    return this.animationFrame !== null
  }

  /** 新拖拽、视图切换和销毁时保留当前尺寸并取消过渡。 */
  stopAnimation(): void {
    if (this.animationFrame !== null) cancelAnimationFrame(this.animationFrame)
    this.animationFrame = null
    this.motion = null
  }

  /** 将现有公开档位映射到对数宽度，保持档位 API 的原有含义。 */
  private zoomPosition(level: number): number {
    return Math.log(zoomLevelToKWidth(level, this.deps.options.readonly.options.peek()))
  }

  /** 将动画中的对数宽度还原成连续档位。 */
  private positionLevel(position: number): number {
    const options = this.deps.options.readonly.options.peek()
    if (options.maxKWidth === options.minKWidth) return this.currentZoomLevel
    const level =
      1 +
      ((Math.exp(position) - options.minKWidth) / (options.maxKWidth - options.minKWidth)) *
        (this.zoomLevelCount - 1)
    return Math.max(1, Math.min(this.zoomLevelCount, level))
  }

  /** 外部导航、切换视图或尺寸写入后不再延续旧动画。 */
  private motionIsCurrent(motion: ZoomMotion): boolean {
    const view = this.deps.viewport.readonly.viewSnapshot.peek()
    return (
      view.view === motion.view &&
      view.capabilities.allowZoom &&
      this.currentZoomLevel === motion.expectedLevel &&
      view.scroll === motion.expectedScroll
    )
  }

  /** 更新连续目标与指针锚点，复用正在运行的动画。 */
  private animateZoom(level: number, pointerX?: number): void {
    if (!Number.isFinite(level) || (pointerX !== undefined && !Number.isFinite(pointerX))) return
    const initial = this.deps.viewport.readonly.viewSnapshot.peek()
    if (!initial.capabilities.allowZoom || !(initial.grid.step > 0)) return
    const target = Math.max(1, Math.min(this.zoomLevelCount, level))
    const anchor = pointerX ?? initial.viewportWidth / 2
    if (this.motion && !this.motionIsCurrent(this.motion)) this.stopAnimation()
    if (this.motion) {
      if (this.motion.targetLevel !== target) {
        this.motion.targetLevel = target
        this.motion.from = this.motion.position
        this.motion.initialVelocity = this.motion.velocity
        this.motion.started = performance.now()
        this.motion.finalFrame = false
      }
      if (anchor !== this.motion.anchor) {
        this.motion.anchor = anchor
        this.motion.slot = (initial.scroll + anchor - initial.grid.origin) / initial.grid.step
      }
      return
    }
    if (target === this.currentZoomLevel) return
    this.deps.onStart?.()
    this.motion = {
      view: initial.view,
      targetLevel: target,
      position: this.zoomPosition(this.currentZoomLevel),
      velocity: 0,
      direction: Math.sign(target - this.currentZoomLevel),
      started: performance.now(),
      from: this.zoomPosition(this.currentZoomLevel),
      initialVelocity: 0,
      finalFrame: false,
      anchor,
      slot: (initial.scroll + anchor - initial.grid.origin) / initial.grid.step,
      expectedLevel: this.currentZoomLevel,
      expectedScroll: initial.scroll,
    }
    this.animationFrame = requestAnimationFrame(this.advanceZoom)
  }

  /** 临界阻尼残差乘以平滑终点窗，保留输入速度并在有限时间精确到达目标。 */
  private advanceZoom = (time: number): void => {
    const motion = this.motion
    if (!motion || !this.motionIsCurrent(motion)) {
      this.stopAnimation()
      return
    }
    // 目标帧已在上一轮提交；结束通知只改生命周期，不再改尺寸和导航。
    if (motion.finalFrame) {
      this.stopAnimation()
      this.deps.onChange?.()
      return
    }
    const elapsed = Math.max(0, Math.min(ZOOM_DURATION_MS, time - motion.started))
    const progress = elapsed / ZOOM_DURATION_MS
    const target = this.zoomPosition(motion.targetLevel)
    const offset = motion.from - target
    const coefficient = motion.initialVelocity + ZOOM_FREQUENCY * offset
    const decay = Math.exp(-ZOOM_FREQUENCY * elapsed)
    const residual = (offset + coefficient * elapsed) * decay
    // 窗函数两端导数为零：起点继承原速度，终点的位置和速度均精确收敛。
    const window = (1 - progress) ** 2 * (1 + 2 * progress)
    const windowVelocity = (6 * progress * (progress - 1)) / ZOOM_DURATION_MS
    motion.position = target + residual * window
    motion.velocity =
      (motion.initialVelocity - ZOOM_FREQUENCY * coefficient * elapsed) * decay * window +
      residual * windowVelocity
    const finished = progress === 1
    this.applyZoom(
      finished ? motion.targetLevel : this.positionLevel(motion.position),
      motion.anchor,
      true,
      motion.slot,
    )
    motion.expectedLevel = this.currentZoomLevel
    motion.expectedScroll = this.deps.viewport.readonly.viewSnapshot.peek().scroll
    motion.finalFrame = finished
    this.animationFrame = requestAnimationFrame(this.advanceZoom)
  }

  /** 输入反向时从当前尺寸响应，避免继续追赶旧方向的累计目标。 */
  private inputBase(direction: number): number {
    const motion = this.motion
    if (!motion) return this.currentZoomLevel
    if (!this.motionIsCurrent(motion)) {
      this.stopAnimation()
      return this.currentZoomLevel
    }
    if (motion.direction !== direction) {
      motion.direction = direction
      motion.velocity = 0
      motion.initialVelocity = 0
      return this.currentZoomLevel
    }
    return motion.targetLevel
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
    this.animateZoom(clampZoomLevel(this.inputBase(1) + 1, this.zoomLevelCount), anchorX)
  }

  /** 围绕指针槽位缩小一级。 */
  zoomOut(anchorX?: number): void {
    this.animateZoom(clampZoomLevel(this.inputBase(-1) - 1, this.zoomLevelCount), anchorX)
  }

  /** 保留滚动量与单位；小像素增量及触控板捏合直接跟手，其余输入平滑追随。 */
  handleWheel(deltaY: number, viewportX: number, deltaMode = 0, ctrlKey = false): void {
    if (deltaY === 0 || !Number.isFinite(deltaY) || !Number.isFinite(viewportX)) return
    const pixels =
      deltaY *
      (deltaMode === 1
        ? WHEEL_LINE_PIXELS
        : deltaMode === 2
          ? this.deps.viewport.readonly.viewport.peek().plotHeight
          : 1)
    const now = performance.now()
    if (now - this.lastWheelTime > WHEEL_GESTURE_IDLE_MS || deltaMode !== 0) {
      this.directWheelGesture = false
    }
    this.lastWheelTime = now
    // 一旦识别到细粒度输入，本次手势持续跟手，避免增量越过阈值时反复切换路径。
    if (deltaMode === 0 && (ctrlKey || Math.abs(deltaY) < TRACKPAD_PIXEL_THRESHOLD)) {
      this.directWheelGesture = true
    }
    const direct = this.directWheelGesture
    const base = direct ? this.currentZoomLevel : this.inputBase(Math.sign(-pixels))
    const position =
      this.zoomPosition(base) -
      Math.max(-500, Math.min(500, pixels)) * WHEEL_ZOOM_RATE * (ctrlKey ? 10 : 1)
    const level = this.positionLevel(position)
    if (direct) {
      this.stopAnimation()
      this.deps.onStart?.()
      this.applyZoom(level, viewportX, true)
    } else this.animateZoom(level, viewportX)
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
      // 导航保留连续锚点变换；显示中心只在共享快照中量化一次。
      // 提前取整导航会与中心取整形成两个阈值，导致尾部出现 1px 往返。
      viewport.actions.setNavigation(strategy.navigate(after, nextScroll))
    })
    this.deps.onChange?.()
  }
}
