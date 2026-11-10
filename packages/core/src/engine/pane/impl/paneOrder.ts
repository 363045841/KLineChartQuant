/** 窗格相对排序规则：只在可见副图之间寻找相邻位置，不改变主图身份。 */
import { MAIN_PANE_ID, type PaneSpec } from '../types.js'

/** 返回相邻副图在完整布局中的索引；没有可移动目标时返回 null。 */
export function resolvePaneMoveIndex(
  panes: ReadonlyArray<PaneSpec>,
  paneId: string,
  direction: 'up' | 'down',
): number | null {
  const movable = panes.filter((pane) => pane.id !== MAIN_PANE_ID && pane.visible !== false)
  const index = movable.findIndex((pane) => pane.id === paneId)
  if (index < 0) return null
  const neighbour = movable[index + (direction === 'up' ? -1 : 1)]
  return neighbour ? panes.findIndex((pane) => pane.id === neighbour.id) : null
}
