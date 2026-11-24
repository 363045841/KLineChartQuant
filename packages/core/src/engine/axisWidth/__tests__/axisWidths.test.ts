/** 轴宽估算：把各轴的标签宽度需求换算成列宽，不做跨帧缓存。 */
import { describe, expect, it } from 'vitest'
import { layoutAxisColumns } from '../impl/axisColumns.js'
import { estimateAxisWidths, resolveAxisWidth } from '../impl/axisWidths.js'

/** 单条轴的宽度需求。 */
function axis(
  axisId: string,
  paneId: string,
  staticWidth: number,
  overlayWidth = 0,
  leftWidth = 0,
): {
  axisId: string
  paneId: string
  staticWidth: number
  overlayWidth: number
  leftWidth: number
} {
  return { axisId, paneId, staticWidth, overlayWidth, leftWidth }
}

describe('estimateAxisWidths', () => {
  it('同一窗格按列求和，不同窗格取最宽一层', () => {
    const layout = estimateAxisWidths({
      axes: [axis('main', 'main', 48), axis('sub', 'sub', 96), axis('second', 'sub', 64)],
    })
    expect(layout.rightByAxis).toEqual({ main: 48, sub: 96, second: 64 })
    expect(layout.right).toBe(Math.max(48, 96 + 64))
    const columns = layoutAxisColumns(['sub', 'second'], layout.rightByAxis, layout.right)
    expect(columns).toEqual([
      { axisId: 'sub', left: 0, width: 96 },
      { axisId: 'second', left: 96, width: 64 },
    ])
  })

  it('两侧宽度都取本帧最大值', () => {
    const layout = estimateAxisWidths({
      axes: [axis('main', 'main', 48, 120, 64)],
    })
    expect(layout.right).toBe(120)
    expect(layout.left).toBe(64)
  })

  it.each([
    { floor: 60, requested: 40, committed: 67, expected: 67 },
    { floor: 60, requested: 80, committed: 67, expected: 80 },
    { floor: 60, requested: 0, committed: null, expected: 60 },
    { floor: 60, requested: 48, committed: null, expected: 60 },
  ])('resolveAxisWidth($floor, $requested, $committed) = $expected', (input) => {
    expect(resolveAxisWidth(input.floor, input.requested, input.committed)).toBe(input.expected)
  })
})
