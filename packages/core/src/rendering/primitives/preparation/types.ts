/** 原语准备契约：绘制顺序、缓冲布局与本帧局部坐标，独立于具体准备阶段。 */
import type { DataTransform } from '@/foundation/plugin/types.js'
import type { PaintPrimitive, PrimitivePoint, UploadRange } from '../types.js'

export type GeometryPrimitive = Exclude<PaintPrimitive, { kind: 'text' }>
export type StrokePrimitive = Extract<GeometryPrimitive, { kind: 'stroke' }>
export type FillPrimitive = Extract<GeometryPrimitive, { kind: 'fill' }>
export type ShapePrimitive = Extract<GeometryPrimitive, { kind: 'circle' | 'rect' | 'rects' }>
export type PathPrimitive = StrokePrimitive | FillPrimitive

export type PreparedDraw =
  | { kind: 'instances'; first: number; count: number }
  | { kind: 'segments'; first: number; count: number }
  | { kind: 'direct'; first: number; count: number }
  | {
      kind: 'stencil'
      first: number
      count: number
      coverFirst: number
      coverCount: number
      evenodd: boolean
    }

export interface PreparedBatch {
  dataOrigin: PrimitivePoint
  vertices: Float32Array
  instances: Float32Array
  segments: Float32Array
  draws: PreparedDraw[]
  uploads: {
    vertices: UploadRange | null
    instances: UploadRange | null
    segments: UploadRange | null
  }
  culled: number
  geometryBuilds: number
  geometryHits: number
}

/** 物理画布在准备时换算为逻辑视口；原点或变换模式改变时禁止复用编码。 */
export interface PreparationFrame {
  width: number
  height: number
  dpr: number
  origin: PrimitivePoint
  transform: DataTransform | undefined
  reusable: boolean
}
