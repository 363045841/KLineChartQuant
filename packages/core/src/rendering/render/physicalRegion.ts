import type { SurfaceRegion } from './SurfaceBackend'

export type PhysicalRegion = {
  x: number
  y: number
  width: number
  height: number
}

export type PhysicalBounds = {
  width: number
  height: number
}

/** 将逻辑 region 的两端分别对齐到物理像素，避免相邻 pane 出现缝隙。 */
export function toPhysicalRegion(
  region: SurfaceRegion,
  bounds?: PhysicalBounds,
): PhysicalRegion {
  const left = Math.round(region.x * region.dpr)
  const top = Math.round(region.y * region.dpr)
  const right = Math.round((region.x + region.width) * region.dpr)
  const bottom = Math.round((region.y + region.height) * region.dpr)
  const maxWidth = bounds ? Math.max(0, bounds.width) : Infinity
  const maxHeight = bounds ? Math.max(0, bounds.height) : Infinity
  const x = Math.max(0, Math.min(left, maxWidth))
  const y = Math.max(0, Math.min(top, maxHeight))
  const clippedRight = Math.max(x, Math.min(right, maxWidth))
  const clippedBottom = Math.max(y, Math.min(bottom, maxHeight))

  return { x, y, width: clippedRight - x, height: clippedBottom - y }
}
