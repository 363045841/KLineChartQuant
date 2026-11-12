/**
 * 绘图投影器：合并 kernel 业务 SSOT 与会话层 overlay，供渲染插件读取。
 */

import { isDrawingInteractive } from '@363045841yyt/klinechart-plot-contracts'
import { filterDrawingsInScope } from '../../model/impl/drawingScope.js'
import type { PaneDrawingScope } from '../../model/types.js'
import { mergePaint } from '../../session/impl/DrawingSessionOverlay.js'
import type { DrawingObject } from '../../types.js'
import type { DrawingPaintScope, DrawingSource, DrawingStoreDeps } from '../types.js'

/** 绘图投影器 —— kernel 业务 SSOT ⊕ 会话 overlay，供渲染插件读取。 */
export class DrawingStore {
  /** 正式层可见列表缓存；图元集合未变时复用过滤与排序结果。 */
  private committedVisibleCache: {
    readonly indicators: readonly DrawingObject[]
    readonly drawings: readonly DrawingObject[]
    readonly paneId: string
    readonly workspaceId: PaneDrawingScope['workspaceId']
    readonly symbolKey: PaneDrawingScope['symbolKey']
    readonly period: PaneDrawingScope['period']
    readonly source: DrawingSource
    readonly value: DrawingObject[]
  } | null = null

  constructor(private readonly deps: DrawingStoreDeps) {}

  /** 当前选中的绘图 id 快照。 */
  getSelectedIds(): ReadonlyArray<string> {
    const interactiveIds = new Set(
      this.deps.drawings$
        .peek()
        .filter(isDrawingInteractive)
        .map((drawing) => drawing.id),
    )
    return this.deps.selectedDrawingIds$.peek().filter((id) => interactiveIds.has(id))
  }

  /** kernel 已提交图元叠加会话层 overlay 后的绘制列表。 */
  private paintList(): DrawingObject[] {
    const committed = this.deps.drawings$.peek()
    const overlay = this.deps.getOverlay?.() ?? []
    return [...this.indicatorDrawings(), ...mergePaint(committed, overlay)]
  }

  /** 指标图元只参与绘制，不进入用户文档、选择和历史。 */
  private indicatorDrawings(): readonly DrawingObject[] {
    return this.deps.getIndicatorDrawings ? this.deps.getIndicatorDrawings() : []
  }

  /** 返回全部绘制对象（含 overlay）。 */
  getAll(): DrawingObject[] {
    return this.paintList()
  }

  /** 正式层仅在文档、选中集合或覆盖成员变化时失效，移动坐标不使其失效。 */
  getCommittedPaintVersion(): readonly unknown[] {
    return [
      this.deps.drawings$.peek(),
      this.deps.selectedDrawingIds$.peek(),
      ...(this.deps.getOverlay?.() ?? []).map((drawing) => drawing.id),
    ]
  }

  /**
   * 返回作用域内可见的绘制对象，按 zIndex 升序。
   *
   * source 把指标输出与用户文档分开：指标图元走 main 目标，用户图元才需要
   * 独立 drawing 画布。会话覆盖只属于用户文档，指标没有 session 投影。
   */
  getVisibleByPane(
    scope: PaneDrawingScope,
    paintScope: DrawingPaintScope = 'all',
    source: DrawingSource = 'all',
  ): DrawingObject[] {
    const indicators = source === 'user' ? [] : this.indicatorDrawings()
    const overlay = source === 'indicator' ? [] : (this.deps.getOverlay?.() ?? [])
    const committed = source === 'indicator' ? [] : this.deps.drawings$.peek()
    if (paintScope === 'committed' && overlay.length === 0) {
      const cached = this.committedVisibleCache
      if (
        cached !== null &&
        cached.indicators === indicators &&
        cached.drawings === committed &&
        cached.paneId === scope.paneId &&
        cached.workspaceId === scope.workspaceId &&
        cached.symbolKey === scope.symbolKey &&
        cached.period === scope.period &&
        cached.source === source
      )
        return cached.value
      const value = filterDrawingsInScope([...indicators, ...committed], scope)
        .filter((drawing) => drawing.visible)
        .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
      this.committedVisibleCache = {
        indicators,
        drawings: committed,
        paneId: scope.paneId,
        workspaceId: scope.workspaceId,
        symbolKey: scope.symbolKey,
        period: scope.period,
        source,
        value,
      }
      return value
    }
    const overriddenIds = new Set(overlay.map((drawing) => drawing.id))
    const drawings =
      paintScope === 'session'
        ? overlay
        : paintScope === 'committed'
          ? [...indicators, ...committed.filter((drawing) => !overriddenIds.has(drawing.id))]
          : [...indicators, ...mergePaint(committed, overlay)]
    return filterDrawingsInScope(drawings, scope)
      .filter((drawing) => drawing.visible)
      .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
  }
}
