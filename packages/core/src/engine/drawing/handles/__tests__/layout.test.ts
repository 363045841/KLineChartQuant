/**
 * 验证手柄布局：锚点手柄与线段中点手柄由同一份投影现算，靠边手柄只在选中态出现。
 * 坐标系沿用四 Bar 时间轴夹具：索引 i → x = i*10+5，价格 p → y = 200 - p，
 * 绘图区 300×240。
 */
import { describe, expect, it } from 'vitest'

import {
  createDrawingObject,
  createFlatLineDrawing,
  createFourBarTimelineAdapter,
  createRectangleDrawing,
} from '../../__tests__/helpers/drawingTestKit.js'
import { anchorToScreen } from '../../geometry/impl/coordinateUtils.js'
import {
  resolveAnchorHandles,
  resolveDrawingHandles,
  resolveLineMidHandles,
} from '../impl/layout.js'
import type { DrawingHandlePort } from '../types.js'

/** 命中侧同款端口：锚点经四 Bar 时间轴适配器投影。 */
const adapter = createFourBarTimelineAdapter()
const port: DrawingHandlePort = {
  bounds: { plotWidth: 300, paneHeight: 240 },
  projectAnchor: (anchor) => anchorToScreen(anchor, 'main', adapter),
}

describe('手柄布局', () => {
  it('为每个可投影成点的锚点生成手柄，顺序与锚点一致', () => {
    const handles = resolveAnchorHandles(createFlatLineDrawing(), port, { selected: false })
    expect(handles.map((handle) => handle.anchorIndex)).toEqual([0, 1, 2, 3])
    expect(handles.map((handle) => handle.point)).toEqual([
      { x: 5, y: 100 },
      { x: 15, y: 60 },
      { x: 5, y: 140 },
      { x: 15, y: 140 },
    ])
  })

  it('按线表为通道图元补出中点手柄', () => {
    const handles = resolveLineMidHandles(createFlatLineDrawing(), port)
    expect(handles.map((handle) => handle.lineIndex)).toEqual([0, 1])
    expect(handles.map((handle) => handle.point)).toEqual([
      { x: 10, y: 80 },
      { x: 10, y: 140 },
    ])
  })

  it('未选中只出锚点手柄，选中后追加中点手柄', () => {
    const drawing = createFlatLineDrawing()
    const unselected = resolveDrawingHandles(drawing, port, { selected: false })
    const selected = resolveDrawingHandles(drawing, port, { selected: true })
    expect(unselected).toHaveLength(4)
    expect(selected).toHaveLength(6)
    expect(selected.slice(4).map((handle) => handle.kind)).toEqual(['line-mid', 'line-mid'])
  })

  it('水平线的虚拟手柄贴右侧内边距，且只在选中态出现', () => {
    const drawing = createDrawingObject({
      id: 'horizontal',
      kind: 'horizontal-line',
      anchors: [{ id: 'a', type: 'horizontal', price: 100 }],
    })
    expect(resolveAnchorHandles(drawing, port, { selected: false })).toEqual([])
    expect(resolveAnchorHandles(drawing, port, { selected: true })).toEqual([
      { kind: 'anchor', anchorIndex: 0, point: { x: 260, y: 100 }, cursor: 'ns-resize' },
    ])
  })

  it('垂直线的虚拟手柄贴下方内边距', () => {
    const drawing = createDrawingObject({
      id: 'vertical',
      kind: 'vertical-line',
      anchors: [{ id: 'a', type: 'vertical', time: 500, price: 20 }],
    })
    expect(resolveAnchorHandles(drawing, port, { selected: true })).toEqual([
      { kind: 'anchor', anchorIndex: 0, point: { x: 5, y: 200 }, cursor: 'ew-resize' },
    ])
  })

  it('矩形的四条边各出一个中点手柄，左右边为时间轴', () => {
    const handles = resolveLineMidHandles(createRectangleDrawing(), port)
    expect(handles.map((handle) => [handle.lineIndex, handle.cursor])).toEqual([
      [0, 'ns-resize'],
      [1, 'ew-resize'],
      [2, 'ns-resize'],
      [3, 'ew-resize'],
    ])
  })

  it('锚点残缺时跳过无法成对的线，不把手柄画到错误的线上', () => {
    const broken = createDrawingObject({
      id: 'broken',
      kind: 'flat-line',
      anchors: [
        { id: 'a', type: 'point', time: 500, price: 100 },
        { id: 'b', type: 'point', time: 1_000, price: 140 },
        { id: 'h1', type: 'point', time: 500, price: 60 },
      ],
    })
    const handles = resolveLineMidHandles(broken, port)
    expect(handles.map((handle) => handle.lineIndex)).toEqual([0])
  })
})
