import type { DrawingChartAdapter } from '../../controllers/types'
import type { PersistedDrawingAnchor } from '../../foundation/plugin/index'

// ---- Types ----

/** 原始锚点输入（逻辑坐标：时间戳 + 价格） */
export interface InteractionDrawingAnchor {
  /** 对应的时间戳（ms） */
  time?: number
  /** 价格 */
  price: number
}

/** 指针命中 Pane 后解析出的完整绘图锚点。 */
export interface DrawingPointerAnchor extends InteractionDrawingAnchor {
  paneId: string
  x: number
  y: number
}

// ---- Coordinate conversion ----

/**
 * 将图元锚点的时间坐标转换为指定 Pane 内的屏幕坐标（px）。
 *
 * 计算过程：
 * 1. 通过 adapter 将锚点时间戳解析为当前逻辑索引
 * 2. 通过本帧已封存的中心点取得 X（分时与 K 线共用同一映射）
 * 3. 通过 adapter.priceToY 按锚点所属 Pane 将价格转为局部 Y
 *
 * @returns {x, y} 屏幕坐标（px），时间戳无法解析或视图未就绪时返回 null
 */
export function anchorToScreen(
  anchor: PersistedDrawingAnchor,
  paneId: string,
  adapter: DrawingChartAdapter,
): { x: number; y: number } | null {
  const timestamp = typeof anchor.time === 'string' ? Date.parse(anchor.time) : anchor.time
  // horizontal-line 仅由价格定义，没有时间锚点；端点保持在视口外以避免显示控制点。
  if (timestamp === undefined || !Number.isFinite(timestamp)) {
    return { x: -adapter.getKWidthKGap().kWidth, y: adapter.priceToY(paneId, anchor.price) }
  }
  const index = adapter.getLogicalIndexAtTimestamp(timestamp)
  if (index === null) return null
  const x = adapter.getScreenXAtLogicalIndex(index)
  return x === null ? null : { x, y: adapter.priceToY(paneId, anchor.price) }
}

/**
 * 将屏幕坐标（px）反向解析为逻辑锚点坐标（index + price）。
 *
 * 用于拖拽整线时的屏幕偏移量回算。
 *
 * @returns InteractionDrawingAnchor，viewport 不可用或索引不在数据范围内时返回 null
 */
export function screenToAnchor(
  screenX: number,
  paneY: number,
  paneId: string,
  adapter: DrawingChartAdapter,
): InteractionDrawingAnchor | null {
  const data = adapter.getDrawingData()
  const viewport = adapter.getViewport()
  if (!viewport || data.length === 0) return null

  const logicalIndex = adapter.getLogicalIndexAtX(screenX)
  if (logicalIndex === null) return null

  const paneInfo = adapter.getPaneInfo(paneId)
  if (!paneInfo) return null

  const timestamp = adapter.getDrawingTimestampAtLogicalIndex(logicalIndex) ?? undefined

  return {
    time: timestamp ?? undefined,
    price: adapter.yToPrice(paneId, paneY),
  }
}

/**
 * 从 PointerEvent 中解析出光标位置对应的逻辑锚点。
 *
 * 边界检测：
 * - 鼠标超出 viewport.plotWidth / plotHeight → null
 * - 鼠标不在 main pane 范围内 → null
 * - 鼠标位置无对应 K 线索引 → null
 *
 * @returns InteractionDrawingAnchor，超出范围或数据不可用时返回 null
 */
export function resolveDrawingPointer(
  e: PointerEvent,
  container: HTMLElement,
  adapter: DrawingChartAdapter,
): DrawingPointerAnchor | null {
  const data = adapter.getDrawingData()
  const viewport = adapter.getViewport()
  if (!viewport || data.length === 0) return null

  const rect = container.getBoundingClientRect()
  const mouseX = e.clientX - rect.left
  const mouseY = e.clientY - rect.top
  if (mouseX < 0 || mouseY < 0 || mouseX > viewport.plotWidth || mouseY > viewport.plotHeight) {
    return null
  }

  const pane = adapter.getPaneAtY(mouseY)
  if (!pane) return null
  const y = mouseY - pane.top
  const anchor = screenToAnchor(mouseX, y, pane.paneId, adapter)
  return anchor ? { ...anchor, paneId: pane.paneId, x: mouseX, y } : null
}

// ---- Geometry ----

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
