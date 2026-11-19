/**
 * 新建 Pane 并执行迁移的组合命令。
 *
 * 新建 Pane 与迁移分属两个领域动作：调用方先建容器，再把对象放进去；
 * 迁移失败时必须回收刚建的空 Pane。这段生命周期只在这里写一次。
 */

import { batch } from '@/foundation/reactivity/signal.js'
import type { PanePlacement } from '../types.js'

/** 组合命令所需的最小 Pane 端口；命令面与门面都满足。 */
export interface PanePlacementPort {
  addPane(anchorPaneId: string, placement: PanePlacement): string | null
  /** 回收入口；不关心返回值，只需完成删除。 */
  removePane(paneId: string): void
}

/**
 * 在锚点旁新建 Pane，并在其中执行迁移。
 *
 * @param port Pane 新建与回收入口
 * @param anchorPaneId 锚点 Pane，必须已存在
 * @param placement 新 Pane 位于锚点的上方或下方
 * @param run 迁移动作；接收新 Pane 身份，返回是否成功
 * @returns 是否成功；任一步失败都不留下空 Pane
 */
export function runInNewPane(
  port: PanePlacementPort,
  anchorPaneId: string,
  placement: PanePlacement,
  run: (paneId: string) => boolean,
): boolean {
  return batch(() => {
    const paneId = port.addPane(anchorPaneId, placement)
    if (paneId === null) return false
    try {
      if (run(paneId)) return true
    } catch (error) {
      try {
        port.removePane(paneId)
      } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], 'Pane placement and rollback failed')
      }
      throw error
    }
    port.removePane(paneId)
    return false
  })
}
