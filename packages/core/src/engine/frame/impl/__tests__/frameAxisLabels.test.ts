/** 绘图轴标签来源：拖动中的图元标签必须来自会话投影。 */
import { describe, expect, it } from 'vitest'
import type { AxisLabel } from '@/engine/axisLabels/index.js'
import type { DrawingFrameProjection } from '@/foundation/plugin/index.js'
import { resolveDrawingLabels } from '../frameAxisLabels.js'

/** 只声明标签的投影；其余字段与标签语义无关。 */
function projection(axisLabels: readonly AxisLabel[]): DrawingFrameProjection {
  return { primitives: [], yAxisRanges: [], xAxisRanges: [], snapLines: [], axisLabels }
}

const dragLabel: AxisLabel = {
  kind: 'value',
  axisId: 'price',
  role: 'tag',
  value: 42,
  background: '#2962ff',
}

describe('resolveDrawingLabels', () => {
  it.each<{
    label: string
    committed: DrawingFrameProjection | undefined
    session: DrawingFrameProjection | undefined
    expected: readonly AxisLabel[]
  }>([
    {
      label: '拖动中图元从正式投影剔除，标签由会话投影提供',
      committed: projection([]),
      session: projection([dragLabel]),
      expected: [dragLabel],
    },
    {
      label: '静止时只读正式投影',
      committed: projection([dragLabel]),
      session: undefined,
      expected: [dragLabel],
    },
    { label: '无投影时没有标签', committed: undefined, session: undefined, expected: [] },
  ])('$label', ({ committed, session, expected }) => {
    expect(resolveDrawingLabels(committed, session)).toEqual(expected)
  })
})
