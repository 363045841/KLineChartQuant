/** 两种执行后端共用的源码编译、行情字段与绘图点转换。 */
import {
  DEFAULT_PLOT_COLOR,
  type OhlcPlotDeclaration,
  type OhlcPlotPoint,
  type ScalarPlotDeclaration as PlotDeclaration,
  type PlotPoint,
} from '@363045841yyt/klinechart-plot-contracts'
import type { Bar } from '../../contracts/input.js'
import { builtinLibraries } from '../../quickjs/impl/builtinLibraries.js'
import { compileScript } from '../../quickjs/impl/compileScript.js'
import type { QuickJSLibrary } from '../../quickjs/types.js'

/** 行情字段的唯一读取映射，未知字段由调用方返回 NaN。 */
export const FIELD_READERS: Readonly<Record<string, (bar: Bar) => number>> = {
  open: (bar) => bar.open,
  high: (bar) => bar.high,
  low: (bar) => bar.low,
  close: (bar) => bar.close,
  volume: (bar) => bar.volume,
  time: (bar) => bar.time,
}

/** 用户源码与外部库经过同一套序列、输入和 TypeScript 转换。 */
export function compileSources(source: string, libraries: readonly QuickJSLibrary[] = []) {
  return {
    source: compileScript(source, libraries),
    libraries: [
      // 展示源码不进入 VM，只传执行需要的 name/source。
      ...builtinLibraries.map(({ name, source }) => ({ name, source })),
      ...libraries.map((library) => ({
        name: library.name,
        source: `(() => {\n${compileScript(library.source, libraries)}\n})();`,
      })),
    ],
  }
}

/** 箭头按正负取方向颜色，其余图形沿用公共颜色。 */
export function toPlotPoint(declaration: PlotDeclaration, value: number): PlotPoint {
  const color =
    declaration.kind === 'arrow'
      ? ((value > 0 ? declaration.colorUp : declaration.colorDown) ?? declaration.color)
      : declaration.color
  return {
    value,
    ...(color === undefined ? {} : { color }),
    ...(declaration.textColor === undefined ? {} : { textColor: declaration.textColor }),
  }
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
