/** 验证复制落点的整组位移、轴语义、边缘方向与未来锚点。 */
import { describe, expect, it } from 'vitest'
import type { DrawingViewportPort } from '@/controllers/types.js'
import {
  createDrawingObject,
  createDrawingViewportPort,
  createTrendLine,
} from '../../__tests__/helpers/drawingTestKit.js'
import { resolveCopyPlacements } from '../impl/copyPlacement.js'

/** 30 Bar 时间轴 adapter：索引 i → x = i*10+5，价格↔Y 沿用测试夹具的线性映射。 */
function createCopyAdapter(overrides: Partial<DrawingViewportPort> = {}): DrawingViewportPort {
  const data = Array.from({ length: 30 }, (_, index) => ({ timestamp: index * 1000 }))
  return createDrawingViewportPort({
    getDrawingData: () => data,
    getLogicalIndexAtTimestamp: (time) => data.findIndex((bar) => bar.timestamp === time),
    getDrawingTimestampAtLogicalIndex: (index) => data[index]?.timestamp ?? null,
    ...overrides,
  })
}

describe('复制落点', () => {
  it('多选使用共同位移，连续复制基于副本继续移动', () => {
    const adapter = createCopyAdapter()
    const drawing = createTrendLine('line', {
      anchors: [
        { id: 'a', type: 'point', time: 1000, price: 100 },
        { id: 'b', type: 'point', time: 3000, price: 120 },
      ],
    })
    const second = { ...drawing, id: 'second' }
    const placements = resolveCopyPlacements([drawing, second], adapter)
    expect(placements).toHaveLength(2)
    expect(placements[0]!.anchors).toEqual(placements[1]!.anchors)
    expect(placements[0]!.anchors.map((anchor) => [anchor.time, anchor.price])).toEqual([
      [3000, 52],
      [5000, 72],
    ])
    const copied = createTrendLine('copied', { anchors: [...placements[0]!.anchors] })
    const next = resolveCopyPlacements([copied], adapter)
    expect(next[0]!.anchors[0]).toMatchObject({ time: 5000, price: 4 })
    expect(drawing.anchors[0]).toMatchObject({ time: 1000, price: 100 })
  })

  it('靠近右下边缘时整组向左上移动', () => {
    const adapter = createCopyAdapter()
    const drawing = createTrendLine('line', {
      anchors: [
        { id: 'a', type: 'point', time: 28000, price: 5 },
        { id: 'b', type: 'point', time: 29000, price: 10 },
      ],
    })
    const [copy] = resolveCopyPlacements([drawing], adapter)
    expect(copy!.anchors.map((anchor) => [anchor.time, anchor.price])).toEqual([
      [26000, 53],
      [27000, 58],
    ])
  })

  it('水平线只改价格，垂直线只改时间', () => {
    const adapter = createCopyAdapter()
    const horizontal = createDrawingObject({
      id: 'horizontal',
      kind: 'horizontal-line',
      anchors: [{ id: 'h', type: 'horizontal', price: 100 }],
    })
    const vertical = createDrawingObject({
      id: 'vertical',
      kind: 'vertical-line',
      anchors: [{ id: 'v', type: 'vertical', time: 1000, price: 100 }],
    })
    const copies = resolveCopyPlacements([horizontal, vertical], adapter)
    expect(copies[0]!.anchors[0]).toEqual({ id: 'h', type: 'horizontal', price: 52 })
    expect(copies[1]!.anchors[0]).toMatchObject({ time: 3000, price: 100 })
  })

  it('越过最后一根的锚点按未来槽位生成', () => {
    const drawing = createTrendLine('line', {
      anchors: [{ id: 'a', type: 'point', time: 28000, price: 100 }],
    })
    const wide = createCopyAdapter({
      getViewport: () => ({ scrollLeft: 0, plotWidth: 500, plotHeight: 240 }),
    })
    const [copy] = resolveCopyPlacements([drawing], wide)
    expect(copy!.anchors[0]).toMatchObject({ time: 29000, futureOffset: 1 })
  })

  it('任一坐标不可解析时整批不复制', () => {
    const drawing = createTrendLine('line', {
      anchors: [
        { id: 'a', type: 'point', time: 1000, price: 100 },
        { id: 'b', type: 'point', time: 3000, price: 120 },
      ],
    })
    const unavailable = createCopyAdapter({ getScreenXAtLogicalIndex: () => null })
    expect(resolveCopyPlacements([drawing], unavailable)).toEqual([])
  })
})
