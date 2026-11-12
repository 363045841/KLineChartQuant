// 绘图坐标换算模块：锚点逻辑坐标（时间戳 + 价格）与屏幕坐标（px）的双向换算，
// 并提供从 PointerEvent 解析落点锚点的 resolveDrawingPointer（可选磁吸 / 锁角）。
//
// 坐标空间只有一套：进入本模块后一律是 Pane 局部逻辑像素，`pane.top` 只在
// 「容器局部 → Pane 局部」这一处消费一次；磁吸、锁角、命中、手柄、帧投影共用同一空间。
// 时间与像素的换算全部委托公共坐标服务，数据两端的外推规则也由它统一决定。
//
// 磁吸与锁角只作用于落点/预览路径，命中、框选等只读路径不得传入，以免范围漂移。

import type { DrawingViewportPort, PaneLayoutInfo } from '@/controllers/types.js'
import type { FrameCoordinates } from '@/foundation/geometry/frameCoordinates.js'
import type { Point } from '@/foundation/geometry/index.js'
import type { ScreenDrawingAnchor } from '@/foundation/plugin/index.js'
import { snapPointer } from '../../magnet/impl/snapPointer.js'
import type { SnapCandidate, SnapResult } from '../../magnet/types.js'
import type {
  DrawingPointerAnchor,
  DrawingPointerLocation,
  PointerCoordinates,
  ProjectableAnchor,
  ResolveDrawingPointerOptions,
  ResolvedInteractionAnchor,
} from '../types.js'
import { lockAngle } from './angleLock.js'

/**
 * 将图元锚点转换为指定 Pane 内的屏幕坐标（px）。
 *
 * 时间先经公共坐标服务取最近槽位，再投影为当前帧横坐标；价格由该 Pane 的
 * 价格轴换算。渲染、命中与拖拽都走这一条投影。
 *
 * @param anchor 待投影锚点；持久化锚点与交互期待定锚点都可直接传入
 * @param paneId 锚点所属 Pane
 * @param adapter 视口与坐标换算
 * @returns 按锚点类型返回点、水平或垂直投影；视图未就绪时返回 null
 */
export function anchorToScreen(
  anchor: ProjectableAnchor,
  paneId: string,
  adapter: DrawingViewportPort,
): ScreenDrawingAnchor | null {
  const coordinates = adapter.getCoordinates(paneId)
  if (!coordinates) return null
  if (anchor.type === 'horizontal') {
    const y = coordinates.priceToY(anchor.price)
    return y === null ? null : { type: 'horizontal', y }
  }

  const timestamp = typeof anchor.time === 'string' ? Date.parse(anchor.time) : anchor.time
  if (timestamp === undefined || !Number.isFinite(timestamp)) return null
  const index = coordinates.timeToSlot(timestamp)
  if (index === null) return null
  const x = coordinates.logicalToX(index)
  if (x === null) return null
  if (anchor.type === 'vertical') return { type: 'vertical', x }
  const y = coordinates.priceToY(anchor.price)
  return y === null ? null : { type: 'point', x, y }
}

/** 判断投影是否为同时具有 X/Y 的普通点。 */
export function isScreenPoint(
  anchor: ScreenDrawingAnchor | null,
): anchor is { type: 'point' } & Point {
  return anchor?.type === 'point'
}

/**
 * 将屏幕坐标（px）反向解析为逻辑锚点坐标（时间 + 价格）。
 *
 * 用于拖拽整线时的屏幕偏移量回算；连续位置保留槽位内部的分数，
 * 不会因为一次平移就被取整。
 *
 * @param screenX Pane 局部 X
 * @param paneY Pane 局部 Y
 * @param paneId 目标 Pane
 * @param adapter 视口与坐标换算
 * @returns 逻辑锚点；视图未就绪时返回 null
 */
export function screenToAnchor(
  screenX: number,
  paneY: number,
  paneId: string,
  adapter: DrawingViewportPort,
): ResolvedInteractionAnchor | null {
  if (!adapter.getViewport()) return null
  const coordinates = adapter.getCoordinates(paneId)
  if (!coordinates) return null
  const index = coordinates.xToLogical(screenX)
  if (index === null) return null
  const time = coordinates.logicalToTime(index)
  if (time === null) return null
  const price = coordinates.yToPrice(paneY)
  return price === null ? null : { time, price }
}

/** 落点所在的 Pane 与 Pane 局部坐标。 */
interface DrawingAreaPlacement {
  pane: PaneLayoutInfo
  /** Pane 局部 X。 */
  x: number
  /** Pane 局部 Y。 */
  y: number
}

/** 定位容器内的 Pane 局部指针；只读指针不要求该位置已有行情时间。 */
export function resolveDrawingLocation(
  pointer: PointerCoordinates,
  container: HTMLElement,
  adapter: DrawingViewportPort,
): DrawingPointerLocation | null {
  const viewport = adapter.getViewport()
  if (!viewport) return null
  const placement = resolvePointerPlacement(pointer, container, viewport, adapter)
  return placement ? { paneId: placement.pane.paneId, x: placement.x, y: placement.y } : null
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
 * @returns 落点锚点；超出绘图区或视图未就绪时返回 null
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

  const coordinates = adapter.getCoordinates(placement.pane.paneId)
  if (!coordinates) return null

  const constrained = applyPointerConstraints(placement, coordinates, data.length, options)
  if (!constrained) return null

  const snapped = resolvePointerSnap(constrained, placement.pane, options, adapter)
  const slot = options?.snapToSlot
    ? resolveSlotAnchor(snapped?.x ?? constrained.x, coordinates)
    : null
  if (options?.snapToSlot && slot === null) return null

  const x = slot?.x ?? snapped?.x ?? constrained.x
  const y = snapped?.y ?? constrained.y
  const anchor = screenToAnchor(x, y, placement.pane.paneId, adapter)
  if (!anchor) return null
  return {
    ...applyCandidate(anchor, snapped?.candidate ?? null),
    ...(slot === null ? {} : { time: slot.time }),
    paneId: placement.pane.paneId,
    x,
    y,
    snap: snapped?.candidate ?? null,
  }
}

/**
 * 当前周期最近槽位的屏幕位置与开盘时间。
 *
 * 创建与拖动单个锚点只保存该槽位的时间；未来槽位的时间由公共坐标服务按
 * 常规槽距推算，和跨周期显示共用同一规则。
 */
function resolveSlotAnchor(
  x: number,
  coordinates: FrameCoordinates,
): { x: number; time: number } | null {
  const index = coordinates.xToSlot(x)
  if (index === null) return null
  const slotX = coordinates.logicalToX(index)
  const time = coordinates.slotToTime(index)
  return slotX === null || time === null ? null : { x: slotX, time }
}

/** 把 client 坐标换算成落点所在 Pane 的局部坐标；出界钳制与严格落点共用同一入口。 */
function resolvePointerPlacement(
  pointer: PointerCoordinates,
  container: HTMLElement,
  viewport: { plotWidth: number; plotHeight: number },
  adapter: DrawingViewportPort,
  clampPaneId?: string,
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
  coordinates: FrameCoordinates,
  dataLength: number,
  options: ResolveDrawingPointerOptions | undefined,
): Point | null {
  const locked = options?.angleLock
    ? lockAngle(options.angleLock.origin, { x: placement.x, y: placement.y })
    : { x: placement.x, y: placement.y }
  if (!options?.clampDataEnd) return locked
  const lastX = coordinates.logicalToX(dataLength - 1)
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
 * 候选提供时间时，直接使用该真实 Bar 的稳定时间。
 */
function applyCandidate(
  anchor: ResolvedInteractionAnchor,
  candidate: SnapCandidate | null,
): ResolvedInteractionAnchor {
  if (candidate === null) return anchor
  if (candidate.time !== null) {
    return { ...anchor, time: candidate.time, price: candidate.price ?? anchor.price }
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
