/** 合批与缓存行为：透明顺序、坐标修改、平移、DPR 和提前剔除。 */
import { describe, expect, it } from 'vitest'
import { UploadTracker } from '../impl/buffers.js'
import { rectPath } from '../impl/geometry.js'
import { createPrimitivePreparer, type GeometryPrimitive } from '../impl/prepare.js'
import type { PaintPrimitive } from '../types.js'

/** 使用固定 RGBA 隔离浏览器颜色解析，只检查真实几何准备器。 */
function preparer() {
  return createPrimitivePreparer(() => [1, 0, 0, 0.5])
}

describe('ordered primitive batching', () => {
  it('merges differently colored adjacent shapes into one instanced draw', () => {
    const prepare = preparer()
    const commands: GeometryPrimitive[] = [
      { kind: 'rect', x: 10, y: 10, width: 20, height: 20, color: 'red' },
      {
        kind: 'circle',
        x: 30,
        y: 30,
        radius: 8,
        color: 'blue',
        strokeColor: 'green',
        strokeWidth: 1,
      },
    ]
    const result = prepare.prepare(commands, 100, 100, 1)
    expect(result.draws).toEqual([{ kind: 'instances', first: 0, count: 2 }])
    expect(result.instances).toHaveLength(32)
  })

  it('culls before tessellation and caches geometry across translation but detects mutation and DPR', () => {
    const prepare = preparer()
    const points = [
      { x: 10, y: 10 },
      { x: 50, y: 20 },
      { x: 60, y: 50 },
    ]
    const command: GeometryPrimitive = {
      kind: 'stroke',
      paths: [points],
      width: 3,
      join: 'round',
      color: 'red',
    }
    expect(prepare.prepare([command], 100, 100, 1).geometryBuilds).toBe(1)
    expect(prepare.prepare([command], 100, 100, 1).geometryHits).toBe(1)
    for (const point of points) point.x += 2
    expect(prepare.prepare([command], 100, 100, 1).geometryHits).toBe(1)
    points[1]!.y++
    expect(prepare.prepare([command], 100, 100, 1).geometryBuilds).toBe(1)
    expect(prepare.prepare([command], 200, 200, 2).geometryBuilds).toBe(1)
    for (const point of points) point.x += 1000
    const culled = prepare.prepare([command], 100, 100, 1)
    expect(culled.culled).toBe(1)
    expect(culled.geometryBuilds).toBe(0)
    expect(culled.draws).toEqual([])
  })

  it('preserves ordering across instances and direct meshes and bypasses stencil for a straight round line', () => {
    const commands: GeometryPrimitive[] = [
      { kind: 'circle', x: 10, y: 10, radius: 5, color: 'red' },
      {
        kind: 'stroke',
        paths: [
          [
            { x: 10, y: 10 },
            { x: 60, y: 60 },
          ],
        ],
        width: 5,
        cap: 'round',
        color: 'blue',
      },
      { kind: 'circle', x: 30, y: 30, radius: 5, color: 'red' },
    ]
    expect(
      preparer()
        .prepare(commands, 100, 100, 1)
        .draws.map((draw) => draw.kind),
    ).toEqual(['instances', 'direct', 'instances'])
  })

  it('prepares opaque round strokes as segment instances when the device supports analytic coverage', () => {
    const prepare = createPrimitivePreparer(() => [1, 0, 0, 1], { segments: true })
    const stroke: GeometryPrimitive = {
      kind: 'stroke',
      paths: [
        [
          { x: 10, y: 10 },
          { x: 40, y: 20 },
          { x: 70, y: 15 },
        ],
      ],
      width: 2,
      cap: 'round',
      join: 'round',
      color: 'red',
    }
    const result = prepare.prepare([stroke], 100, 100, 1)
    expect(result.draws).toEqual([{ kind: 'segments', first: 0, count: 2 }])
    expect(result.vertices).toHaveLength(0)
    // 每段 14 个 float：起点、终点、前一点、后一点、半宽、颜色、数据空间标记。
    expect(result.segments).toHaveLength(2 * 14)
    const [first, second] = [0, 14].map((offset) =>
      Array.from(result.segments.slice(offset, offset + 14)),
    )
    expect(first).toEqual([10, 10, 40, 20, 10, 10, 70, 15, 1, 1, 0, 0, 1, 0])
    expect(second).toEqual([40, 20, 70, 15, 10, 10, 70, 15, 1, 1, 0, 0, 1, 0])
    // 共享折点必须写成同一组端点：角平分面由两侧分别算出，只有入参一致才互补。
    expect(second!.slice(4, 6)).toEqual(first!.slice(0, 2))
    expect(first!.slice(6, 8)).toEqual(second!.slice(2, 4))
  })

  it('points segment instances at the nearest distinct neighbour so duplicate points keep joins valid', () => {
    const prepare = createPrimitivePreparer(() => [1, 0, 0, 1], { segments: true })
    const stroke: GeometryPrimitive = {
      kind: 'stroke',
      paths: [
        [
          { x: 10, y: 10 },
          { x: 40, y: 10 },
          { x: 40, y: 10 },
          { x: 70, y: 10 },
        ],
      ],
      width: 2,
      cap: 'round',
      join: 'round',
      color: 'red',
    }
    const result = prepare.prepare([stroke], 100, 100, 1)
    expect(result.draws).toEqual([{ kind: 'segments', first: 0, count: 2 }])
    // 重复点没有方向，第二段的前一点必须回退到 10，角平分面才不会退化成零向量。
    expect(Array.from(result.segments.slice(14, 22))).toEqual([40, 10, 70, 10, 10, 10, 70, 10])
  })

  it('applies the primitive offset once when writing segment instances', () => {
    const prepare = createPrimitivePreparer(() => [1, 0, 0, 1], { segments: true })
    const stroke: GeometryPrimitive = {
      kind: 'stroke',
      paths: [
        [
          { x: 10, y: 10 },
          { x: 40, y: 10 },
        ],
      ],
      width: 2,
      cap: 'round',
      join: 'round',
      color: 'red',
      offsetX: 4,
    }
    const result = prepare.prepare([stroke], 100, 100, 1)
    expect(Array.from(result.segments.slice(0, 4))).toEqual([6, 10, 36, 10])
  })

  it('keeps translucent or dashed round strokes on the tessellated path', () => {
    const translucent = createPrimitivePreparer(() => [1, 0, 0, 0.5], { segments: true })
    const opaque = createPrimitivePreparer(() => [1, 0, 0, 1], { segments: true })
    const stroke = (): Extract<GeometryPrimitive, { kind: 'stroke' }> => ({
      kind: 'stroke',
      paths: [
        [
          { x: 10, y: 10 },
          { x: 40, y: 10 },
        ],
      ],
      width: 2,
      cap: 'round',
      join: 'round',
      color: 'red',
    })
    expect(translucent.prepare([stroke()], 100, 100, 1).segments).toHaveLength(0)
    expect(opaque.prepare([{ ...stroke(), dash: [4, 2] }], 100, 100, 1).segments).toHaveLength(0)
  })

  it('reuses unchanged segment instances instead of rewriting the buffer', () => {
    const prepare = createPrimitivePreparer(() => [1, 0, 0, 1], { segments: true })
    const stroke: Extract<GeometryPrimitive, { kind: 'stroke' }> = {
      kind: 'stroke',
      paths: [
        [
          { x: 10, y: 10 },
          { x: 40, y: 20 },
          { x: 70, y: 15 },
        ],
      ],
      width: 2,
      cap: 'round',
      join: 'round',
      color: 'red',
    }
    const first = prepare.prepare([stroke], 100, 100, 1)
    expect(first.changed.segments).toBe(true)
    // 新包装对象但复用同一批点数组：应跳过实例重写，只复用上一批内容。
    const repeated = prepare.prepare([{ ...stroke }], 100, 100, 1)
    expect(repeated.changed.segments).toBe(false)
    expect(repeated.draws).toEqual(first.draws)
    expect(Array.from(repeated.segments)).toEqual(Array.from(first.segments))
  })

  it('combines disjoint stencil masks but never unions overlapping independent fills', () => {
    const fill = (x: number): GeometryPrimitive => ({
      kind: 'fill',
      color: 'red',
      paths: [rectPath(x, 10, 20, 20), rectPath(x + 4, 14, 12, 12)],
    })
    expect(preparer().prepare([fill(0), fill(50)], 100, 100, 1).draws).toHaveLength(1)
    expect(preparer().prepare([fill(0), fill(10)], 100, 100, 1).draws).toHaveLength(2)
  })

  it('handles opaque and transparent color changes without reusing stale vertices', () => {
    const prepare = createPrimitivePreparer((color) =>
      color === 'red' ? [1, 0, 0, 1] : [0, 0, 1, 0.5],
    )
    const shape: Extract<PaintPrimitive, { kind: 'fill' }> = {
      kind: 'fill',
      color: 'red',
      paths: [rectPath(10, 10, 20, 20)],
    }
    expect(prepare.prepare([shape], 100, 100, 1).vertices[5]).toBe(1)
    const changed = prepare.prepare([{ ...shape, color: 'blue' }], 100, 100, 1)
    expect(changed.geometryHits).toBe(1)
    expect(changed.vertices[4]).toBe(1)
    expect(changed.vertices[5]).toBe(0.5)
  })

  it('band fills draw directly and reuse their vertices across transforms', () => {
    const prepare = preparer()
    const cloud = [
      [
        { x: 0, y: 10 },
        { x: 10, y: 10 },
        { x: 20, y: 20 },
        { x: 20, y: 40 },
        { x: 10, y: 40 },
        { x: 0, y: 40 },
      ],
    ]
    const fill: Extract<PaintPrimitive, { kind: 'fill' }> = {
      kind: 'fill',
      paths: cloud,
      color: 'red',
      band: true,
      dataSpace: true,
    }
    const first = prepare.prepare([fill], 100, 100, 1, {
      offsetX: 30,
      yScale: 1,
      yOffset: 0,
    })
    expect(first.draws).toEqual([{ kind: 'direct', first: 0, count: 12 }])
    // 世界 x 不烘焙滚动量；mode=1 让着色器在绘制时应用变换。
    expect(first.vertices[0]).toBe(0)
    expect(first.vertices[1]).toBe(10)
    expect(first.vertices[6]).toBe(1)
    const second = prepare.prepare([fill], 100, 100, 1, {
      offsetX: 50,
      yScale: 2,
      yOffset: 10,
    })
    expect(second.draws).toEqual(first.draws)
    expect(second.changed.vertices).toBe(false)
  })
})

describe('upload reuse', () => {
  it('uploads once, skips unchanged data, and uploads only the changed interval', () => {
    const tracker = new UploadTracker(),
      values = new Float32Array([1, 2, 3, 4])
    expect(tracker.update(values)?.values).toEqual(values)
    expect(tracker.update(values)).toBeNull()
    values[2] = 8
    expect(tracker.update(values)).toEqual({ offset: 8, values: new Float32Array([8]) })
    expect(tracker.update(values, true)?.values).toEqual(values)
  })
})
