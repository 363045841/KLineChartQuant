/** 脚本测试共用的行情构造与结果读取，避免各用例重复维护同一套数据替身。 */
import { readFileSync } from 'node:fs'
import { isOhlcPlot, type Plot, type ScalarPlot } from '@363045841yyt/klinechart-plot-contracts'
import type { Bar } from '../contracts/input.js'
import type { runQuickJSScript } from '../quickjs/impl/runQuickJSScript.js'

/** 一次脚本执行的结果，供取值 helper 复用。 */
type ScriptResult = Awaited<ReturnType<typeof runQuickJSScript>>

/** 构造行情时可选的成交量与高低点幅度。 */
export interface BarFixture {
  /** 逐根成交量；缺省为 1。 */
  readonly volumes?: readonly number[]
  /** high/low 相对 close 的固定幅度；缺省为 0，此时四个价格字段相同。 */
  readonly spread?: number
}

/** 读取随包发布的示例脚本源码，避免各用例自己拼相对路径。 */
export function shippedSource(name: string): string {
  return readFileSync(new URL(`../../scripts/${name}.ts`, import.meta.url), 'utf8')
}

/** 用完整文件声明包装计算片段，所有用例走相同初始化入口。 */
export function scriptSource(body: string): string {
  return `defineIndicator({ name: 'TestScript', position: 'main', onBar() { ${body} } })`
}

/** 生成 close 驱动的完整 K 线；open 与 close 相同，high/low 由 spread 对称展开。 */
export function barsFromCloses(closes: readonly number[], fixture: BarFixture = {}): Bar[] {
  const spread = fixture.spread ?? 0
  return closes.map((close, index) => ({
    time: index,
    open: close,
    high: close + spread,
    low: close - spread,
    close,
    volume: fixture.volumes?.[index] ?? 1,
  }))
}

/** 生成平滑波动的收盘价，避免常量序列让各算法退化。 */
export function wavyCloses(count: number): number[] {
  return Array.from({ length: count }, (_, index) => 100 + Math.sin(index / 7) * 5)
}

/** 取某 id 的值序列，缺失点为 undefined。 */
export function values(result: ScriptResult, id: string) {
  const plot = result.plots.find((plot) => plot.id === id)
  return plot === undefined ? undefined : scalarPlot(plot).data.map((point) => point?.value)
}

/** 取全部 id 的值序列，按 id 建表用于整组比对。 */
export function plotValues(result: ScriptResult): Record<string, (number | undefined)[]> {
  return Object.fromEntries(
    result.plots.map((plot) => [plot.id, scalarPlot(plot).data.map((point) => point?.value)]),
  )
}

/** 单值测试必须明确排除 OHLC，不把四价格数据静默当作空值。 */
function scalarPlot(plot: Plot): ScalarPlot {
  if (isOhlcPlot(plot)) throw new TypeError(`Expected scalar Plot: ${plot.id}`)
  return plot
}
