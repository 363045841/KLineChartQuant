/** 绘图工具配置：工具 ID 到图元种类的映射；锚点数量统一取种类声明。 */
import { GENERIC_ERROR_CODES, KLineChartError } from '@/errors.js'
import { getDrawingInputAnchorCount } from '../../model/impl/materializeAnchors.js'
import type { DrawingKind } from '../../types.js'
import type { DrawingToolId } from '../types.js'
import { BOX_SELECT_DRAWING_TOOL_ID, CURSOR_DRAWING_TOOL_ID, DrawingTool } from '../types.js'

export type { DrawingToolId } from '../types.js'

/** 非绘图工具：没有图元种类，也没有锚点数。 */
const NON_DRAWING_TOOL_IDS: ReadonlySet<DrawingToolId> = new Set([
  CURSOR_DRAWING_TOOL_ID,
  BOX_SELECT_DRAWING_TOOL_ID,
])

/**
 * 返回工具所需的锚点数量；cursor、box-select 返回 null。
 *
 * 数量来自所属种类的声明，工具侧不再维护第二份分组表。
 */
export function getAnchorCountForTool(toolId: DrawingToolId): 1 | 2 | 3 | null {
  if (NON_DRAWING_TOOL_IDS.has(toolId)) return null
  return getDrawingInputAnchorCount(getDrawingKind(toolId))
}

// ---- Kind mapping ----
// toolId（UI 概念） → DrawingKind（引擎定义概念）。
// 大部分 toolId 与 kind 同名，h-line → horizontal-line 等少数需要映射。

/** 将 toolId 映射为引擎识别的 DrawingKind */
export function getDrawingKind(toolId: DrawingToolId): DrawingKind {
  switch (toolId) {
    case CURSOR_DRAWING_TOOL_ID:
      throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_PARAM, 'cursor is not a drawing kind')
    case BOX_SELECT_DRAWING_TOOL_ID:
      throw new KLineChartError(
        GENERIC_ERROR_CODES.INVALID_PARAM,
        'box-select is not a drawing kind',
      )
    case DrawingTool.HorizontalLine:
      return 'horizontal-line'
    case DrawingTool.HorizontalRay:
      return 'horizontal-ray'
    case DrawingTool.VerticalLine:
      return 'vertical-line'
    case DrawingTool.CrosshairLine:
      return 'cross-line'
    default:
      return toolId
  }
}
