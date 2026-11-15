/** Pane、轴、配置和指标资源的唯一有序投影入口。 */
import { mergeUpdateLevel } from '@/engine/frame/index.js'
import { UpdateLevel } from '@/engine/pane/index.js'
import type { PaneAxisSpec } from '@/engine/pane/axisTypes.js'
import { batch, effect } from '@/foundation/reactivity/signal.js'
import type { RuntimeProjectionDependencies, RuntimeProjectionSnapshot } from '../types.js'

/** 比较轴声明的值，避免每次读取新数组都拆装图层。 */
function sameAxes(
  previous: RuntimeProjectionSnapshot['axes'],
  next: RuntimeProjectionSnapshot['axes'],
): boolean {
  if (previous.size !== next.size) return false
  for (const [paneId, axes] of next) {
    const before = previous.get(paneId)
    if (!before || before.length !== axes.length) return false
    if (!axes.every((axis, index) => sameAxis(before[index]!, axis))) return false
  }
  return true
}

/** 身份、显示配置和格式器共同组成一条轴声明。 */
function sameAxis(previous: PaneAxisSpec, next: PaneAxisSpec): boolean {
  return (
    previous.objectId === next.objectId &&
    previous.paneId === next.paneId &&
    previous.axisId === next.axisId &&
    previous.visible === next.visible &&
    previous.scaleType === next.scaleType &&
    previous.decimals === next.decimals &&
    previous.format === next.format
  )
}

/** 只有归属和轴身份变化才影响图层闭包，刻度配置变化不拆装资源。 */
function sameBindings(
  previous: RuntimeProjectionSnapshot['axes'],
  next: RuntimeProjectionSnapshot['axes'],
): boolean {
  const before = new Map(
    [...previous.values()].flatMap((axes) => axes.map((axis) => [axis.objectId, axis])),
  )
  const after = [...next.values()].flat()
  return (
    before.size === after.length &&
    after.every((axis) => {
      const binding = before.get(axis.objectId)
      return binding?.paneId === axis.paneId && binding.axisId === axis.axisId
    })
  )
}

/** 单一订阅负责提交；帧入口与公共 API 同步也必须经过本协调者。 */
export class RuntimeProjectionCoordinator {
  private previous: RuntimeProjectionSnapshot | null = null
  private disposeEffect: (() => void) | null = null
  private running = false
  private pending = false
  private stopped = false
  private pendingLevel: UpdateLevel | null = null

  /** 注入各阶段端口，不让协调者持有 DOM、行情或计算器。 */
  constructor(private readonly deps: RuntimeProjectionDependencies) {}

  /** 所有依赖在同一个订阅中捕获，阶段之间没有独立订阅竞争。 */
  start(): void {
    if (this.disposeEffect !== null || this.stopped) return
    this.disposeEffect = effect(() => this.synchronize(this.deps.capture()))
  }

  /** 合并阶段内的绘制请求；只有完整提交成功后才能交给帧渲染器。 */
  requestDraw(level: UpdateLevel = UpdateLevel.All): void {
    if (this.stopped) return
    if (this.running) {
      this.pendingLevel =
        this.pendingLevel === null ? level : mergeUpdateLevel(this.pendingLevel, level)
      return
    }
    this.deps.requestDraw(level)
  }

  /** 同步当前完整状态；提交中的再入请求在本轮结束后重新捕获快照。 */
  synchronize(snapshot: RuntimeProjectionSnapshot = this.deps.capture()): void {
    if (this.stopped) return
    if (this.running) {
      this.pending = true
      return
    }
    this.running = true
    try {
      do {
        this.pending = false
        batch(() => this.commit(snapshot))
        if (this.pending) snapshot = this.deps.capture()
      } while (this.pending)
    } catch (error) {
      // 失败不发布完成版本，也不绘制部分完成的资源；下次同步重新完整投影。
      this.previous = null
      this.pendingLevel = null
      throw error
    } finally {
      this.running = false
    }
    const level = this.pendingLevel
    this.pendingLevel = null
    if (level !== null) this.deps.requestDraw(level)
  }

  /** 固定阶段顺序；纯布局或轴配置更新不会重挂指标资源。 */
  private commit(snapshot: RuntimeProjectionSnapshot): void {
    const previous = this.previous
    const panesChanged =
      previous === null || previous.panes !== snapshot.panes ||
      previous.layoutOptions !== snapshot.layoutOptions
    const axesChanged = previous === null || !sameAxes(previous.axes, snapshot.axes)
    const configurationChanged =
      previous === null || previous.ranges !== snapshot.ranges ||
      previous.pricePaneId !== snapshot.pricePaneId ||
      previous.leftAxisVisible !== snapshot.leftAxisVisible
    const indicatorsChanged =
      previous === null ||
      previous.indicators.instances !== snapshot.indicators.instances ||
      previous.indicators.colors !== snapshot.indicators.colors ||
      previous.indicators.definitionRevision !== snapshot.indicators.definitionRevision
    if (!panesChanged && !axesChanged && !configurationChanged && !indicatorsChanged) return

    if (panesChanged) this.deps.projectPanes(snapshot)
    this.deps.projectAxes(snapshot)
    this.deps.configureAxes(snapshot)
    if (indicatorsChanged || previous === null || !sameBindings(previous.axes, snapshot.axes))
      this.deps.projectLayers(snapshot)
    this.deps.invalidateFrame()
    this.previous = snapshot
    this.requestDraw(UpdateLevel.All)
  }

  /** 先停止订阅和绘制，再由 Chart 释放具体资源。 */
  dispose(): void {
    this.stopped = true
    this.disposeEffect?.()
    this.disposeEffect = null
    this.previous = null
    this.pendingLevel = null
  }
}
