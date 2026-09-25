import {
  AXIS_DISPLAY,
  resolveEffectiveAxisDisplay,
  type EffectiveAxisDisplayInput,
} from '../../foundation/config/axisSettings.js'
import type { PaneInfo, YAxisTick } from '../../foundation/plugin/types.js'
import { ScaleType } from '../../foundation/types/scaleType.js'

/** Choose a readable interval near 42px; panning does not change the visible span. */
function niceStep(rough: number, pixelsPerUnit: number): number {
  const power = 10 ** Math.floor(Math.log10(rough))
  const candidates = [1, 2, 2.5, 5, 7.5, 10].map((multiple) => multiple * power)
  const eligible = candidates.filter((step) => step * pixelsPerUnit >= 28)
  return (eligible.length ? eligible : candidates).reduce((best, step) =>
    Math.abs(step * pixelsPerUnit - 42) < Math.abs(best * pixelsPerUnit - 42) ? step : best,
  )
}

export function createYAxisTicks(pane: PaneInfo, display: EffectiveAxisDisplayInput): YAxisTick[] {
  const { yAxis, height } = pane
  const top = yAxis.getPaddingTop()
  const bottom = Math.max(top, height - yAxis.getPaddingBottom())
  const topPrice = yAxis.yToPrice(top)
  const bottomPrice = yAxis.yToPrice(bottom)
  const scaleType = yAxis.getScaleType()
  const right = resolveEffectiveAxisDisplay('right', display)
  const left = resolveEffectiveAxisDisplay('left', display)
  const percent =
    pane.role === 'price' &&
    (yAxis.getBasePrice() ?? 0) > 0 &&
    (right === AXIS_DISPLAY.PERCENT ||
      (right === AXIS_DISPLAY.NONE && left === AXIS_DISPLAY.PERCENT))
  const log = !percent && scaleType === ScaleType.Log && topPrice > 0 && bottomPrice > 0
  const toAxis = (price: number) =>
    percent ? yAxis.toPercent(price) : log ? Math.log10(price) : price
  const fromAxis = (value: number) =>
    percent ? yAxis.fromPercent(value) : log ? 10 ** value : value
  const high = toAxis(topPrice)
  const low = toAxis(bottomPrice)
  if (!Number.isFinite(high) || !Number.isFinite(low) || high <= low || bottom <= top) return []

  const pixelsPerUnit = (bottom - top) / (high - low)
  const step = niceStep(42 / pixelsPerUnit, pixelsPerUnit)
  if (!Number.isFinite(step) || step <= 0) return []
  const ticks: YAxisTick[] = []
  // Use integer multiples of the step, so the same value survives successive pans.
  const first = Math.ceil(low / step - 1e-10)
  const last = Math.floor(high / step + 1e-10)
  for (let index = first; index <= last && ticks.length < 100; index++) {
    const value = fromAxis(index * step)
    const y = yAxis.priceToY(value)
    if (Number.isFinite(value) && Number.isFinite(y) && y >= top - 0.01 && y <= bottom + 0.01) {
      ticks.push({ y, value })
    }
  }
  return ticks
}
