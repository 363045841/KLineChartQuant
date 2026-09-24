/**
 * 绘图投影器：合并 kernel 业务 SSOT 与会话层 overlay，供渲染插件读取。
 */

import { ChartWorkspaceId } from '@/foundation/types/chartView.js'
import { mergePaint } from '../../session/impl/DrawingSessionOverlay.js'
import type { DrawingObject, DrawingWorkspaceId } from '../../types.js'
import type { DrawingStoreDeps } from '../types.js'

/** 绘图投影器 —— kernel 业务 SSOT ⊕ 会话 overlay，供渲染插件读取。 */
export class DrawingStore {
  constructor(private readonly deps: DrawingStoreDeps) {}

  /** 当前选中的绘图 id 快照。 */
  getSelectedIds(): ReadonlyArray<string> {
    return this.deps.selectedDrawingIds$.peek()
  }

  /** kernel 已提交图元叠加会话层 overlay 后的绘制列表。 */
  private paintList(): DrawingObject[] {
    const committed = this.deps.drawings$.peek()
    const overlay = this.deps.getOverlay?.() ?? []
    return mergePaint(committed, overlay)
  }

  /** 返回全部绘制对象（含 overlay）。 */
  getAll(): DrawingObject[] {
    return this.paintList()
  }

  /** 返回指定 Pane 与工作区下可见的绘制对象，按 zIndex 升序。 */
  getVisibleByPane(paneId: string, workspaceId: DrawingWorkspaceId): DrawingObject[] {
    return this.paintList()
      .filter(
        (drawing) =>
          drawing.visible &&
          drawing.paneId === paneId &&
          (drawing.workspaceId ?? ChartWorkspaceId.KLine) === workspaceId,
      )
      .slice()
      .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
  }
}
