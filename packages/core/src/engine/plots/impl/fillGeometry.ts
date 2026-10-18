// 构造折线或阶梯线之间的带状区域，按跳变与真实交点拆分，避免自交。

type Point = { readonly x: number; readonly y: number }

export interface FillBand {
  readonly color: string
  readonly polygons: readonly (readonly Point[])[]
}

// 在线段上插值，保证填充边缘与 Plot 的投影折线一致。
function interpolate(a: Point, b: Point, ratio: number): Point {
  return { x: a.x + (b.x - a.x) * ratio, y: a.y + (b.y - a.y) * ratio }
}

// 为两条线段生成填充多边形，按真实交点拆分并统一绕向。
function segmentPolygons(a: Point, b: Point, c: Point, d: Point): Point[][] {
  const leftDifference = a.y - d.y
  const rightDifference = b.y - c.y
  if (leftDifference === 0 && rightDifference === 0) return []
  const cuts = [0, 1]
  if (
    (leftDifference < 0 && rightDifference > 0) ||
    (leftDifference > 0 && rightDifference < 0)
  ) {
    cuts.splice(1, 0, leftDifference / (leftDifference - rightDifference))
  }
  const polygons: Point[][] = []
  for (let part = 1; part < cuts.length; part++) {
    const start = cuts[part - 1]!
    const end = cuts[part]!
    const upperStart = interpolate(a, b, start)
    const upperEnd = interpolate(a, b, end)
    const lowerStart = interpolate(d, c, start)
    const lowerEnd = interpolate(d, c, end)
    polygons.push(
      upperStart.y + upperEnd.y <= lowerStart.y + lowerEnd.y
        ? [upperStart, upperEnd, lowerEnd, lowerStart]
        : [lowerStart, lowerEnd, upperEnd, upperStart],
    )
  }
  return polygons
}

// 对齐下标构建带状几何；阶梯边界在中点分段，缺点断开，首尾止于原始端点。
export function buildFillBands(
  from: ReadonlyMap<number, Point>,
  to: ReadonlyMap<number, Point>,
  colors: readonly (string | null)[],
  fromStep = false,
  toStep = false,
): readonly FillBand[] {
  const batches = new Map<string, Point[][]>()
  for (const [index, a] of from) {
    const b = from.get(index + 1)
    const d = to.get(index)
    const c = to.get(index + 1)
    if (!b || !c || !d) continue
    // 延续原始语义：相邻两点之间整段使用右端 bar 的颜色。
    const color = colors[index + 1]
    if (color === null || color === undefined) continue
    let polygons: Point[][]
    if (fromStep || toStep) {
      const fromMiddle = interpolate(a, b, 0.5)
      const toMiddle = interpolate(d, c, 0.5)
      // 跳变两侧分别取当前平台高度，不把垂直边误作斜线插值。
      polygons = [
        ...segmentPolygons(
          a,
          fromStep ? { x: fromMiddle.x, y: a.y } : fromMiddle,
          toStep ? { x: toMiddle.x, y: d.y } : toMiddle,
          d,
        ),
        ...segmentPolygons(
          fromStep ? { x: fromMiddle.x, y: b.y } : fromMiddle,
          b,
          c,
          toStep ? { x: toMiddle.x, y: c.y } : toMiddle,
        ),
      ]
    } else {
      polygons = segmentPolygons(a, b, c, d)
    }
    if (polygons.length === 0) continue
    const batch = batches.get(color)
    if (batch) batch.push(...polygons)
    else batches.set(color, polygons)
  }
  return [...batches].map(([color, polygons]) => ({ color, polygons }))
}
