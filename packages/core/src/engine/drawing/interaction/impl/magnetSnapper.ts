// 绘图磁吸模块：把指针屏幕坐标吸附到最近 K 线的 OHLC 价格与 Bar 中心。
// 语义基准（对齐 TV 官方 Magnet Mode）：
// weak 档只吸 high/low（半径 8px），strong 档吸 OHLC 四值（半径 15px）；
// X 坐标在 Bar 中心可解析时始终吸附到该中心（与档位无关）。
// 纯函数、无副作用，仅经 resolveDrawingPointer 的可选参数在绘图模式路径生效。

import type { DrawingViewportPort, PaneLayoutInfo } from '../../../../controllers/types.js'
import type { MagnetSnapConfig, SnappedPoint } from '../types.js'

export type { ActiveMagnetMode, MagnetMode, MagnetSnapConfig, SnappedPoint } from '../types.js'

/** weak 档吸附半径（px）：仅 high/low 候选。 */
export const MAGNET_RADIUS_WEAK = 8
/** strong 档吸附半径（px）：OHLC 四值候选。 */
export const MAGNET_RADIUS_STRONG = 15

/**
 * 把指针坐标吸附到最近 K 线的 OHLC 值与 Bar 中心。
 *
 * 规则：
 * - 由 mouseX 解析逻辑索引并夹取到有效 Bar，取该 Bar 的候选价格；
 * - Y 在候选价格换算的屏幕距离内取最近者吸附，超出半径保持原值；
 * - X 在 Bar 中心可解析时吸附到中心，与 Y 是否命中无关；
 * - 完全无可吸附点（Bar 中心不可解析且 Y 无命中）返回 null，调用方用原始坐标。
 *
 * @param mouseX 容器局部 X 坐标（px）
 * @param mouseY 容器局部 Y 坐标（px）
 * @param pane 指针所在 Pane 布局信息
 * @param adapter 图表适配器，提供索引/坐标换算与 OHLC 数据
 * @param config 磁吸档位配置
 * @returns 吸附后的容器局部坐标；无任何吸附点时返回 null
 */
export function snapPointerToOhlc(
  mouseX: number,
  mouseY: number,
  pane: PaneLayoutInfo,
  adapter: DrawingViewportPort,
  config: MagnetSnapConfig,
): SnappedPoint | null {
  const data = adapter.getData()
  if (data.length === 0) return null

  const logicalIndex = adapter.getLogicalIndexAtX(mouseX)
  if (logicalIndex === null) return null
  const barIndex = Math.min(Math.max(Math.round(logicalIndex), 0), data.length - 1)
  const bar = data[barIndex]
  if (bar === undefined) return null

  // 候选价格按档位展开；遍历顺序保持固定优先级（同距离取先遍历者）。
  const candidates =
    config.mode === 'weak' ? [bar.high, bar.low] : [bar.high, bar.low, bar.open, bar.close]
  const radius = config.mode === 'weak' ? MAGNET_RADIUS_WEAK : MAGNET_RADIUS_STRONG
  const paneLocalY = mouseY - pane.top

  let bestY: number | null = null
  let bestDistance = radius
  for (const price of candidates) {
    const candidateY = adapter.priceToY(pane.paneId, price)
    const distance = Math.abs(candidateY - paneLocalY)
    if (distance <= bestDistance) {
      bestDistance = distance
      bestY = candidateY
    }
  }

  const snappedX = adapter.getScreenXAtLogicalIndex(barIndex)
  if (snappedX === null && bestY === null) return null

  return {
    x: snappedX ?? mouseX,
    y: bestY === null ? mouseY : pane.top + bestY,
  }
}
