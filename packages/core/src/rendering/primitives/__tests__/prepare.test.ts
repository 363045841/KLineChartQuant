/** 合批与缓存行为：透明顺序、坐标修改、平移、DPR 和提前剔除。 */
import { describe, expect, it } from 'vitest'
import { FloatArena, resolveUploadRange } from '../impl/buffers.js'
import { rectPath } from '../impl/geometry.js'
import { createPrimitivePreparer, type GeometryPrimitive } from '../impl/prepare.js'
import { projectStrokeToScreen, rebaseDataTransform } from '../impl/projection.js'
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
    // 每段 14 个 float：四个点、半宽、颜色、标志位。
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

  it('prepares miter strokes as quads that share their joint cut exactly', () => {
    const prepare = createPrimitivePreparer(() => [1, 0, 0, 1], { segments: true })
    const stroke: GeometryPrimitive = {
      kind: 'stroke',
      paths: [
        [
          { x: 10, y: 20 },
          { x: 40, y: 20 },
          { x: 40, y: 50 },
        ],
      ],
      width: 4,
      color: 'red',
    }
    const result = prepare.prepare([stroke], 100, 100, 1)
    expect(result.draws).toEqual([{ kind: 'segments', first: 0, count: 2 }])
    expect(result.segments).toHaveLength(2 * 14)
    const quads = [0, 14].map((offset) => Array.from(result.segments.slice(offset, offset + 14)))
    // 四边形自带线宽：半宽写 0、标志位只带凸四边形区域（bit1）。
    expect(quads[0]!.slice(8)).toEqual([0, 1, 0, 0, 1, 2])
    // 第一段的终点切边与第二段的起点切边逐值相同，说明两个四边形恰好拼接。
    expect(quads[0]!.slice(2, 4)).toEqual(quads[1]!.slice(0, 2))
    expect(quads[0]!.slice(4, 6)).toEqual(quads[1]!.slice(6, 8))
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
    expect(first.uploads.segments).not.toBeNull()
    // 新包装对象但复用同一批点数组：应跳过实例重写，只复用上一批内容。
    const repeated = prepare.prepare([{ ...stroke }], 100, 100, 1)
    expect(repeated.uploads.segments).toBeNull()
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
    expect(first.vertices[1]).toBe(0)
    expect(first.dataOrigin).toEqual({ x: 0, y: 10 })
    expect(first.vertices[6]).toBe(1)
    const second = prepare.prepare([fill], 100, 100, 1, {
      offsetX: 50,
      yScale: 2,
      yOffset: 10,
    })
    expect(second.draws).toEqual(first.draws)
    expect(second.uploads.vertices).toBeNull()
  })
})

describe('upload reuse', () => {
  it('keeps sub-cent price differences and large history coordinates precise after GPU rebasing', () => {
    const prepare = createPrimitivePreparer(() => [1, 0, 0, 1], { segments: true })
    const paths = [
      [
        { x: 100_000_000, y: 100_000.001 },
        { x: 100_000_001, y: 100_000.002 },
      ],
    ]
    const transform = { offsetX: 99_999_990, yScale: -10_000, yOffset: 1_000_000_100 }
    const batch = prepare.prepare(
      [
        {
          kind: 'stroke',
          paths,
          color: 'red',
          width: 1,
          cap: 'round',
          join: 'round',
          dataSpace: true,
        },
      ],
      200,
      200,
      1,
      transform,
    )
    const local = rebaseDataTransform(transform, batch.dataOrigin)!
    expect(batch.segments[2]! - local.offsetX).toBeCloseTo(11, 5)
    expect(batch.segments[3]! * local.yScale + local.yOffset).toBeCloseTo(80, 4)
    expect(batch.segments[2]).toBe(1)
  })

  it('detects changed descriptors in a reused list and reencodes when the origin changes', () => {
    const prepare = createPrimitivePreparer(() => [1, 0, 0, 1], { segments: true })
    const commands: GeometryPrimitive[] = [
      {
        kind: 'stroke',
        color: 'red',
        width: 1,
        cap: 'round',
        join: 'round',
        dataSpace: true,
        paths: [
          [
            { x: 10, y: 3 },
            { x: 20, y: 5 },
          ],
        ],
      },
    ]
    const transform = { offsetX: 4, yScale: 2, yOffset: 10 }
    prepare.prepare(commands, 100, 100, 1, transform)
    commands[0] = {
      kind: 'stroke',
      color: 'red',
      width: 2,
      cap: 'round',
      join: 'round',
      dataSpace: true,
      paths: [
        [
          { x: 30, y: 9 },
          { x: 40, y: 10 },
          { x: 50, y: 11 },
        ],
      ],
    }
    const next = prepare.prepare(commands, 100, 100, 1, transform)
    expect(next.dataOrigin).toEqual({ x: 30, y: 9 })
    expect(next.draws).toEqual([{ kind: 'segments', first: 0, count: 2 }])
    expect(next.uploads.segments).not.toBeNull()
    expect(next.segments[8]).toBe(1)
  })

  it('replays data-space round strokes without rewriting or uploading any segment', () => {
    const prepare = createPrimitivePreparer(() => [1, 0, 0, 1], { segments: true })
    const command: GeometryPrimitive = {
      kind: 'stroke',
      color: 'red',
      width: 2,
      cap: 'round',
      join: 'round',
      dataSpace: true,
      paths: [
        [
          { x: 10, y: 3 },
          { x: 20, y: 5 },
          { x: 30, y: 2 },
        ],
      ],
    }
    const first = prepare.prepare([command], 100, 100, 1, { offsetX: 4, yScale: -2, yOffset: 50 })
    const values = first.segments.slice()
    expect(first.segments[0]).toBe(0)
    expect(first.segments[1]).toBe(0)
    expect(first.dataOrigin).toEqual({ x: 10, y: 3 })
    expect(first.segments[13]).toBe(1)
    expect(first.draws).toEqual([{ kind: 'segments', first: 0, count: 2 }])
    const next = prepare.prepare([{ ...command, paths: [...command.paths] }], 200, 200, 2, {
      offsetX: 12,
      yScale: -5,
      yOffset: 80,
    })
    expect(next.segments).toEqual(values)
    expect(next.uploads.segments).toBeNull()
    expect(next.geometryBuilds).toBe(0)
  })

  it.each(['dash', 'miter', 'alpha', 'closed', 'canvas'] as const)(
    'projects %s strokes before pixel-width tessellation',
    (mode) => {
      const stroke: Extract<PaintPrimitive, { kind: 'stroke' }> = {
        kind: 'stroke',
        color: 'red',
        width: 3,
        cap: 'round',
        join: 'round',
        dataSpace: true,
        paths: [
          [
            { x: 10, y: 3 },
            { x: 20, y: 5 },
            { x: 30, y: 2 },
          ],
        ],
        ...(mode === 'dash' ? { dash: [4, 2], dashOffset: 1 } : {}),
        ...(mode === 'miter' ? { join: 'miter', cap: 'butt' } : {}),
        ...(mode === 'closed' ? { closed: true } : {}),
      }
      const transform = { offsetX: 2, yScale: -5, yOffset: 80 }
      const color = (): [number, number, number, number] => [1, 0, 0, mode === 'alpha' ? 0.5 : 1]
      const options = { segments: mode !== 'canvas' }
      const actual = createPrimitivePreparer(color, options).prepare(
        [stroke],
        200,
        200,
        2,
        transform,
      )
      const expected = createPrimitivePreparer(color, options).prepare(
        [projectStrokeToScreen(stroke, transform)],
        200,
        200,
        2,
      )
      expect(actual.vertices).toEqual(expected.vertices)
      expect(actual.segments).toEqual(expected.segments)
      expect(actual.draws).toEqual(expected.draws)
    },
  )

  it('tracks writes between retained spans and initializes reallocated GPU storage', () => {
    const arena = new FloatArena()
    arena.reserve(4)
    for (const value of [1, 2, 3, 4]) arena.write(value)
    expect(arena.uploadRange()?.values).toEqual(arena.view())
    arena.reset()
    arena.skip(2)
    arena.reserve(1)
    arena.write(8)
    arena.skip(1)
    expect(arena.uploadRange()).toEqual({ offset: 8, values: new Float32Array([8]) })
    expect(resolveUploadRange(arena.view(), arena.uploadRange(), true)).toEqual({
      offset: 0,
      values: arena.view(),
    })
    arena.reset()
    arena.skip(4)
    expect(arena.uploadRange()).toBeNull()
    expect(resolveUploadRange(arena.view(), null, true)?.values).toEqual(
      new Float32Array([1, 2, 8, 4]),
    )
  })
})
