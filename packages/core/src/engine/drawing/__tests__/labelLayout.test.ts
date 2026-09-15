/** 验证线段标签锚点布局：语义位置、上侧法线偏移与可读旋转角。 */
import { describe, expect, it } from 'vitest'

import { LINE_LABEL_NORMAL_OFFSET, resolveLineLabelLayout } from '../labelLayout'

describe('resolveLineLabelLayout', () => {
  it('offsets the center anchor along the upper normal of a horizontal segment', () => {
    expect(resolveLineLabelLayout({ x: 0, y: 100 }, { x: 200, y: 100 }, 'center')).toEqual({
      x: 100,
      y: 100 - LINE_LABEL_NORMAL_OFFSET,
      rotation: 0,
      align: 'center',
    })
  })

  it('keeps endpoints unmoved and aligns outward for start and end', () => {
    expect(resolveLineLabelLayout({ x: 0, y: 100 }, { x: 200, y: 100 }, 'start')).toMatchObject({
      x: 0,
      align: 'left',
    })
    expect(resolveLineLabelLayout({ x: 0, y: 100 }, { x: 200, y: 100 }, 'end')).toMatchObject({
      x: 200,
      align: 'right',
    })
  })

  it('normalizes a right-to-left segment to a readable rotation', () => {
    expect(resolveLineLabelLayout({ x: 200, y: 0 }, { x: 0, y: 0 }, 'center').rotation).toBe(0)
  })

  it('defaults an undefined position to the center anchor', () => {
    expect(resolveLineLabelLayout({ x: 0, y: 0 }, { x: 10, y: 0 }, undefined)).toMatchObject({
      x: 5,
      align: 'center',
    })
  })
})
