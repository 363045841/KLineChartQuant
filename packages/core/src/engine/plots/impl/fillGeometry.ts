// 构造两条折线之间的带状区域，按真实交点拆分，避免自交。

type Point = { readonly x: number; readonly y: number }

export interface FillBand {
  readonly color: string
  readonly polygons: readonly (readonly Point[])[]
}

// 在线段上插值，保证填充边缘与 Plot 的投影折线一致。
function interpolate(a: Point, b: Point, ratio: number): Point {
  return { x: a.x + (b.x - a.x) * ratio, y: a.y + (b.y - a.y) * ratio }
}

// 对齐下标构建带状几何；缺点断开，首尾止于折线端点，不外推矩形。
export function buildFillBands(
  from: ReadonlyMap<number, Point>,
  to: ReadonlyMap<number, Point>,
  colors: readonly (string | null)[],
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
    const leftDifference = a.y - d.y
    const rightDifference = b.y - c.y
    if (leftDifference === 0 && rightDifference === 0) continue
    const cuts = [0, 1]
    if (
      (leftDifference < 0 && rightDifference > 0) ||
      (leftDifference > 0 && rightDifference < 0)
    ) {
      const crossing = leftDifference / (leftDifference - rightDifference)
      cuts.push(crossing)
    }
    cuts.sort((left, right) => left - right)
    for (let part = 1; part < cuts.length; part++) {
      const start = cuts[part - 1]!
      const end = cuts[part]!
      let polygons = batches.get(color)
      if (!polygons) {
        polygons = []
        batches.set(color, polygons)
      }
      // 先排序上下边界，使同色子路径方向一致，避免相交时绕向抵消。
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
  }
  return [...batches].map(([color, polygons]) => ({ color, polygons }))
}
