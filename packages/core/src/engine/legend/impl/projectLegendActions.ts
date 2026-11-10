/** 按图例领域能力生成按钮集合与状态，DOM 不决定业务能力。 */

import { resolvePaneMoveIndex } from '@/engine/pane/impl/paneOrder.js'
import { MAIN_PANE_ID, type PaneSpec } from '@/engine/pane/types.js'
import type { LegendActionButton, LegendEntry } from '../types.js'

/**
 * 生成按钮集合；主图与副图共用同一套动作，排序按所属 Pane 的实例顺序。
 *
 * @param entry 图例条目
 * @param paneInstances 每个 Pane 内的实例顺序
 * @param isScriptIndicator 是否脚本指标（决定代码编辑入口）
 */
export function projectLegendActions(
  entry: LegendEntry,
  paneInstances: ReadonlyMap<string, ReadonlyArray<string>>,
  isScriptIndicator: (definitionId: string) => boolean,
  panes: ReadonlyArray<PaneSpec>,
): ReadonlyArray<LegendActionButton> {
  if (entry.kind === 'custom') return []
  const comparison = entry.kind === 'comparison'
  const visibility: LegendActionButton = {
    action: 'toggle-visibility',
    label: entry.hidden
      ? comparison
        ? '显示比较品种'
        : '显示指标'
      : comparison
        ? '隐藏比较品种'
        : '隐藏指标',
    enabled: true,
  }
  const close: LegendActionButton = {
    action: 'close',
    label: comparison ? '删除比较品种' : '关闭指标',
    enabled: true,
  }
  if (comparison) return [visibility, close]
  return [
    ...(entry.paneId === MAIN_PANE_ID
      ? []
      : [
          {
            action: 'move-pane-up' as const,
            label: '上移副图',
            enabled: resolvePaneMoveIndex(panes, entry.paneId, 'up') !== null,
          },
          {
            action: 'move-pane-down' as const,
            label: '下移副图',
            enabled: resolvePaneMoveIndex(panes, entry.paneId, 'down') !== null,
          },
        ]),
    ...projectMoveButtons(entry, paneInstances.get(entry.paneId) ?? []),
    ...(isScriptIndicator(entry.definitionId)
      ? [{ action: 'edit-code' as const, label: '编辑脚本', enabled: true }]
      : []),
    { action: 'settings', label: '指标设置', enabled: true },
    { action: 'move-to', label: '移动指标', enabled: true },
    { action: 'replace', label: '更换指标', enabled: true },
    visibility,
    close,
  ]
}

/** 同一 Pane 内按实例顺序给出边界状态；主图与副图没有分支。 */
function projectMoveButtons(
  entry: Extract<LegendEntry, { kind: 'indicator' }>,
  instanceIds: ReadonlyArray<string>,
): LegendActionButton[] {
  if (instanceIds.length < 2) return []
  const index = instanceIds.indexOf(entry.id)
  return [
    { action: 'move-up', label: '上移指标', enabled: index > 0 },
    {
      action: 'move-down',
      label: '下移指标',
      enabled: index >= 0 && index < instanceIds.length - 1,
    },
  ]
}
