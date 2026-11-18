/** 验证工具锚点数与种类声明一致：绘图工具都有数量，非绘图工具返回 null。 */
import { describe, expect, it } from 'vitest'
import { getDrawingInputAnchorCount } from '../../model/impl/materializeAnchors'
import { getAnchorCountForTool, getDrawingKind } from '../impl/toolConfig'
import type { DrawingToolId } from '../types'
import { BOX_SELECT_DRAWING_TOOL_ID, CURSOR_DRAWING_TOOL_ID, DrawingTool } from '../types'

describe('toolConfig anchor counts', () => {
  it('绘图工具的锚点数等于所属种类声明的输入锚点数', () => {
    const tools: DrawingToolId[] = Object.values(DrawingTool)
    const drawingTools = tools.filter(
      (tool) => tool !== CURSOR_DRAWING_TOOL_ID && tool !== BOX_SELECT_DRAWING_TOOL_ID,
    )
    expect(drawingTools.length).toBeGreaterThan(0)
    for (const tool of drawingTools) {
      expect(getAnchorCountForTool(tool)).toBe(getDrawingInputAnchorCount(getDrawingKind(tool)))
    }
  })

  it('非绘图工具没有锚点数', () => {
    expect(getAnchorCountForTool(CURSOR_DRAWING_TOOL_ID)).toBeNull()
    expect(getAnchorCountForTool(BOX_SELECT_DRAWING_TOOL_ID)).toBeNull()
  })
})
