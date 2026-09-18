// 绘图坐标换算模块：负责锚点逻辑坐标（时间戳 + 价格）与屏幕坐标（px）的双向换算，
// 并提供从 PointerEvent 解析落点锚点的 resolveDrawingPointer（可选 OHLC 磁吸）。
// 磁吸只作用于落点/预览路径，命中、框选等只读路径不得传入 magnet 以免范围漂移。
// 另含点线距离等几何工具。

import type { DrawingViewportPort } from '../../controllers/types.js'
import type {
  PersistedDrawingAnchor,
  ScreenDrawingAnchor,
  ScreenPoint,
} from '../../foundation/plugin/index.js'
import type { MagnetSnapConfig } from './magnetSnapper.js'
import { snapPointerToOhlc } from './magnetSnapper.js'

// ---- Types ----

/** 原始锚点输入（逻辑坐标：时间戳 + 价格） */
export interface InteractionDrawingAnchor {
  /** 对应的时间戳（ms）；未来槽位时为创建时最后一根 K 线的时间。 */
  time?: number
  /** 基准 K 线之后的未来时间轴槽位数。 */
  futureOffset?: number
  /** 价格 */
  price: number
}

/** 由屏幕坐标反解析出的逻辑锚点(时间戳 + 价格)，time 已确定为时间戳；解析失败整体返回 null，不会进入该类型。 */
export interface ResolvedInteractionAnchor extends InteractionDrawingAnchor {
  /** 对应的时间戳（ms），必填。 */
  time: number
}

/** 指针命中 Pane 后解析出的完整绘图锚点。 */
export interface DrawingPointerAnchor extends ResolvedInteractionAnchor {
  paneId: string
  x: number
  y: number
}

// ---- Coordinate conversion ----

/**
 * 将图元锚点转换为指定 Pane 内的屏幕坐标（px）。
 *
 * 计算过程：
 * 1. 通过 adapter 将锚点时间戳解析为当前逻辑索引
 * 2. 通过本帧已封存的中心点取得 X（分时与 K 线共用同一映射）
 * 3. 通过 adapter.priceToY 按锚点所属 Pane 将价格转为局部 Y
 *
 * @returns 按锚点类型返回点、水平或垂直投影；时间戳无法解析或视图未就绪时返回 null
 */
export function anchorToScreen(
  anchor: PersistedDrawingAnchor,
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
  const x = adapter.getScreenXAtLogicalIndex(index)
  if (x === null) return null
  if (anchor.type === 'vertical') return { type: 'vertical', x }
  return { type: 'point', x, y: adapter.priceToY(paneId, anchor.price) }
}

/** 判断投影是否为同时具有 X/Y 的普通点。 */
export function isScreenPoint(
  anchor: ScreenDrawingAnchor | null,
): anchor is { type: 'point' } & ScreenPoint {
  return anchor?.type === 'point'
}

/**
 * 将屏幕坐标（px）反向解析为逻辑锚点坐标（index + price）。
 *
 * 用于拖拽整线时的屏幕偏移量回算。
 *
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

/** 指针位置的最小形状：只需 client 坐标，便于用缓存的指针位置重算命中。 */
export interface PointerCoordinates {
  clientX: number
  clientY: number
}

/** resolveDrawingPointer 的可选行为配置。 */
export interface ResolveDrawingPointerOptions {
  /**
   * OHLC 磁吸配置：在坐标反解析前把指针吸附到最近 K 线的价格极值。
   * 仅允许绘图落点/预览路径传入；cursor 命中、框选、标签等路径不得传入，
   * 否则点选命中与框选范围会随吸附漂移。
   */
  magnet?: MagnetSnapConfig
}

/**
 * 从指针位置解析出光标对应的逻辑锚点。
 *
 * 边界检测：
 * - 鼠标超出 viewport.plotWidth / plotHeight → null
 * - 鼠标不在 main pane 范围内 → null
 * - 鼠标位置无对应时间轴槽位 → null
 *
 * 传入 magnet 配置时，吸附发生在 screenToAnchor 之前（改写局部 x/y），
 * 返回的锚点与 x/y 均为吸附后的值。
 *
 * @returns DrawingPointerAnchor，超出范围或数据不可用时返回 null
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

  const rect = container.getBoundingClientRect()
  const mouseX = pointer.clientX - rect.left
  const mouseY = pointer.clientY - rect.top
  if (mouseX < 0 || mouseY < 0 || mouseX > viewport.plotWidth || mouseY > viewport.plotHeight) {
    return null
  }

  const pane = adapter.getPaneAtY(mouseY)
  if (!pane) return null

  // 磁吸只改写局部坐标，不影响 pane 判定（吸附基准仍取指针原始所在 Pane）。
  let x = mouseX
  let y = mouseY - pane.top
  if (options?.magnet) {
    const snapped = snapPointerToOhlc(mouseX, mouseY, pane, adapter, options.magnet)
    if (snapped) {
      x = snapped.x
      y = snapped.y - pane.top
    }
  }

  const anchor = screenToAnchor(x, y, pane.paneId, adapter)
  return anchor ? { ...anchor, paneId: pane.paneId, x, y } : null
}

// ---- Geometry ----

/** 两点连线的中点。 */
export function midpoint(a: ScreenPoint, b: ScreenPoint): ScreenPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

/**
 * 计算点 P 到线段 AB 的最短距离平方。
 * 投影点在 AB 线段外时取最近端点距离。
 */
export function pointToSegmentDistanceSq(
  px: number,
  py: number,
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  const pointDx = px - a.x
  const pointDy = py - a.y
  if (lenSq === 0) return pointDx * pointDx + pointDy * pointDy

  let t = (pointDx * dx + pointDy * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  const nearestDx = px - (a.x + t * dx)
  const nearestDy = py - (a.y + t * dy)
  return nearestDx * nearestDx + nearestDy * nearestDy
}
