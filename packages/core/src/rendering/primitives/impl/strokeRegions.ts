/**
 * 描边覆盖率区域：把一条描边拆成着色器能按距离直接算覆盖率的区域。
 *
 * 两种区域共用同一套实例和同一个着色器程序：
 * - capsule：圆角连接 + 圆端帽，每段一个胶囊；相邻段共享同一个圆盘，由着色器按角平分面切分归属。
 * - polygon：尖角连接 + 平头/方头端帽，每段一个凸四边形；相邻段共享同一条切割边，
 *   互不重叠、不留缝，片元里取四边形距离即可，不需要归属判断。
 *
 * 只接管屏幕空间、开放路径；闭合路径、圆角与尖角混用、bevel 与数据空间折线仍走三角化。
 * 不透明度由调用方判断（半透明描边在共享切边上会二次混合，不进入解析式覆盖）。
 */

import type { PaintPrimitive, PrimitivePoint } from '../types.js'
import { dashPath } from './geometry.js'

type Stroke = Extract<PaintPrimitive, { kind: 'stroke' }>

/** 覆盖率区域种类；数值随实例进入着色器，0 为胶囊、1 为凸四边形。 */
export const STROKE_REGION = { capsule: 0, polygon: 1 } as const
export type StrokeRegion = (typeof STROKE_REGION)[keyof typeof STROKE_REGION]

/** 视为共线的转角阈值（sin 值），与三角化共用同一判据。 */
const COLLINEAR_SIN = 0.02
/** 求偏移线交点时的最小叉积，低于它按平行处理，避免退化求交放大误差。 */
const PARALLEL_SIN = 1e-4

/** 折点处带宽两侧的切割点：沿路径方向看，左右偏移线的交点。 */
interface Cut {
  readonly left: PrimitivePoint
  readonly right: PrimitivePoint
}

/** 接收一段凸四边形，四个角按边界顺序给出。 */
export type StrokePolygonSink = (
  first: PrimitivePoint,
  second: PrimitivePoint,
  third: PrimitivePoint,
  fourth: PrimitivePoint,
) => void

/**
 * 选择描边的覆盖率区域。
 *
 * @param stroke 待判定的描边原语
 * @returns 区域种类；null 表示继续走三角化
 */
export function strokeRegion(stroke: Stroke): StrokeRegion | null {
  if (!(stroke.width > 0) || stroke.closed === true || stroke.dataSpace === true) return null
  if (!stroke.paths.some((path) => path.length >= 2)) return null
  const join = stroke.join ?? 'miter'
  const cap = stroke.cap ?? 'butt'
  const dashed = stroke.dash?.some((value) => value > 0) === true
  // 圆角两端由胶囊端帽表达；虚线会在共享圆盘上取到半段，退回三角化。
  if (join === 'round') return cap === 'round' && !dashed ? STROKE_REGION.capsule : null
  // 平头/方头端帽与尖角连接走四边形：端帽是垂直切边，尖角是角平分切边。
  if (join !== 'miter' || cap === 'round') return null
  return STROKE_REGION.polygon
}

/**
 * 把描边展开成互不重叠的凸四边形。
 *
 * 相邻段在折点处共用同一条切边，因此四边形恰好拼接：像素只落在一个四边形里，
 * 拐角既不会二次混合，也不会因为圆盘重叠露出一圈硬边。
 *
 * @param stroke 走 polygon 区域的描边
 * @param push 接收四边形的出口，坐标保持调用方传入的坐标系
 */
export function emitStrokePolygons(stroke: Stroke, push: StrokePolygonSink): void {
  const half = stroke.width / 2
  const cap = stroke.cap ?? 'butt'
  const limit = stroke.miterLimit ?? 10
  const dashed = stroke.dash?.some((value) => value > 0) === true
  // 虚线与三角化一致：折线不重置相位，每段虚线仍按原路径拐角连接。
  const sources: readonly (readonly PrimitivePoint[])[] = dashed
    ? stroke.paths.flatMap((path) => dashPath(path, stroke.dash!, stroke.dashOffset))
    : stroke.paths
  for (const source of sources) {
    const points = distinct(source)
    if (points.length < 2) continue
    const start = capCut(points[0]!, unit(points[0]!, points[1]!), -1, cap, half)
    const end = capCut(points.at(-1)!, unit(points.at(-2)!, points.at(-1)!), 1, cap, half)
    // 折点切割先算完再写，保证中途退化时不会留下半条描边。
    const cuts: Cut[] = [start]
    for (let i = 1; i < points.length - 1; i++)
      cuts.push(jointCut(points[i - 1]!, points[i]!, points[i + 1]!, half, limit))
    cuts.push(end)
    for (let i = 1; i < points.length; i++) {
      const from = cuts[i - 1]!,
        to = cuts[i]!
      // 退化成线的四边形会让片元的内外判定失效，直接跳过。
      if (Math.abs(quadArea(from.left, to.left, to.right, from.right)) < 1e-9) continue
      push(from.left, to.left, to.right, from.right)
    }
  }
}

/** 去掉相邻重复点：重复点没有方向，会让切边求解退化。 */
function distinct(path: readonly PrimitivePoint[]): PrimitivePoint[] {
  const points: PrimitivePoint[] = []
  for (const point of path) {
    const previous = points.at(-1)
    if (previous && previous.x === point.x && previous.y === point.y) continue
    points.push(point)
  }
  return points
}

/** 四边形面积；接近零说明退化成线，片元里的内外判定会失效。 */
function quadArea(
  first: PrimitivePoint,
  second: PrimitivePoint,
  third: PrimitivePoint,
  fourth: PrimitivePoint,
): number {
  // 对角线叉积，只用差值，避免大坐标相减的抵消误差。
  return (
    ((third.x - first.x) * (fourth.y - second.y) -
      (third.y - first.y) * (fourth.x - second.x)) /
    2
  )
}

/** 单位方向；调用方保证两点不重合。 */
function unit(from: PrimitivePoint, to: PrimitivePoint): PrimitivePoint {
  const length = Math.hypot(to.x - from.x, to.y - from.y)
  return { x: (to.x - from.x) / length, y: (to.y - from.y) / length }
}

/**
 * 端帽切边。
 *
 * @param point 折线端点
 * @param direction 该端相邻段的方向
 * @param outward 沿路径向外的符号（起点 -1，终点 +1）
 * @param cap 端帽样式
 * @param half 半线宽
 */
function capCut(
  point: PrimitivePoint,
  direction: PrimitivePoint,
  outward: number,
  cap: CanvasLineCap,
  half: number,
): Cut {
  // 方头把切边整体外推一个半线宽；平头就在端点上切。
  const extend = cap === 'square' ? half * outward : 0
  const cx = point.x + direction.x * extend,
    cy = point.y + direction.y * extend
  const nx = -direction.y * half,
    ny = direction.x * half
  return { left: { x: cx + nx, y: cy + ny }, right: { x: cx - nx, y: cy - ny } }
}

/**
 * 折点切边：求相邻两段同一侧偏移线的交点。
 *
 * 近共线时两段偏移线几乎重合，直接用过折点的垂线切割（与极限位置一致）；
 * 斜接长度 `线宽 / sin(δ/2)` 超过 `miterLimit` 时沿角平分线内收，
 * 既保持四个角，也让两侧描边继续共用同一条切边。
 *
 * @param from 折点前一个点
 * @param at 折点
 * @param to 折点后一个点
 * @param half 半线宽
 * @param limit 斜接上限（相对线宽）
 */
function jointCut(
  from: PrimitivePoint,
  at: PrimitivePoint,
  to: PrimitivePoint,
  half: number,
  limit: number,
): Cut {
  const u = unit(from, at),
    v = unit(at, to)
  const cross = u.x * v.y - u.y * v.x,
    dot = u.x * v.x + u.y * v.y
  // 共线继续：偏移线重合，垂线切边等价于无穷远处的斜接。
  if (Math.abs(cross) < COLLINEAR_SIN && dot > 0) return perpendicular(at, u, half)
  // 发夹折返：两侧偏移线平行且分离，没有交点，按垂直切边近似。
  if (Math.abs(cross) < PARALLEL_SIN) return perpendicular(at, u, half)
  const left = offsetIntersection(at, u, half, v, half)
  const right = offsetIntersection(at, u, -half, v, -half)
  if (!left || !right) return perpendicular(at, u, half)
  const reach = Math.hypot(left.x - at.x, left.y - at.y)
  const maxReach = half * limit
  if (!(reach > maxReach)) return { left, right }
  const scale = maxReach / reach
  return {
    left: { x: at.x + (left.x - at.x) * scale, y: at.y + (left.y - at.y) * scale },
    right: { x: at.x + (right.x - at.x) * scale, y: at.y + (right.y - at.y) * scale },
  }
}

/** 过折点、垂直于来向的切边。 */
function perpendicular(at: PrimitivePoint, direction: PrimitivePoint, half: number): Cut {
  const nx = -direction.y * half,
    ny = direction.x * half
  return { left: { x: at.x + nx, y: at.y + ny }, right: { x: at.x - nx, y: at.y - ny } }
}

/**
 * 两条偏移线的交点：分别过 at、方向 u 与 v，法向偏移 du 与 dv。
 *
 * @returns 交点；两方向近平行时返回 null
 */
function offsetIntersection(
  at: PrimitivePoint,
  u: PrimitivePoint,
  du: number,
  v: PrimitivePoint,
  dv: number,
): PrimitivePoint | null {
  const px = at.x - u.y * du,
    py = at.y + u.x * du
  const qx = at.x - v.y * dv,
    qy = at.y + v.x * dv
  const denominator = u.x * v.y - u.y * v.x
  if (Math.abs(denominator) < PARALLEL_SIN) return null
  const t = ((qx - px) * v.y - (qy - py) * v.x) / denominator
  return { x: px + u.x * t, y: py + u.y * t }
}
