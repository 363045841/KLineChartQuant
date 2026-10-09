/** 按图例领域能力生成按钮集合与状态，DOM 不决定业务能力。 */
import { MAIN_PANE_ID } from '@/engine/pane/types.js'
import type { LegendActionButton, LegendEntry } from '../types.js'

/** 比较品种只支持显隐与删除；指标支持排序、替换、设置与关闭。 */
export function projectLegendActions(
  entry: LegendEntry,
  entries: ReadonlyArray<LegendEntry>,
  paneOrder: ReadonlyArray<string>,
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
  const order =
    entry.paneId === MAIN_PANE_ID
      ? entries
          .filter((item) => item.kind === 'indicator' && item.paneId === MAIN_PANE_ID)
          .map((item) => item.id)
      : paneOrder.filter((id) => id !== MAIN_PANE_ID)
  const index = order.indexOf(entry.paneId === MAIN_PANE_ID ? entry.id : entry.paneId)
  return [
    { action: 'move-up', label: '上移指标', enabled: index > 0 },
    { action: 'move-down', label: '下移指标', enabled: index >= 0 && index < order.length - 1 },
    { action: 'replace', label: '更换指标', enabled: true },
    visibility,
    { action: 'settings', label: '指标设置', enabled: true },
    close,
  ]
}
