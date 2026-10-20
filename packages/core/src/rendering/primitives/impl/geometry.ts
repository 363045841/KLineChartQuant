/** 共享路径几何：圆角轮廓、连续 dash 与描边面积；不访问任何绘制设备。 */
import type { PaintPrimitive, PrimitivePath, PrimitivePoint } from '../types.js'

type Stroke = Extract<PaintPrimitive, { kind: 'stroke' }>
const TAU = Math.PI * 2

/** 按物理像素误差细分圆，避免放大与高 DPR 下出现明显棱角。 */
export function circlePath(x: number, y: number, radius: number, dpr = 1): PrimitivePath {
  const count = Math.max(12, Math.ceil(Math.PI / Math.acos(Math.max(-1, 1 - 0.15 / Math.max(radius * dpr, 0.15)))))
  return Array.from({ length: count }, (_, i) => ({
    x: x + Math.cos(i * TAU / count) * radius,
    y: y + Math.sin(i * TAU / count) * radius,
  }))
}

/** 生成顺时针矩形或圆角矩形轮廓。 */
export function rectPath(x: number, y: number, width: number, height: number, radius = 0, dpr = 1): PrimitivePath {
  const r = Math.max(0, Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2))
  if (r === 0) return [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }]
  const segments = Math.max(3, Math.ceil(circlePath(0, 0, r, dpr).length / 4))
  const centers = [[x + width - r, y + r], [x + width - r, y + height - r], [x + r, y + height - r], [x + r, y + r]]
  return centers.flatMap(([cx, cy], corner) => Array.from({ length: segments + 1 }, (_, i) => {
    const angle = (corner - 1) * Math.PI / 2 + i * Math.PI / 2 / segments
    return { x: cx! + r * Math.cos(angle), y: cy! + r * Math.sin(angle) }
  }))
}

/** 沿路径累计长度切 dash；折点不重置相位，奇数 dash 自动重复。 */
export function dashPath(path: PrimitivePath, dash: readonly number[], offset = 0): PrimitivePath[] {
  const pattern = dash.length % 2 ? [...dash, ...dash] : [...dash]
  const period = pattern.reduce((sum, value) => sum + value, 0)
  if (period <= 0 || pattern.some(value => value < 0 || !Number.isFinite(value))) return [path]
  let phase = ((offset % period) + period) % period
  let index = 0
  while (phase >= pattern[index]!) { phase -= pattern[index]!; index = (index + 1) % pattern.length }
  let remaining = pattern[index]! - phase
  const result: PrimitivePoint[][] = []
  let active: PrimitivePoint[] | null = null
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!, b = path[i]!
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    let distance = 0
    while (distance < length) {
      if (remaining <= 1e-10) {
        index = (index + 1) % pattern.length
        remaining = pattern[index]!
        if (index % 2) active = null
        continue
      }
      const end = Math.min(length, distance + remaining)
      const from = { x: a.x + (b.x - a.x) * distance / length, y: a.y + (b.y - a.y) * distance / length }
      const to = { x: a.x + (b.x - a.x) * end / length, y: a.y + (b.y - a.y) * end / length }
      if (index % 2 === 0) {
        if (!active) { active = [from]; result.push(active) }
        active.push(to)
      }
      remaining -= end - distance
      distance = end
    }
  }
  return result
}

/** 归一化闭合轮廓方向，使描边组成面的 nonzero 并集不会相互抵消。 */
function positive(path: PrimitivePath): PrimitivePath {
  let area = 0
  for (let i = 0; i < path.length; i++) {
    const a = path[i]!, b = path[(i + 1) % path.length]!
    area += a.x * b.y - b.x * a.y
  }
  return area < 0 ? [...path].reverse() : path
}

/** 将描边转成同向面积轮廓；后端用 stencil 并集，交点不会重复混合颜色。 */
export function strokePaths(stroke: Stroke, dpr: number): PrimitivePath[] {
  const result: PrimitivePath[] = []
  const half = stroke.width / 2
  if (!(half > 0)) return result
  for (const source of stroke.paths) {
    if (source.length < 2) continue
    const closedSource = stroke.closed ? [...source, source[0]!] : source
    const dashed = stroke.dash && stroke.dash.some(value => value > 0)
    const paths = dashed ? dashPath(closedSource, stroke.dash!, stroke.dashOffset) : [closedSource]
    for (const rawPath of paths) {
      const path = rawPath.filter((point, index) => index === 0 || point.x !== rawPath[index - 1]!.x || point.y !== rawPath[index - 1]!.y)
      const closed = stroke.closed && !dashed
      const cap = stroke.cap ?? 'butt'
      const join = stroke.join ?? 'miter'
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1]!, b = path[i]!
        const length = Math.hypot(b.x - a.x, b.y - a.y)
        const ux = (b.x - a.x) / length, uy = (b.y - a.y) / length
        const start = !closed && i === 1 && cap === 'square' ? half : 0
        const end = !closed && i === path.length - 1 && cap === 'square' ? half : 0
        const nx = -uy * half, ny = ux * half
        result.push(positive([
          { x: a.x - ux * start + nx, y: a.y - uy * start + ny },
          { x: b.x + ux * end + nx, y: b.y + uy * end + ny },
          { x: b.x + ux * end - nx, y: b.y + uy * end - ny },
          { x: a.x - ux * start - nx, y: a.y - uy * start - ny },
        ]))
      }
      if (!closed && cap === 'round' && path.length >= 2) {
        result.push(circlePath(path[0]!.x, path[0]!.y, half, dpr), circlePath(path.at(-1)!.x, path.at(-1)!.y, half, dpr))
      }
      const vertices = closed ? path.slice(0, -1) : path
      for (let i = closed ? 0 : 1; i < (closed ? vertices.length : vertices.length - 1); i++) {
        const a = vertices[(i - 1 + vertices.length) % vertices.length]!, b = vertices[i]!, c = vertices[(i + 1) % vertices.length]!
        if (join === 'round') { result.push(circlePath(b.x, b.y, half, dpr)); continue }
        const al = Math.hypot(b.x - a.x, b.y - a.y), bl = Math.hypot(c.x - b.x, c.y - b.y)
        const ux = (b.x - a.x) / al, uy = (b.y - a.y) / al
        const vx = (c.x - b.x) / bl, vy = (c.y - b.y) / bl
        const cross = ux * vy - uy * vx
        if (Math.abs(cross) < 1e-10) continue
        const side = cross > 0 ? -1 : 1
        const p = { x: b.x - uy * half * side, y: b.y + ux * half * side }
        const q = { x: b.x - vy * half * side, y: b.y + vx * half * side }
        const t = ((q.x - p.x) * vy - (q.y - p.y) * vx) / cross
        const m = { x: p.x + ux * t, y: p.y + uy * t }
        const miter = join === 'miter' && Math.hypot(m.x - b.x, m.y - b.y) <= half * (stroke.miterLimit ?? 10)
        result.push(positive(miter ? [b, p, m, q] : [b, p, q]))
      }
    }
  }
  return result
}

/** 将任意轮廓展开为有向三角扇；stencil 保留其 winding，凹形与自交无需先三角化。 */
export function pathTriangles(paths: readonly PrimitivePath[]): PrimitivePoint[] {
  const points: PrimitivePoint[] = []
  for (const path of paths) for (let i = 2; i < path.length; i++) points.push(path[0]!, path[i - 1]!, path[i]!)
  return points
}
