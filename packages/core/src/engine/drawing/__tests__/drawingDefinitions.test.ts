/** 核心绘图工具几何定义测试，验证新增工具的 primitive 输出与默认参数。 */

import { describe, expect, it } from 'vitest'

import type { DrawingComputeContext, ResolvedDrawingObject } from '../../../foundation/plugin/index'
import {
  createArrowDefinition,
  createFibRetracementDefinition,
  createInfoLineDefinition,
  createRectangleDefinition,
} from '../index'
import { getAnchorCountForTool, getDrawingKind } from '../toolConfig'

function context(): DrawingComputeContext {
  return {
    pane: { id: 'main', top: 0, height: 400 } as DrawingComputeContext['pane'],
    visibleData: [],
    seriesData: [],
    range: { start: 0, end: 0 },
    kLinePositions: [],
    kLineCenters: [],
    kBarRects: [],
    kWidth: 8,
    kGap: 2,
    dpr: 1,
    paneWidth: 800,
    viewport: { scrollLeft: 0, plotWidth: 800, plotHeight: 400 },
    toScreen: (anchor) => ({ x: anchor.index * 10, y: 200 - anchor.price }),
  }
}

function drawing(kind: ResolvedDrawingObject['kind']): ResolvedDrawingObject {
  return {
    id: 'test',
    kind,
    paneId: 'main',
    visible: true,
    anchors: [
      { id: 'a', index: 2, price: 100 },
      { id: 'b', index: 12, price: 40 },
    ],
    params: {},
    style: { stroke: '#2962ff' },
  }
}

describe('new drawing tools', () => {
  it('uses canonical IDs and two anchors', () => {
    expect(getDrawingKind('fib-retracement')).toBe('fib-retracement')
    expect(getDrawingKind('rectangle')).toBe('rectangle')
    expect(getDrawingKind('arrow')).toBe('arrow')
    expect(getAnchorCountForTool('fib-retracement')).toBe(2)
    expect(getAnchorCountForTool('rectangle')).toBe(2)
    expect(getAnchorCountForTool('arrow')).toBe(2)
  })

  it('draws seven Fibonacci levels with labels', () => {
    const geometry = createFibRetracementDefinition().compute(drawing('fib-retracement'), context())
    expect(geometry.primitives).toHaveLength(14)
    expect(geometry.primitives.filter((primitive) => primitive.kind === 'text')).toHaveLength(7)
  })

  it('draws a rectangle border and translucent fill', () => {
    const geometry = createRectangleDefinition().compute(drawing('rectangle'), context())
    expect(geometry.primitives.filter((primitive) => primitive.kind === 'line')).toHaveLength(4)
    const area = geometry.primitives.find((primitive) => primitive.kind === 'area')
    expect(area?.style?.fillOpacity).toBe(0.1)
  })

  it('draws an arrow as one dedicated primitive', () => {
    const geometry = createArrowDefinition().compute(drawing('arrow'), context())
    expect(geometry.primitives).toEqual([
      expect.objectContaining({ kind: 'arrow', start: { x: 20, y: 100 }, end: { x: 120, y: 160 } }),
    ])
  })

  it('attaches info-line text to its line for slope-derived rendering', () => {
    const geometry = createInfoLineDefinition().compute(drawing('info-line'), context())

    expect(geometry.primitives).toEqual([
      expect.objectContaining({ kind: 'line', text: expect.objectContaining({ text: expect.any(String) }) }),
    ])
  })
})
