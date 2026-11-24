/** 两种执行后端共用的行情字段与绘图点转换；不依赖源码编译器。 */
import {
  DEFAULT_PLOT_COLOR,
  type MarkerPoint,
  type OhlcPlotDeclaration,
  type OhlcPlotPoint,
  type ScalarPlotDeclaration as PlotDeclaration,
  type PlotPoint,
} from '@363045841yyt/klinechart-plot-contracts'
import type { Bar } from '../../contracts/input.js'

/** 行情字段的唯一读取映射，未知字段由调用方返回 NaN。 */
export const FIELD_READERS: Readonly<Record<string, (bar: Bar) => number>> = {
  open: (bar) => bar.open,
  high: (bar) => bar.high,
  low: (bar) => bar.low,
  close: (bar) => bar.close,
  volume: (bar) => bar.volume,
  time: (bar) => bar.time,
}

/**
 * 把单根 bar 的绘图值转成最终点：颜色在这里物化，运行期模型不再有缺省色。
 *
 * @param declaration 当前 bar 的调用声明
 * @param value 数值；箭头按正负取方向色
 */
export function toPlotPoint(declaration: PlotDeclaration, value: number): PlotPoint | MarkerPoint {
  const fallback = declaration.color ?? DEFAULT_PLOT_COLOR
  const color =
    declaration.kind === 'arrow'
      ? ((value > 0 ? declaration.colorUp : declaration.colorDown) ?? fallback)
      : fallback
  // 标记点的文字色逐 bar 记录，缺省与图形同色。
  if (declaration.kind === 'shape' || declaration.kind === 'char')
    return { value, color, textColor: declaration.textColor ?? color }
  return { value, color }
}

/** 两种执行后端共享 OHLC 校验；任一缺值整根留空，极值按四个输入归一化。 */
export function toOhlcPlotPoint(
  declaration: OhlcPlotDeclaration,
  value: unknown,
): OhlcPlotPoint | undefined {
  if (
    value === null ||
    typeof value !== 'object' ||
    !('open' in value) ||
    !('high' in value) ||
    !('low' in value) ||
    !('close' in value)
  )
    throw new TypeError('OHLC 需要 open、high、low、close 四个价格')
  const { open, high, low, close } = value
  const prices = [open, high, low, close]
  if (prices.some((price) => price !== null && typeof price !== 'number'))
    throw new TypeError('OHLC 价格需要数值或 null')
  if (
    typeof open !== 'number' ||
    typeof high !== 'number' ||
    typeof low !== 'number' ||
    typeof close !== 'number' ||
    ![open, high, low, close].every(Number.isFinite)
  )
    return undefined
  const color = declaration.color === undefined ? DEFAULT_PLOT_COLOR : declaration.color
  return {
    open,
    high: Math.max(open, high, low, close),
    low: Math.min(open, high, low, close),
    close,
    color,
    wickColor:
      declaration.kind === 'candle' && declaration.wickColor !== undefined
        ? declaration.wickColor
        : color,
    borderColor:
      declaration.kind === 'candle' && declaration.borderColor !== undefined
        ? declaration.borderColor
        : color,
  }
}
