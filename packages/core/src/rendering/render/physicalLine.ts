import type { DrawLineStrip } from './Renderer'

function physicalLineWidth(width: number, dpr: number): number {
  return Math.max(1, Math.round(width * dpr))
}

function alignedCenter(value: number, widthPx: number, dpr: number): number {
  const base = Math.floor(value * dpr)
  return (base + (widthPx % 2 === 0 ? 0 : 0.5)) / dpr
}

function alignedEdge(value: number, dpr: number): number {
  return Math.round(value * dpr) / dpr
}

/** 仅对轴向线吸附物理像素；斜线保持原始顶点供 MSAA 平滑。 */
export function prepareLineStripForPhysicalPixels(
  strip: DrawLineStrip,
  dpr: number,
): DrawLineStrip {
  const widthPx = physicalLineWidth(strip.width ?? 1, dpr)
  const width = widthPx / dpr
  const first = strip.points[0]
  if (!first) return { ...strip, width }

  const horizontal = strip.points.every((point) => point.y === first.y)
  const vertical = strip.points.every((point) => point.x === first.x)
  if (!horizontal && !vertical) return { ...strip, width }

  if (horizontal) {
    const y = alignedCenter(first.y, widthPx, dpr)
    return {
      ...strip,
      width,
      points: strip.points.map((point) => ({ x: alignedEdge(point.x, dpr), y })),
    }
  }

  const x = alignedCenter(first.x, widthPx, dpr)
  return {
    ...strip,
    width,
    points: strip.points.map((point) => ({ x, y: alignedEdge(point.y, dpr) })),
  }
}
