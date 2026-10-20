/** GPU 批次准备：路径变为 stencil 几何，只有文字借助 Canvas 字形栅格化。 */
import type { PaintPrimitive, PrimitivePoint } from '../types.js'
import { circlePath, rectPath, pathTriangles, strokePaths } from './geometry.js'

export interface PreparedPrimitive {
  vertices: Float32Array
  maskCount: number
  evenodd: boolean
  direct?: boolean
  image?: HTMLCanvasElement
}

/** 每次绘制前完整准备；准备失败时尚未接触可见目标。 */
export function preparePrimitives(
  primitives: readonly PaintPrimitive[], width: number, height: number, dpr: number, document: Document,
): PreparedPrimitive[] {
  const colors = new Map<string, readonly number[]>()
  const scratch = document.createElement('canvas')
  scratch.width = scratch.height = 1
  const colorContext = scratch.getContext('2d', { willReadFrequently: true })
  if (!colorContext) throw new Error('Primitive color context unavailable')
  /** CSS 颜色解析由浏览器完成，与 Canvas 后端支持的颜色语法一致。 */
  function rgba(color: string, opacity: number): readonly number[] {
    let value = colors.get(color)
    if (!value) {
      colorContext!.clearRect(0, 0, 1, 1)
      colorContext!.fillStyle = color
      colorContext!.fillRect(0, 0, 1, 1)
      value = Array.from(colorContext!.getImageData(0, 0, 1, 1).data, component => component / 255)
      colors.set(color, value)
    }
    return [value[0]!, value[1]!, value[2]!, value[3]! * opacity]
  }
  /** GPU 顶点直接使用裁剪坐标，屏幕大坐标在双精度投影后才降为 Float32。 */
  function vertices(points: readonly PrimitivePoint[], color: readonly number[], uv?: readonly PrimitivePoint[]): Float32Array {
    const values = new Float32Array(points.length * 8)
    for (let i = 0; i < points.length; i++) {
      const point = points[i]!, texture = uv?.[i]
      values.set([point.x * dpr / width * 2 - 1, 1 - point.y * dpr / height * 2,
        texture?.x ?? 0, texture?.y ?? 0, color[0]!, color[1]!, color[2]!, color[3]!], i * 8)
    }
    return values
  }
  return primitives.map(primitive => {
    if (primitive.kind === 'circle' || primitive.kind === 'rect') {
      const path = primitive.kind === 'circle'
        ? circlePath(primitive.x, primitive.y, primitive.radius, dpr)
        : rectPath(primitive.x, primitive.y, primitive.width, primitive.height, primitive.radius, dpr)
      return { vertices: vertices(pathTriangles([path]), rgba(primitive.color, 1)), maskCount: 0, evenodd: false, direct: true }
    }
    if (primitive.kind === 'text') {
      const image = document.createElement('canvas')
      const measure = image.getContext('2d')
      if (!measure) throw new Error('Primitive text context unavailable')
      measure.font = primitive.font
      measure.textAlign = primitive.align
      measure.textBaseline = primitive.baseline
      const metrics = measure.measureText(primitive.text)
      // 使用实际字形边界，保留斜体悬垂、基线和 CJK 字体的完整像素。
      const left = Math.floor(-metrics.actualBoundingBoxLeft * dpr) - 2
      const top = Math.floor((-metrics.actualBoundingBoxAscent + (primitive.offsetY ?? 0)) * dpr) - 2
      image.width = Math.max(1, Math.ceil(metrics.actualBoundingBoxRight * dpr) - left + 2)
      image.height = Math.max(1, Math.ceil((metrics.actualBoundingBoxDescent + (primitive.offsetY ?? 0)) * dpr) - top + 2)
      measure.setTransform(dpr, 0, 0, dpr, -left, -top)
      measure.font = primitive.font
      measure.textAlign = primitive.align
      measure.textBaseline = primitive.baseline
      measure.fillStyle = primitive.color
      measure.fillText(primitive.text, 0, primitive.offsetY ?? 0)
      const angle = primitive.rotation ?? 0, cos = Math.cos(angle), sin = Math.sin(angle)
      const corners = [[left, top], [left + image.width, top], [left + image.width, top + image.height], [left, top + image.height]].map(([x, y]) => ({
        x: primitive.x + (x! * cos - y! * sin) / dpr,
        y: primitive.y + (x! * sin + y! * cos) / dpr,
      }))
      const order = [0, 1, 2, 0, 2, 3]
      const uv = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]
      return { vertices: vertices(order.map(i => corners[i]!), [1, 1, 1, 1], order.map(i => uv[i]!)), maskCount: 0, evenodd: false, image }
    }
    const paths = primitive.kind === 'stroke' ? strokePaths(primitive, dpr) : primitive.paths
    const mask = pathTriangles(paths)
    let left = width / dpr, right = 0, top = height / dpr, bottom = 0
    for (const path of paths) for (const point of path) {
      left = Math.min(left, point.x); right = Math.max(right, point.x)
      top = Math.min(top, point.y); bottom = Math.max(bottom, point.y)
    }
    const cover = pathTriangles([rectPath(Math.max(0, left), Math.max(0, top), Math.max(0, Math.min(width / dpr, right) - Math.max(0, left)), Math.max(0, Math.min(height / dpr, bottom) - Math.max(0, top)))])
    return {
      vertices: vertices([...mask, ...cover], rgba(primitive.color, primitive.kind === 'fill' ? primitive.opacity ?? 1 : 1)),
      maskCount: mask.length,
      evenodd: primitive.kind === 'fill' && primitive.fillRule === 'evenodd',
    }
  })
}
