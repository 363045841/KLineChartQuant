/** 两种执行后端共用的源码编译、行情字段与绘图点转换。 */
import type { PlotDeclaration, PlotPoint } from '@363045841yyt/klinechart-plot-contracts'
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
    source: compileScript(source),
    libraries: [
      ...builtinLibraries,
      ...libraries.map((library) => ({
        name: library.name,
        source: compileScript(library.source),
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
