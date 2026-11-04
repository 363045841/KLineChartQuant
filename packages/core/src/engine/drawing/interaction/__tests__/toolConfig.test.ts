/** 验证工具锚点数表的不变量：三张表互不重叠，且不含非绘图工具。 */
import { describe, expect, it } from 'vitest'

import { DOUBLE_ANCHOR_TOOLS, SINGLE_ANCHOR_TOOLS, TRIPLE_ANCHOR_TOOLS } from '@/controllers/index'

describe('toolConfig anchor tables', () => {
  it('三个锚点数表互不重叠，且不含非绘图工具', () => {
    const all = [...SINGLE_ANCHOR_TOOLS, ...DOUBLE_ANCHOR_TOOLS, ...TRIPLE_ANCHOR_TOOLS]
    expect(new Set(all).size).toBe(all.length)
    expect(all).not.toContain('cursor')
    expect(all).not.toContain('box-select')
  })
})
