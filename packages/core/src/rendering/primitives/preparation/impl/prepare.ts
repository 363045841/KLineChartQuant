/** 帧准备编排：冻结坐标输入，按原语顺序调度三个缓冲阶段，不解释几何细节。 */
import type { DataTransform } from '@/foundation/plugin/types.js'
import type { ColorResolver } from '../../impl/colors.js'
import type { PrimitivePoint } from '../../types.js'
import type { GeometryPrimitive, PreparationFrame, PreparedBatch } from '../types.js'
import { DrawList } from './drawList.js'
import { MeshWriter } from './meshes.js'
import { ShapeWriter } from './shapes.js'
import { StrokeWriter } from './strokes.js'

/** 缓存与容量由后端私有准备器持有；每次调用只重置本帧游标与绘制队列。 */
export function createPrimitivePreparer(
  colors: ColorResolver,
  options: { segments?: boolean } = {},
) {
  const draws = new DrawList()
  const meshes = new MeshWriter(colors, draws)
  const shapes = new ShapeWriter(colors, draws)
  const strokes = new StrokeWriter(colors, options.segments === true, draws)
  let lastOrigin: PrimitivePoint = { x: 0, y: 0 }
  let lastHasTransform = false
  return {
    prepare(
      primitives: readonly GeometryPrimitive[],
      width: number,
      height: number,
      dpr: number,
      transform?: DataTransform,
    ): PreparedBatch {
      const source =
        transform &&
        primitives.find(
          (primitive) =>
            (primitive.kind === 'stroke' || primitive.kind === 'fill') &&
            primitive.dataSpace === true &&
            primitive.paths[0]?.[0],
        )
      const origin =
        source && (source.kind === 'stroke' || source.kind === 'fill')
          ? source.paths[0]![0]!
          : { x: 0, y: 0 }
      const frame: PreparationFrame = {
        width: width / dpr,
        height: height / dpr,
        dpr,
        transform,
        origin,
        reusable:
          origin.x === lastOrigin.x &&
          origin.y === lastOrigin.y &&
          (transform !== undefined) === lastHasTransform,
      }
      draws.reset()
      shapes.begin()
      strokes.begin(frame.reusable)
      meshes.begin(frame.reusable)
      const flush = () => meshes.flush(frame)
      for (let index = 0; index < primitives.length; index++) {
        const primitive = primitives[index]!
        switch (primitive.kind) {
          case 'circle':
          case 'rect':
          case 'rects':
            shapes.append(primitive, frame, flush)
            break
          case 'stroke': {
            const plan = strokes.resolve(primitive, frame)
            if (plan.kind === 'analytic') {
              flush()
              strokes.append(plan, frame, index)
            } else meshes.append(plan.primitive, frame, index)
            break
          }
          case 'fill':
            meshes.append(primitive, frame, index)
            break
        }
      }
      flush()
      lastOrigin = { ...origin }
      lastHasTransform = transform !== undefined
      return {
        dataOrigin: origin,
        vertices: meshes.arena.view(),
        instances: shapes.arena.view(),
        segments: strokes.arena.view(),
        draws: draws.values,
        uploads: {
          vertices: meshes.arena.uploadRange(),
          instances: shapes.arena.uploadRange(),
          segments: strokes.arena.uploadRange(),
        },
        culled: meshes.culled + shapes.culled,
        geometryBuilds: meshes.geometryBuilds,
        geometryHits: meshes.geometryHits,
      }
    },
  }
}
