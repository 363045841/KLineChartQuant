/** 首屏侧栏面板的选择：显式配置优先，否则沿用旧的「初始展开 Agent」开关。 */

import type { KlineWorkbenchPanelId } from '../types.js'

/**
 * 计算首次挂载要展开的侧栏面板。
 *
 * @param input.initialPanel 宿主显式指定的面板；省略时回落到旧开关
 * @param input.initialAgentPanelOpen 兼容旧 API 的「挂载即展开 Agent」
 * @returns 面板 id；不展开时返回 null（无效 id 由 SidePanelShell 再过滤一次）
 */
export function resolveInitialPanel(input: {
  readonly initialPanel?: KlineWorkbenchPanelId
  readonly initialAgentPanelOpen: boolean
}): KlineWorkbenchPanelId | null {
  if (input.initialPanel !== undefined) return input.initialPanel
  return input.initialAgentPanelOpen ? 'agent' : null
}
