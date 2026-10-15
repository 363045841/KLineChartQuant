/** 按图例领域能力生成按钮集合与状态，DOM 不决定业务能力。 */
import { MAIN_PANE_ID } from '@/engine/pane/types.js'
import type { LegendActionButton, LegendEntry } from '../types.js'

/** 比较品种只支持显隐与删除；指标按编辑脚本、设置、替换、显隐、关闭排序，副图额外保留排序。 */
export function projectLegendActions(
  entry: LegendEntry,
  paneOrder: ReadonlyArray<string>,
  isScriptIndicator: (definitionId: string) => boolean,
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
    ...projectMoveButtons(entry, paneOrder),
    ...(isScriptIndicator(entry.definitionId)
      ? [{ action: 'edit-code' as const, label: '编辑脚本', enabled: true }]
      : []),
    { action: 'settings', label: '指标设置', enabled: true },
    { action: 'replace', label: '更换指标', enabled: true },
    visibility,
    close,
  ]
}

/** 主图指标没有排序行为，不生成上移/下移按钮；副图按 Pane 顺序给出边界状态。 */
function projectMoveButtons(
  entry: Extract<LegendEntry, { kind: 'indicator' }>,
  paneOrder: ReadonlyArray<string>,
): LegendActionButton[] {
  if (entry.paneId === MAIN_PANE_ID) return []
  const order = paneOrder.filter((id) => id !== MAIN_PANE_ID)
  const index = order.indexOf(entry.paneId)
  return [
    { action: 'move-up', label: '上移指标', enabled: index > 0 },
    { action: 'move-down', label: '下移指标', enabled: index >= 0 && index < order.length - 1 },
  ]
}
