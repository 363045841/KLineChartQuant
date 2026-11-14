/** 种类声明表的不变量：名称唯一、锚点数自洽、Agent 枚举与通道集合由声明派生。 */
import { describe, expect, it } from 'vitest'
import {
  AGENT_DRAWING_KINDS,
  DRAWING_KIND_VALUES,
  drawingKindName,
  isFilledDrawingKind,
} from '../impl/drawingKindSpecs'
import {
  getDrawingAnchorCount,
  getDrawingInputAnchorCount,
  materializeDrawingAnchors,
} from '../impl/materializeAnchors'

describe('drawing kind specs', () => {
  it('每个种类都有唯一的非空显示名', () => {
    const names = DRAWING_KIND_VALUES.map((kind) => drawingKindName(kind))
    expect(names.every((name) => name.trim().length > 0)).toBe(true)
    expect(new Set(names).size).toBe(names.length)
  })

  it('持久锚点数覆盖输入锚点数，并可由物化补齐达到', () => {
    for (const kind of DRAWING_KIND_VALUES) {
      const input = getDrawingInputAnchorCount(kind)
      const persisted = getDrawingAnchorCount(kind)
      expect(persisted).toBeGreaterThanOrEqual(input)
      const anchors = Array.from({ length: input }, (_, index) => ({
        id: `anchor-${index}`,
        time: index + 1,
        price: 100 + index,
      }))
      expect(materializeDrawingAnchors(kind, anchors, () => 'generated')).toHaveLength(persisted)
    }
  })

  it('Agent 只开放声明里标记的种类', () => {
    // 文本图元由用户直接输入文字创建，不进入 drawing_create。
    expect(AGENT_DRAWING_KINDS).not.toContain('label')
    expect(AGENT_DRAWING_KINDS).toEqual(DRAWING_KIND_VALUES.filter((kind) => kind !== 'label'))
  })

  it('通道类集合由声明派生', () => {
    expect(DRAWING_KIND_VALUES.filter(isFilledDrawingKind)).toEqual([
      'rectangle',
      'parallel-channel',
      'regression-channel',
      'flat-line',
      'disjoint-channel',
    ])
  })
})
