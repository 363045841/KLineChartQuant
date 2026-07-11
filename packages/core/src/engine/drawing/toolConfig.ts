import { KLineChartError } from '../../errors'
import type { DrawingKind } from '../../foundation/plugin/index'

// ---- Tool ID type ----

/**
 * 所有支持的绘图工具 ID。
 * UI 层通过 setTool(toolId) 切换工具，cursor 表示选择/交互模式。
 */
export type DrawingToolId =
  | 'cursor'
  | 'trend-line'
  | 'ray'
  | 'h-line'
  | 'h-ray'
  | 'v-line'
  | 'crosshair-line'
  | 'info-line'
  | 'parallel-channel'
  | 'regression-channel'
  | 'flat-line'
  | 'disjoint-channel'

// ---- Tool grouping ----
// 按所需锚点数量分组：1 个锚点（水平/垂直线）、2 个锚点（趋势线）、3 个锚点（通道线）。
// 新增工具类型时，加到对应数组即可，无需改其他模块。

/** 单锚点工具：点击一次即创建完成 */
export const SINGLE_ANCHOR_TOOLS: readonly DrawingToolId[] = [
  'h-line',
  'h-ray',
  'v-line',
  'crosshair-line',
]

/** 双锚点工具：需要两次点击才能完成 */
export const DOUBLE_ANCHOR_TOOLS: readonly DrawingToolId[] = [
  'trend-line',
  'ray',
  'info-line',
  'regression-channel',
]

/** 三锚点工具：需要三次点击才能完成 */
export const TRIPLE_ANCHOR_TOOLS: readonly DrawingToolId[] = [
  'parallel-channel',
  'flat-line',
  'disjoint-channel',
]

/** 返回工具所需的锚点数量（cursor 返回 null） */
export function getAnchorCountForTool(toolId: DrawingToolId): 1 | 2 | 3 | null {
  if (SINGLE_ANCHOR_TOOLS.includes(toolId as any)) return 1
  if (DOUBLE_ANCHOR_TOOLS.includes(toolId as any)) return 2
  if (TRIPLE_ANCHOR_TOOLS.includes(toolId as any)) return 3
  return null
}

// ---- Kind mapping ----
// toolId（UI 概念） → DrawingKind（引擎定义概念）。
// 大部分 toolId 与 kind 同名，h-line → horizontal-line 等少数需要映射。

/** 将 toolId 映射为引擎识别的 DrawingKind */
export function getDrawingKind(toolId: DrawingToolId): DrawingKind {
  switch (toolId) {
    case 'cursor':
      throw new KLineChartError('INVALID_PARAM', 'cursor is not a drawing kind')
    case 'h-line':
      return 'horizontal-line'
    case 'h-ray':
      return 'horizontal-ray'
    case 'v-line':
      return 'vertical-line'
    case 'crosshair-line':
      return 'cross-line'
    default:
      return toolId
  }
}

// ---- Extend mode ----

/**
 * 返回图元的线段延伸模式。
 * ray → 向右延伸，extended-line → 两端延伸，其他 → 不延伸。
 */
export function getExtendMode(kind: DrawingKind): 'none' | 'left' | 'right' | 'both' {
  switch (kind) {
    case 'ray':
      return 'right'
    case 'extended-line':
      return 'both'
    default:
      return 'none'
  }
}

/** 所有带填充区域的通道类图元 kind 列表 */
export const CHANNEL_KINDS: readonly DrawingKind[] = [
  'parallel-channel',
  'regression-channel',
  'flat-line',
  'disjoint-channel',
]
