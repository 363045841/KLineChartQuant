/** drawing-only 指标必须参与轴范围，并在滚动后重新计算可见对象的范围。 */
import { describe, expect, it } from 'vitest'
import { createDrawingObject } from '@363045841yyt/klinechart-plot-contracts'
import { DEFAULT_DRAWING_STROKE, resolveThemeColors } from '@/foundation/tokens/index.js'
import { projectPlots, updatePlotRange } from '../impl/projectPlots.js'

describe('drawing-only indicator range', () => {
  it('preserves object output and updates the range without any plots', () => {
    const drawings = [0, 20].map((index) => createDrawingObject({
      id: `line-${index}`, kind: 'trend-line', paneId: '', ownerId: 'script',
      anchors: [
        { id: 'a', logicalIndex: index, price: index + 10 },
        { id: 'b', logicalIndex: index + 2, price: index + 20 },
      ],
    }, DEFAULT_DRAWING_STROKE))
    const definition = { source: 'collection', series: [] } as const
    const state = projectPlots(definition, { plots: [], fills: [], drawings }, {},
      { start: 0, end: 10 }, 0, resolveThemeColors('light', false))
    expect(state.drawings).toBe(drawings)
    expect(state.visibleMin).toBe(10)
    expect(state.visibleMax).toBe(20)
    const moved = updatePlotRange(state, definition, { start: 20, end: 30 }, 1)
    expect(moved.drawings).toBe(drawings)
    expect(moved.visibleMin).toBe(30)
    expect(moved.visibleMax).toBe(40)
  })
})
