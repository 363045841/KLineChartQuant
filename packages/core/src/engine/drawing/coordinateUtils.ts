import type { DrawingChartAdapter } from '../../controllers/types'
import type { DrawingAnchor } from '../../plugin'
import { getPhysicalKLineConfig } from '../utils/klineConfig'

// ---- Types ----

/** 原始锚点输入（逻辑坐标：K线索引 + 价格） */
export interface DrawingAnchorInput {
  /** K线柱逻辑索引（可以是小数，表示在两柱之间） */
  index: number
  /** 对应的时间戳（ms） */
  time?: number
  /** 价格 */
  price: number
}

// ---- Coordinate conversion ----

/**
 * 将图元锚点的逻辑坐标（index + price）转换为屏幕坐标（px）。
 *
 * 计算过程：
 * 1. 通过 getPhysicalKLineConfig 获取 K 线柱的起始像素位置和单柱像素宽度
 * 2. anchor.index × unitPx 得到距起始位置的偏移
 * 3. 减去 viewport.scrollLeft 得到相对视口的 X
 * 4. 通过 adapter.priceToY 将价格转为 Y
 *
 * @returns {x, y} 屏幕坐标（px），viewport 不可用时返回 null
 */
export function anchorToScreen(
  anchor: DrawingAnchor,
  adapter: DrawingChartAdapter,
): { x: number; y: number } | null {
  const viewport = adapter.getViewport()
  if (!viewport) return null

  const { kWidth, kGap } = adapter.getKWidthKGap()
  const dpr = adapter.getCurrentDpr()
  const { startXPx, unitPx } = getPhysicalKLineConfig(kWidth, kGap, dpr)
  if (!Number.isFinite(anchor.index)) return null

  const x = (startXPx + anchor.index * unitPx + (unitPx - 1) / 2) / dpr - viewport.scrollLeft
  const y = adapter.priceToY('main', anchor.price)
  return { x, y }
}

/**
 * 将屏幕坐标（px）反向解析为逻辑锚点坐标（index + price）。
 *
 * 用于拖拽整线时的屏幕偏移量回算。
 *
 * @returns DrawingAnchorInput，viewport 不可用或索引不在数据范围内时返回 null
 */
export function screenToAnchor(
  screenX: number,
  screenY: number,
  adapter: DrawingChartAdapter,
): DrawingAnchorInput | null {
  const data = adapter.getData()
  const viewport = adapter.getViewport()
  if (!viewport || data.length === 0) return null

  const logicalIndex = adapter.getLogicalIndexAtX(screenX)
  if (logicalIndex === null) return null

  const paneInfo = adapter.getPaneInfo('main')
  if (!paneInfo) return null

  const timestamp = adapter.getTimestampAtLogicalIndex(logicalIndex) ?? undefined

  return {
    index: logicalIndex,
    time: timestamp ?? undefined,
    price: adapter.yToPrice('main', screenY - paneInfo.top),
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
 * @returns DrawingAnchorInput，超出范围或数据不可用时返回 null
 */
export function resolveAnchorFromPointer(
  e: PointerEvent,
  container: HTMLElement,
  adapter: DrawingChartAdapter,
): DrawingAnchorInput | null {
  const data = adapter.getData()
  const viewport = adapter.getViewport()
  if (!viewport || data.length === 0) return null

  const rect = container.getBoundingClientRect()
  const mouseX = e.clientX - rect.left
  const mouseY = e.clientY - rect.top
  if (mouseX < 0 || mouseY < 0 || mouseX > viewport.plotWidth || mouseY > viewport.plotHeight) {
    return null
  }

  const paneInfo = adapter.getPaneInfo('main')
  if (!paneInfo) return null
  if (mouseY < paneInfo.top || mouseY > paneInfo.top + paneInfo.height) return null

  const logicalIndex = adapter.getLogicalIndexAtX(mouseX)
  if (logicalIndex === null) return null
  const timestamp = adapter.getTimestampAtLogicalIndex(logicalIndex) ?? undefined

  return {
    index: logicalIndex,
    time: timestamp ?? undefined,
    price: adapter.yToPrice('main', mouseY - paneInfo.top),
  }
}

// ---- Geometry ----

/**
 * 计算点 P 到线段 AB 的最短距离。
 * 投影点在 AB 线段外时取最近端点距离。
 */
export function pointToSegmentDist(
  px: number,
  py: number,
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(px - a.x, py - a.y)

  let t = ((px - a.x) * dx + (py - a.y) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy))
}
