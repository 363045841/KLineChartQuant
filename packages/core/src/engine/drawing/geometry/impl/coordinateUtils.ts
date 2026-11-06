// 绘图坐标换算模块：锚点逻辑坐标（时间戳 + 价格）与屏幕坐标（px）的双向换算，
// 并提供从 PointerEvent 解析落点锚点的 resolveDrawingPointer（可选磁吸 / 锁角）。
//
// 坐标空间只有一套：进入本模块后一律是 Pane 局部逻辑像素，`pane.top` 只在
// 「容器局部 → Pane 局部」这一处消费一次；磁吸、锁角、命中、手柄、帧投影共用同一空间。
//
// 磁吸与锁角只作用于落点/预览路径，命中、框选等只读路径不得传入，以免范围漂移。

import type { DrawingViewportPort, PaneLayoutInfo } from '@/controllers/types.js'
import type { Point } from '@/foundation/geometry/index.js'
import type { ScreenDrawingAnchor } from '@/foundation/plugin/index.js'
import { snapPointer } from '../../magnet/impl/snapPointer.js'
import type { SnapCandidate, SnapResult } from '../../magnet/types.js'
import type {
  DrawingPointerAnchor,
  PointerCoordinates,
  ProjectableAnchor,
  ResolveDrawingPointerOptions,
  ResolvedInteractionAnchor,
} from '../types.js'
import { lockAngle } from './angleLock.js'

/**
 * 将图元锚点转换为指定 Pane 内的屏幕坐标（px）。
 *
 * 计算过程：
 * 1. 通过 adapter 将锚点时间戳解析为当前逻辑索引
 * 2. 通过本帧已封存的中心点取得 X（分时与 K 线共用同一映射）
 * 3. 通过 adapter.priceToY 按锚点所属 Pane 将价格转为局部 Y
 *
 * @param anchor 待投影锚点；持久化锚点与交互期待定锚点都可直接传入
 * @param paneId 锚点所属 Pane
 * @param adapter 视口与坐标换算
 * @returns 按锚点类型返回点、水平或垂直投影；时间戳无法解析或视图未就绪时返回 null
 */
export function anchorToScreen(
  anchor: ProjectableAnchor,
  paneId: string,
  adapter: DrawingViewportPort,
): ScreenDrawingAnchor | null {
  if (anchor.type === 'horizontal') {
    return { type: 'horizontal', y: adapter.priceToY(paneId, anchor.price) }
  }

  const timestamp = typeof anchor.time === 'string' ? Date.parse(anchor.time) : anchor.time
  if (!Number.isFinite(timestamp)) return null
  const baseIndex = adapter.getLogicalIndexAtTimestamp(timestamp as number)
  if (baseIndex === null) return null
  const futureOffset = anchor.futureOffset
  if (futureOffset !== undefined && (!Number.isInteger(futureOffset) || futureOffset <= 0)) {
    return null
  }
  const index = baseIndex + (futureOffset ?? 0)
  const x = adapter.getXAtLogicalIndex(index)
  if (x === null) return null
  if (anchor.type === 'vertical') return { type: 'vertical', x }
  return { type: 'point', x, y: adapter.priceToY(paneId, anchor.price) }
}

/** 判断投影是否为同时具有 X/Y 的普通点。 */
export function isScreenPoint(
  anchor: ScreenDrawingAnchor | null,
): anchor is { type: 'point' } & Point {
  return anchor?.type === 'point'
}

/**
 * 将屏幕坐标（px）反向解析为逻辑锚点坐标（index + price）。
 *
 * 用于拖拽整线时的屏幕偏移量回算。
 *
 * @param screenX Pane 局部 X
 * @param paneY Pane 局部 Y
 * @param paneId 目标 Pane
 * @param adapter 视口与坐标换算
 * @returns ResolvedInteractionAnchor，viewport 不可用或无法解析时间轴槽位时返回 null
 */
export function screenToAnchor(
  screenX: number,
  paneY: number,
  paneId: string,
  adapter: DrawingViewportPort,
): ResolvedInteractionAnchor | null {
  const data = adapter.getDrawingData()
  const viewport = adapter.getViewport()
  if (!viewport || data.length === 0) return null

  const logicalIndex = adapter.getLogicalIndexAtX(screenX)
  if (logicalIndex === null) return null

  const paneInfo = adapter.getPaneInfo(paneId)
  if (!paneInfo) return null

  const lastIndex = data.length - 1
  const timestamp = adapter.getDrawingTimestampAtLogicalIndex(Math.min(logicalIndex, lastIndex))
  if (timestamp === null) return null

  return {
    time: timestamp,
    ...(logicalIndex > lastIndex ? { futureOffset: logicalIndex - lastIndex } : {}),
    price: adapter.yToPrice(paneId, paneY),
  }
}

/** 落点所在的 Pane 与 Pane 局部坐标。 */
interface DrawingAreaPlacement {
  pane: PaneLayoutInfo
  /** Pane 局部 X。 */
  x: number
  /** Pane 局部 Y。 */
  y: number
}

/**
 * 把指针事件解析为绘图落点锚点。
 *
 * 坐标约定：`DrawingPointerAnchor.x/y` 是 Pane 局部逻辑像素；调用方不得再加减
 * `pane.top`。容器局部 → Pane 局部的换算只发生在本函数的入口一次。
 *
 * @param pointer 指针 client 坐标
 * @param container 图表容器
 * @param adapter 视口与坐标换算
 * @param options 落点约束（磁吸 / 锁角）与出界钳制
 * @returns 落点锚点；超出绘图区、数据不可用或时间轴无法解析时返回 null
 */
export function resolveDrawingPointer(
  pointer: PointerCoordinates,
  container: HTMLElement,
  adapter: DrawingViewportPort,
  options?: ResolveDrawingPointerOptions,
): DrawingPointerAnchor | null {
  const data = adapter.getDrawingData()
  const viewport = adapter.getViewport()
  if (!viewport || data.length === 0) return null

  const placement = resolvePointerPlacement(
    pointer,
    container,
    viewport,
    adapter,
    options?.clampPaneId,
  )
  if (!placement) return null

  const constrained = applyPointerConstraints(placement, options, adapter, data.length)
  if (!constrained) return null

  const snapped = resolvePointerSnap(constrained, placement.pane, options, adapter)
  const anchor = screenToAnchor(constrained.x, constrained.y, placement.pane.paneId, adapter)
  if (!anchor) return null
  return {
    ...applyCandidate(anchor, snapped?.candidate ?? null),
    paneId: placement.pane.paneId,
    x: snapped?.x ?? constrained.x,
    y: snapped?.y ?? constrained.y,
    snap: snapped?.candidate ?? null,
  }
}

/** 把 client 坐标换算成落点所在 Pane 的局部坐标；出界钳制与严格落点共用同一入口。 */
function resolvePointerPlacement(
  pointer: PointerCoordinates,
  container: HTMLElement,
  viewport: { plotWidth: number; plotHeight: number },
  adapter: DrawingViewportPort,
  clampPaneId: string | undefined,
): DrawingAreaPlacement | null {
  const rect = container.getBoundingClientRect()
  const mouseX = pointer.clientX - rect.left
  const mouseY = pointer.clientY - rect.top
  return clampPaneId
    ? clampToPane(mouseX, mouseY, viewport, adapter, clampPaneId)
    : resolveWithinDrawingArea(mouseX, mouseY, viewport, adapter)
}

/**
 * 应用方向约束与数据边界。
 *
 * 锁角先绕参考点定向，再由数据边界裁 X：回归通道不允许越出已有数据，
 * 触边时角度让位于硬约束。
 */
function applyPointerConstraints(
  placement: DrawingAreaPlacement,
  options: ResolveDrawingPointerOptions | undefined,
  adapter: DrawingViewportPort,
  dataLength: number,
): Point | null {
  const locked = options?.angleLock
    ? lockAngle(options.angleLock.origin, { x: placement.x, y: placement.y })
    : { x: placement.x, y: placement.y }
  if (!options?.clampDataEnd) return locked
  const lastX = adapter.getXAtLogicalIndex(dataLength - 1)
  return lastX === null ? null : { x: Math.min(locked.x, lastX), y: locked.y }
}

/**
 * 值吸附只改写 Pane 局部坐标，不影响 Pane 判定。
 *
 * 与锁角互斥：方向约束在场时值吸附不执行，否则吸回的值会把落点拽离锁定方向。
 */
function resolvePointerSnap(
  point: Point,
  pane: PaneLayoutInfo,
  options: ResolveDrawingPointerOptions | undefined,
  adapter: DrawingViewportPort,
): SnapResult | null {
  if (!options?.magnet || options.angleLock) return null
  return snapPointer(point.x, point.y, pane, adapter, options.magnet)
}

/**
 * 命中的候选直接覆盖对应轴的领域值，避免屏幕坐标反算带来的精度损失。
 *
 * 候选提供时间时，同时丢弃 futureOffset：它引用的是真实 Bar，不再是未来槽位。
 */
function applyCandidate(
  anchor: ResolvedInteractionAnchor,
  candidate: SnapCandidate | null,
): ResolvedInteractionAnchor {
  if (candidate === null) return anchor
  if (candidate.time !== null) {
    const { futureOffset: _futureOffset, ...rest } = anchor
    return { ...rest, time: candidate.time, price: candidate.price ?? anchor.price }
  }
  if (candidate.price !== null) return { ...anchor, price: candidate.price }
  return anchor
}

/** 严格落点：超出绘图区或不在任何 Pane 内返回 null。 */
function resolveWithinDrawingArea(
  mouseX: number,
  mouseY: number,
  viewport: { plotWidth: number; plotHeight: number },
  adapter: DrawingViewportPort,
): DrawingAreaPlacement | null {
  if (mouseX < 0 || mouseY < 0 || mouseX > viewport.plotWidth || mouseY > viewport.plotHeight) {
    return null
  }
  const pane = adapter.getPaneAtY(mouseY)
  return pane ? { x: mouseX, y: mouseY - pane.top, pane } : null
}

/** 出界钳制：X 贴绘图区，Y 贴目标 Pane，保证进行中的图元预览不因指针离开而中断。 */
function clampToPane(
  mouseX: number,
  mouseY: number,
  viewport: { plotWidth: number },
  adapter: DrawingViewportPort,
  paneId: string,
): DrawingAreaPlacement | null {
  const pane = adapter.getPaneInfo(paneId)
  if (!pane) return null
  const clampedY = clampRange(mouseY, pane.top, pane.top + pane.height)
  return {
    x: clampRange(mouseX, 0, viewport.plotWidth),
    y: clampedY - pane.top,
    pane,
  }
}

/** 把 value 限制在 [min, max]。 */
function clampRange(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}
