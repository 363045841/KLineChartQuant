/** 分时纯几何投影：消费帧级分段，按昨收切割涨跌面积，不依赖 Canvas 或主题。 */
import { resolveTimeShareBaseline } from '@/engine/chartModel/index.js'
import type { PrimitiveRenderContext } from '@/foundation/plugin/index.js'
import { isTimeShareDataArray } from '@/foundation/types/price.js'
import type { PrimitivePath, PrimitivePoint } from '@/rendering/primitives/types.js'
import type {
  TimeShareAreaProjection,
  TimeShareProjection,
  TimeShareSegmentProjection,
} from '../types.js'

/** 在每次穿越昨收时插入精确交点，使面积条带不会跨越涨跌两侧。 */
function splitAtBaseline(points: PrimitivePath, baselineY: number): PrimitivePoint[] {
  const split: PrimitivePoint[] = []
  for (let index = 0; index < points.length; index++) {
    const point = points[index]!
    const previous = points[index - 1]
    if (previous && (previous.y - baselineY) * (point.y - baselineY) < 0) {
      const ratio = (baselineY - previous.y) / (point.y - previous.y)
      split.push({ x: previous.x + (point.x - previous.x) * ratio, y: baselineY })
    }
    split.push(point)
  }
  return split
}

/** 构建单侧零重叠条带；渐变范围取整个连续段的极值到昨收。 */
function projectArea(
  points: PrimitivePath,
  baselineY: number,
  above: boolean,
): TimeShareAreaProjection | null {
  const paths: PrimitivePoint[][] = []
  let fromY = baselineY
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1]!
    const b = points[index]!
    const middleY = (a.y + b.y) / 2
    if (above ? middleY >= baselineY : middleY <= baselineY) continue
    const baseA = { x: a.x, y: baselineY }
    const baseB = { x: b.x, y: baselineY }
    paths.push(above ? [a, b, baseB, baseA] : [baseA, baseB, b, a])
    fromY = above ? Math.min(fromY, a.y, b.y) : Math.max(fromY, a.y, b.y)
  }
  return paths.length > 0 ? { paths, fromY, toY: baselineY } : null
}

/** 投影单日或五日分时；缺失昨收仅禁用面积和参考线，帧级段之间绝不连线。 */
export function projectTimeShare(context: PrimitiveRenderContext): TimeShareProjection {
  const baselines: PrimitivePath[] = []
  const segments: TimeShareSegmentProjection[] = []
  const geometry = context.timeShareGeometry
  if (
    !geometry ||
    geometry.days.length === 0 ||
    !isTimeShareDataArray(context.data) ||
    context.data.length === 0
  ) {
    return { baselines, segments }
  }
  const baseline = resolveTimeShareBaseline(context.timeShareBaseline)
  const baselineY = baseline === null ? null : context.pane.yAxis.priceToY(baseline)
  if (baselineY !== null) {
    for (const day of geometry.days) {
      if (day.endX > day.startX) {
        baselines.push([
          { x: day.startX, y: baselineY },
          { x: day.endX, y: baselineY },
        ])
      }
    }
  }
  for (const segment of geometry.segments) {
    const start = Math.max(segment.dataStartIndex, context.range.start)
    const end = Math.min(segment.dataEndIndex, context.range.end, context.data.length)
    const price: PrimitivePoint[] = []
    const average: PrimitivePoint[] = []
    for (let index = start; index < end; index++) {
      const point = context.data[index]
      const x = context.kLineCenters[index - context.range.start]
      if (!point || x === undefined) continue
      price.push({ x, y: context.pane.yAxis.priceToY(point.price) })
      average.push({ x, y: context.pane.yAxis.priceToY(point.average) })
    }
    if (price.length < 2) continue
    const split = baselineY === null ? [] : splitAtBaseline(price, baselineY)
    segments.push({
      price,
      average,
      up: baselineY === null ? null : projectArea(split, baselineY, true),
      down: baselineY === null ? null : projectArea(split, baselineY, false),
    })
  }
  return { baselines, segments }
}
