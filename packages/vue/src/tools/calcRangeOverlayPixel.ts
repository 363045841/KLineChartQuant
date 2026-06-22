import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
import { getPhysicalKLineConfig } from '@363045841yyt/klinechart-core/controllers'

export interface Bounds {
  start: number
  end: number
}

export function calcRangeOverlayPixel(
  bounds: Bounds,
  controller: ChartController,
  viewport: { scrollLeft: number; plotWidth: number; plotHeight: number },
): { left: number; width: number; height: number } {
  const { kWidth, kGap } = controller.getKWidthKGap()
  const dpr = controller.getCurrentDpr()
  const { kWidthPx, kGapPx, unitPx, startXPx } = getPhysicalKLineConfig(kWidth, kGap, dpr)

  const leftBuffer = controller.getLeftLoadBufferWidth()
  const left = leftBuffer + (startXPx + bounds.start * unitPx) / dpr
  const right = leftBuffer + (startXPx + bounds.end * unitPx + kWidthPx) / dpr
  return { left, width: right - left, height: viewport.plotHeight }
}
