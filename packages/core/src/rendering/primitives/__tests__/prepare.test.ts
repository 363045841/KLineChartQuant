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
