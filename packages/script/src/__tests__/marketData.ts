/** 脚本测试共用的行情构造、脚本执行与结果读取，避免各用例重复维护同一套数据替身。 */
import { readdirSync, readFileSync } from 'node:fs'
import { isOhlcPlot, type Plot, type ScalarPlot } from '@363045841yyt/klinechart-plot-contracts'
import type { Bar } from '../contracts/input.js'
import { runQuickJSScript } from '../quickjs/impl/runQuickJSScript.js'
import type { ScriptParamValue } from '../quickjs/types.js'

/** 一次脚本执行的结果，供取值 helper 复用。 */
export type ScriptResult = Awaited<ReturnType<typeof runQuickJSScript>>

/** 逐 bar 数值列，缺省点保持 undefined。 */
export type ScriptValues = Record<string, (number | undefined)[]>

/** 构造行情时可选的成交量与高低点。 */
export interface BarFixture {
  /** 逐根成交量；缺省为 1。 */
  readonly volumes?: readonly number[]
  /** high/low 相对 close 的固定幅度；缺省为 0，此时四个价格字段相同。 */
  readonly spread?: number
  /** 逐根最高价；给出时覆盖 spread。 */
  readonly highs?: readonly number[]
  /** 逐根最低价；给出时覆盖 spread。 */
  readonly lows?: readonly number[]
}

/** 内置脚本的唯一名单：直接读脚本目录，新增文件自动进入测试矩阵。 */
export function builtinScriptNames(): string[] {
  return readdirSync(new URL('../../scripts/', import.meta.url))
    .filter((file) => file.endsWith('.ts'))
    .sort()
    .map((file) => file.slice(0, -'.ts'.length))
}

/** 读取随包发布的示例脚本源码，避免各用例自己拼相对路径。 */
export function shippedSource(name: string): string {
  return readFileSync(new URL(`../../scripts/${name}.ts`, import.meta.url), 'utf8')
}

/** 用完整文件声明包装计算片段，所有用例走相同初始化入口。 */
export function scriptSource(body: string, name = 'TestScript'): string {
  return `defineIndicator({ name: '${name}', position: 'main', onBar() { ${body} } })`
}

/** 生成 close 驱动的完整 K 线；open 与 close 相同，high/low 由 spread 或逐根数组给出。 */
export function barsFromCloses(closes: readonly number[], fixture: BarFixture = {}): Bar[] {
  const spread = fixture.spread ?? 0
  return closes.map((close, index) => ({
    time: index,
    open: close,
    high: fixture.highs?.[index] ?? close + spread,
    low: fixture.lows?.[index] ?? close - spread,
    close,
    volume: fixture.volumes?.[index] ?? 1,
  }))
}

/** 生成平滑波动的收盘价，避免常量序列让各算法退化。 */
export function wavyCloses(count: number): number[] {
  return Array.from({ length: count }, (_, index) => 100 + Math.sin(index / 7) * 5)
}

/** 执行随包脚本并返回完整结果，供需要检查图形元数据的用例使用。 */
export async function runShipped(
  name: string,
  prices: readonly number[],
  params: Record<string, ScriptParamValue> = {},
  fixture: BarFixture = {},
): Promise<ScriptResult> {
  return runQuickJSScript({
    source: shippedSource(name),
    bars: barsFromCloses(prices, fixture),
    params,
  })
}

/** 执行随包脚本并提取全部绘图值，供只关心数值的用例使用。 */
export async function runShippedValues(
  name: string,
  prices: readonly number[],
  params: Record<string, ScriptParamValue> = {},
  fixture: BarFixture = {},
): Promise<ScriptValues> {
  return plotValues(await runShipped(name, prices, params, fixture))
}

/** 用给定行情执行随包脚本，供需要非对称 OHLC 的用例使用。 */
export async function runShippedBars(
  name: string,
  bars: readonly Bar[],
  params: Record<string, ScriptParamValue> = {},
): Promise<ScriptValues> {
  return plotValues(await runQuickJSScript({ source: shippedSource(name), bars, params }))
}

/** 取某 id 的值序列，缺失点为 undefined；Plot 不存在时返回 undefined。 */
export function values(result: ScriptResult, id: string): (number | undefined)[] | undefined {
  const plot = result.plots.find((entry) => entry.id === id)
  return plot === undefined ? undefined : scalarPlot(plot).data.map((point) => point?.value)
}

/** 取某 id 的值序列，Plot 不存在时直接失败，避免用例里堆非空断言。 */
export function requireValues(result: ScriptResult, id: string): (number | undefined)[] {
  return plotById(result, id).data.map((point) => point?.value)
}

/** 取某 id 的单值 Plot；缺失或为 OHLC 时直接失败。 */
export function plotById(result: ScriptResult, id: string): ScalarPlot {
  const plot = result.plots.find((entry) => entry.id === id)
  if (!plot) throw new Error(`缺少 Plot: ${id}`)
  return scalarPlot(plot)
}

/** 取全部 id 的值序列，按 id 建表用于整组比对。 */
export function plotValues(result: ScriptResult): ScriptValues {
  return Object.fromEntries(
    result.plots.map((plot) => [plot.id, scalarPlot(plot).data.map((point) => point?.value)]),
  )
}

/** 单值测试必须明确排除 OHLC，不把四价格数据静默当作空值。 */
function scalarPlot(plot: Plot): ScalarPlot {
  if (isOhlcPlot(plot)) throw new TypeError(`Expected scalar Plot: ${plot.id}`)
  return plot
}
