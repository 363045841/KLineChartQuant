// 计算 Y 轴刻度：按可见价格范围与像素间距选取易读步长，输出刻度坐标和原始价格。
import {
  AXIS_DISPLAY,
  resolveEffectiveAxisDisplay,
  type AxisDisplaySetting,
  type EffectiveAxisDisplayInput,
} from '../../foundation/config/axisSettings.js'
import type { PaneInfo, YAxisTick } from '../../foundation/plugin/types.js'
import { ScaleType } from '../../foundation/types/scaleType.js'

const TARGET_TICK_SPACING_PX = 42
const MIN_TICK_SPACING_PX = 28

/** 共享网格优先使用右轴的显示单位；右轴隐藏时使用左轴。 */
function usesPercentAxis(right: AxisDisplaySetting, left: AxisDisplaySetting): boolean {
  return (
    right === AXIS_DISPLAY.PERCENT ||
    (right === AXIS_DISPLAY.NONE && left === AXIS_DISPLAY.PERCENT)
  )
}

/** 选择接近目标像素间距的易读步长；平移不会改变可见轴范围的跨度。 */
function niceStep(rough: number, pixelsPerUnit: number): number {
  const power = 10 ** Math.floor(Math.log10(rough))
  if (!Number.isFinite(power) || power === 0) return NaN
  const candidates = [1, 2, 2.5, 5, 7.5, 10].map((multiple) => multiple * power)
  // 在步长可表示的情况下，10 * power >= rough，必然存在达到目标间距的候选值。
  const eligible = candidates.filter(
    (step) => Number.isFinite(step) && step * pixelsPerUnit >= MIN_TICK_SPACING_PX,
  )
  if (eligible.length === 0) return NaN
  return eligible.reduce(
    (best, step) =>
      Math.abs(step * pixelsPerUnit - TARGET_TICK_SPACING_PX) <
      Math.abs(best * pixelsPerUnit - TARGET_TICK_SPACING_PX)
        ? step
        : best,
  )
}

/** 返回 pane 内的刻度坐标和原始价格；标签文本由轴渲染器格式化。 */
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
    usesPercentAxis(right, left)
  const log = !percent && scaleType === ScaleType.Log && topPrice > 0 && bottomPrice > 0
  const toAxis = (price: number) =>
    percent ? yAxis.toPercent(price) : log ? Math.log10(price) : price
  const fromAxis = (value: number) =>
    percent ? yAxis.fromPercent(value) : log ? 10 ** value : value
  const axisHigh = toAxis(topPrice)
  const axisLow = toAxis(bottomPrice)
  if (!Number.isFinite(axisHigh) || !Number.isFinite(axisLow) || axisHigh <= axisLow || bottom <= top)
    return []

  const pixelsPerUnit = (bottom - top) / (axisHigh - axisLow)
  const roughStep = TARGET_TICK_SPACING_PX / pixelsPerUnit
  if (!Number.isFinite(roughStep) || roughStep <= 0 || !Number.isFinite(pixelsPerUnit)) return []
  const step = niceStep(roughStep, pixelsPerUnit)
  if (!Number.isFinite(step) || step <= 0) return []
  const ticks: YAxisTick[] = []
  // 刻度锚定步长的整数倍，保证连续平移时同一刻度值保持稳定。
  const lowIndex = axisLow / step
  const highIndex = axisHigh / step
  const tolerance = Math.min(
    1e-6,
    Math.max(1e-9, 8 * Number.EPSILON * Math.max(Math.abs(lowIndex), Math.abs(highIndex))),
  )
  const first = Math.ceil(lowIndex - tolerance)
  const last = Math.floor(highIndex + tolerance)
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last)) return []
  // 根据面板高度和最小间距限制候选数量，同时防止异常坐标系产生过长循环。
  const maxCandidates = Math.ceil((bottom - top) / MIN_TICK_SPACING_PX) + 2
  for (
    let index = first, attempted = 0;
    index <= last && attempted < maxCandidates;
    index++, attempted++
  ) {
    const value = fromAxis(index * step)
    const y = yAxis.priceToY(value)
    if (Number.isFinite(value) && Number.isFinite(y) && y >= top - 0.01 && y <= bottom + 0.01) {
      ticks.push({ y, value })
    }
  }
  return ticks
}
