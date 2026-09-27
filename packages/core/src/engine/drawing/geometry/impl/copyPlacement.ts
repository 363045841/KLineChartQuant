/** 复制落点策略：整组按屏幕位移平移，靠近边缘时统一反向，不修改原图元。 */

import type { DrawingViewportPort } from '@/controllers/types.js'
import type { ScreenDrawingAnchor } from '@/foundation/plugin/index.js'
import type { DrawingObject, PersistedDrawingAnchor } from '../../types.js'
import { anchorToScreen, screenToAnchor } from './coordinateUtils.js'

const COPY_TIME_OFFSET_PX = 16
const COPY_PRICE_OFFSET_PX = 48

/** 比较正反两个方向的出界量，选择更能留在可视区域内的共同位移。 */
function chooseOffset(
  positions: ReadonlyArray<{ value: number; limit: number }>,
  offset: number,
): number {
  const overflow = (delta: number) =>
    positions.reduce((total, { value, limit }) => {
      const next = value + delta
      return total + Math.max(0, -next) + Math.max(0, next - limit)
    }, 0)
  return overflow(offset) <= overflow(-offset) ? offset : -offset
}

/** 横向偏移取接近 16px 的整槽位距离，避免宽 K 线下副本原地重叠。 */
function getTimeOffset(screenX: number, adapter: DrawingViewportPort): number | null {
  const index = adapter.getLogicalIndexAtX(screenX)
  if (index === null) return null
  const nextX = adapter.getScreenXAtLogicalIndex(index + 1)
  if (nextX === null) return null
  const step = nextX - screenX
  if (!Number.isFinite(step) || step <= 0) return null
  return Math.max(1, Math.round(COPY_TIME_OFFSET_PX / step)) * step
}

/** 转换单个锚点，水平线只改价格，垂直线只改时间；不可解析时返回 null。 */
function offsetAnchor(
  anchor: PersistedDrawingAnchor,
  screen: ScreenDrawingAnchor,
  paneId: string,
  dx: number,
  dy: number,
  adapter: DrawingViewportPort,
): PersistedDrawingAnchor | null {
  if (screen.type === 'horizontal') {
    const price = adapter.yToPrice(paneId, screen.y + dy)
    return Number.isFinite(price) ? { ...anchor, price } : null
  }
  const resolved = screenToAnchor(
    screen.x + dx,
    screen.type === 'point' ? screen.y + dy : 0,
    paneId,
    adapter,
  )
  if (!resolved || !Number.isFinite(resolved.price)) return null
  return {
    ...anchor,
    time: resolved.time,
    futureOffset: resolved.futureOffset,
    price: screen.type === 'vertical' ? anchor.price : resolved.price,
  }
}

/** 先解析全部落点，再返回复制计划；任一图元不可投影时整批不复制。 */
export function resolveCopyPlacements(
  drawings: ReadonlyArray<DrawingObject>,
  adapter: DrawingViewportPort,
): ReadonlyArray<{ id: string; anchors: ReadonlyArray<PersistedDrawingAnchor> }> {
  const viewport = adapter.getViewport()
  if (!viewport || drawings.length === 0) return []
  const projected: Array<{ drawing: DrawingObject; screens: ScreenDrawingAnchor[] }> = []
  const xs: Array<{ value: number; limit: number }> = []
  const ys: Array<{ value: number; limit: number }> = []
  for (const drawing of drawings) {
    const pane = adapter.getPaneInfo(drawing.paneId)
    if (!pane) return []
    const screens: ScreenDrawingAnchor[] = []
    for (const anchor of drawing.anchors) {
      const screen = anchorToScreen(anchor, drawing.paneId, adapter)
      if (!screen) return []
      if (screen.type !== 'horizontal') xs.push({ value: screen.x, limit: viewport.plotWidth })
      if (screen.type !== 'vertical') ys.push({ value: screen.y, limit: pane.height })
      screens.push(screen)
    }
    projected.push({ drawing, screens })
  }
  const timeOffset = xs.length > 0 ? getTimeOffset(xs[0]!.value, adapter) : 0
  if (timeOffset === null) return []
  const dx = chooseOffset(xs, timeOffset)
  const dy = chooseOffset(ys, COPY_PRICE_OFFSET_PX)
  const placements: Array<{ id: string; anchors: PersistedDrawingAnchor[] }> = []
  for (const { drawing, screens } of projected) {
    const anchors: PersistedDrawingAnchor[] = []
    for (const [index, anchor] of drawing.anchors.entries()) {
      const moved = offsetAnchor(anchor, screens[index]!, drawing.paneId, dx, dy, adapter)
      if (!moved) return []
      anchors.push(moved)
    }
    placements.push({ id: drawing.id, anchors })
  }
  return placements
}
