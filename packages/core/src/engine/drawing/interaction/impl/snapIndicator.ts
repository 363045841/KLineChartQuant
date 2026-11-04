/**
 * 磁吸命中点的会话态映射：落点解析结果 → 渲染所需的 Pane 局部指示点。
 *
 * 绘制路径与拖拽路径共用这一处，避免两边各自拼一份坐标结构。
 */

import type { SnapCandidate } from '../../magnet/types.js'
import type { DrawingSnapIndicator } from '../types.js'

/** 落点 → 磁吸高亮指示；未命中或未开启磁吸时返回 null。 */
export function toSnapIndicator(
  pointer: { paneId: string; x: number; y: number; snap: SnapCandidate | null } | null,
): DrawingSnapIndicator | null {
  if (!pointer?.snap) return null
  return { paneId: pointer.paneId, x: pointer.x, y: pointer.y }
}
