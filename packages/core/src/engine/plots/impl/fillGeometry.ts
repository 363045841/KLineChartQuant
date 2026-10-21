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

/** 上下两条等长链组成的带子；合并后一次三角化，避免每根 bar 一个路径。 */
interface Band {
  upper: Point[]
  lower: Point[]
}

/** 合并只接受共享边完全重合的四边形，坐标来自同一次投影。 */
function samePoint(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9
}

/** 同朝向的相邻四边形直接扩展链；朝向翻转或交点处起新带子，避免自交。 */
function appendQuad(bands: Band[], quad: Point[]): void {
  const band = bands.at(-1)
  // 交点处上下边重合，此时合批会产生自交的“蝴蝶结”，必须拆成独立带子。
  if (band && quad.length === 4 && !samePoint(quad[0]!, quad[3]!)) {
    const upperEnd = band.upper.at(-1)!
    const lowerEnd = band.lower.at(-1)!
    if (samePoint(quad[0]!, upperEnd) && samePoint(quad[3]!, lowerEnd)) {
      band.upper.push(quad[1]!)
      band.lower.push(quad[2]!)
      return
    }
  }
  bands.push({ upper: [quad[0]!, quad[1]!], lower: [quad[3]!, quad[2]!] })
}

/**
 * 构造两条边界之间的填充带。
 *
 * @param from 起点边界的点表，键是显示下标（bar 下标 + offset）
 * @param to 终点边界的点表，键与 from 同一坐标系
 * @param colors 逐 bar 颜色，下标与 Plot.data 对齐，不含 offset
 * @param colorOffset 边界的显示位移；显示下标减回位移后才能命中 colors
 * @param fromStep from 是否为阶梯线
 * @param toStep to 是否为阶梯线
 * @returns 按颜色分组的填充带，每条带是一段连续的上下链
 */
export function buildFillBands(
  from: ReadonlyMap<number, Point>,
  to: ReadonlyMap<number, Point>,
  colors: readonly (string | null)[],
  colorOffset: number,
  fromStep = false,
  toStep = false,
): readonly FillBand[] {
  const batches = new Map<string, Band[]>()
  for (const [index, a] of from) {
    const b = from.get(index + 1)
    const d = to.get(index)
    const c = to.get(index + 1)
    if (!b || !c || !d) continue
    // 延续右端 bar 取色；下标是显示下标，必须减回位移才能与 Plot.data 对齐。
    const color = colors[index + 1 - colorOffset]
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
    if (batch) for (const polygon of polygons) appendQuad(batch, polygon)
    else {
      const created: Band[] = []
      for (const polygon of polygons) appendQuad(created, polygon)
      batches.set(color, created)
    }
  }
  return [...batches].map(([color, bands]) => ({
    color,
    polygons: bands.map((band) => [...band.upper, ...band.lower.slice().reverse()]),
  }))
}
