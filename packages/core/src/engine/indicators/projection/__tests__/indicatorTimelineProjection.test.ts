/** 验证时间身份映射覆盖非连续变更、绘图列与索引图元，且不破坏非序列数据。 */
import { describe, expect, it } from 'vitest'
import { createDrawingObject, ShapeSize, type PlotCollection } from '@363045841yyt/klinechart-plot-contracts'
import { DEFAULT_DRAWING_STROKE } from '@/foundation/tokens/index.js'
import { createIndicatorTimelineProjection, projectIndicatorCollection } from '../impl/indicatorTimelineProjection.js'

describe('indicator timeline projection', () => {
  it('按精确时间重排稀疏行情，删除的位置不冒充相邻 bar', () => {
    const timeline = createIndicatorTimelineProjection([10, 30, 50], [5, 10, 20, 50, 60], false)
    expect(timeline.projectArray(['a', 'b', 'c'])).toEqual([undefined, 'a', undefined, 'c', undefined])
    expect(timeline.projectIndex(0)).toBe(1)
    expect(timeline.projectIndex(1)).toBeNaN()
    expect(timeline.projectIndex(2)).toBe(3)
    expect(timeline.projectIndex(3)).toBe(4)
    expect(timeline.projectIndex(-1)).toBe(0)
  })

  it('保留索引分数位置，映射无交集和空时间轴时不绘制', () => {
    expect(createIndicatorTimelineProjection([10, 30], [5, 10, 20, 30], false).projectIndex(0.5)).toBe(2)
    const missing = createIndicatorTimelineProjection([10, 30], [50, 60], false)
    expect(missing.projectIndex(0)).toBeNaN()
    expect(missing.projectIndex(2)).toBeNaN()
    expect(missing.projectArray([1, 2])).toEqual([undefined, undefined])
    expect(createIndicatorTimelineProjection([10], [], false).projectArray([1])).toEqual([])
  })

  it('只有分时使用分钟身份，普通 K 线不把同分钟的不同 bar 合并', () => {
    expect(createIndicatorTimelineProjection([60_001], [60_002], true).projectArray([9])).toEqual([9])
    expect(createIndicatorTimelineProjection([60_001], [60_002], false).projectArray([9])).toEqual([undefined])
  })

  it('统一投影普通列、OHLC、填充和图元，保留用户偏移与绝对时间坐标', () => {
    const ohlc = { open: 1, high: 3, low: 0, close: 2, color: null, wickColor: null, borderColor: null }
    const collection: PlotCollection = {
      plots: [
        { kind: 'line', id: 'a', label: 'A', color: DEFAULT_DRAWING_STROKE, visible: true,
          size: ShapeSize.Auto, offset: 1, dash: [4, 2], data: [{ value: 2 }, { value: 3 }] },
        { kind: 'candle', id: 'b', label: 'B', color: DEFAULT_DRAWING_STROKE, visible: true,
          offset: 0, data: [ohlc, ohlc] },
      ],
      fills: [{ id: 'fill', from: 'a', to: 'a', visible: true, colors: [DEFAULT_DRAWING_STROKE, null] }],
      drawings: [createDrawingObject({ id: 'line', kind: 'trend-line', paneId: 'main',
        anchors: [{ id: 'a', logicalIndex: 0, price: 2 }, { id: 'b', time: 30, price: 3 }],
        params: { levels: [0, 1] },
      }, DEFAULT_DRAWING_STROKE)],
    }
    const projected = projectIndicatorCollection(collection, createIndicatorTimelineProjection([10, 30], [5, 10, 20, 30], false))
    expect(projected.plots[0]).toMatchObject({ offset: 1, dash: [4, 2], data: [undefined, { value: 2 }, undefined, { value: 3 }] })
    expect(projected.plots[1]?.data).toEqual([undefined, ohlc, undefined, ohlc])
    expect(projected.fills[0]?.colors).toEqual([null, DEFAULT_DRAWING_STROKE, null, null])
    expect(projected.drawings).toHaveLength(1)
    expect(projected.drawings?.[0]?.anchors).toEqual([{ id: 'a', logicalIndex: 1, price: 2 }, { id: 'b', time: 30, price: 3 }])
    expect(projected.drawings?.[0]?.params).toEqual({ levels: [0, 1] })
    expect(collection.drawings?.[0]?.anchors[0]?.logicalIndex).toBe(0)
    expect(projectIndicatorCollection(collection, createIndicatorTimelineProjection([10, 30], [10, 30], false))).toBe(collection)
  })
})
