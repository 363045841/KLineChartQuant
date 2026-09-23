/** 验证工具锚点数表行为与公共出口（controllers/drawing）可达。 */
import { describe, expect, it } from 'vitest'

import {
  DOUBLE_ANCHOR_TOOLS,
  getAnchorCountForTool,
  SINGLE_ANCHOR_TOOLS,
  TRIPLE_ANCHOR_TOOLS,
} from '../../../../controllers/index'

describe('toolConfig anchor tables public exports', () => {
  it('getAnchorCountForTool 按锚点数分组返回 1/2/3，非绘图工具返回 null', () => {
    expect(SINGLE_ANCHOR_TOOLS.map(getAnchorCountForTool)).toEqual(SINGLE_ANCHOR_TOOLS.map(() => 1))
    expect(DOUBLE_ANCHOR_TOOLS.map(getAnchorCountForTool)).toEqual(DOUBLE_ANCHOR_TOOLS.map(() => 2))
    expect(TRIPLE_ANCHOR_TOOLS.map(getAnchorCountForTool)).toEqual(TRIPLE_ANCHOR_TOOLS.map(() => 3))
    expect(getAnchorCountForTool('cursor')).toBeNull()
    expect(getAnchorCountForTool('box-select')).toBeNull()
  })

  it('三个锚点数表互不重叠且覆盖全部绘图工具', () => {
    const all = [...SINGLE_ANCHOR_TOOLS, ...DOUBLE_ANCHOR_TOOLS, ...TRIPLE_ANCHOR_TOOLS]
    expect(new Set(all).size).toBe(all.length)
    expect(all).not.toContain('cursor')
    expect(all).not.toContain('box-select')
  })
})
