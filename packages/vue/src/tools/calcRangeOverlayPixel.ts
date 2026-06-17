import type { ChartController } from '@363045841yyt/klinechart-core/controllers'

export interface Bounds {
  start: number
  end: number
}

export function calcRangeOverlayPixel(
  bounds: Bounds,
  controller: ChartController,
  container: HTMLElement,
  viewport: { scrollLeft: number; plotWidth: number; plotHeight: number },
): { left: number; width: number; height: number } {
  const { kWidth: currentKWidth, kGap: currentKGap } = controller.getKWidthKGap()
  const dpr = controller.getCurrentDpr()
  const kWidthPx = Math.max(
    1,
    Math.round(currentKWidth * dpr) + (Math.round(currentKWidth * dpr) % 2 === 0 ? 1 : 0),
  )
  const kGapPx = Math.round(currentKGap * dpr)
  const unitPx = kWidthPx + kGapPx
  const startXPx = kGapPx

  const leftBuffer = container.scrollLeft - viewport.scrollLeft
  const left = leftBuffer + (startXPx + bounds.start * unitPx) / dpr
  const right = leftBuffer + (startXPx + bounds.end * unitPx + kWidthPx) / dpr
  return { left, width: right - left, height: viewport.plotHeight }
}
