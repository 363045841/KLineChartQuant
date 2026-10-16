/** 脚本测试共用的行情构造与结果读取，避免各用例重复维护同一套数据替身。 */
import type { Bar } from '../contracts/input.js'
import type { runQuickJSScript } from '../quickjs/impl/runQuickJSScript.js'

/** 一次脚本执行的结果，供取值 helper 复用。 */
type ScriptResult = Awaited<ReturnType<typeof runQuickJSScript>>

/** 用完整文件声明包装计算片段，所有用例走相同初始化入口。 */
export function scriptSource(body: string, inputs = '{}'): string {
  return `defineIndicator({ name: 'TestScript', pane: 'main', inputs: ${inputs}, onBar() { ${body} } })`
}

/** 生成 close 驱动的完整 K 线，open/high/low 与 close 相同；volume 缺省为 1。 */
export function barsFromCloses(closes: readonly number[], volumes?: readonly number[]): Bar[] {
  return closes.map((close, index) => ({
    time: index,
    open: close,
    high: close,
    low: close,
    close,
    volume: volumes?.[index] ?? 1,
  }))
}

/** 生成平滑波动的收盘价，避免常量序列让各算法退化。 */
export function wavyCloses(count: number): number[] {
  return Array.from({ length: count }, (_, index) => 100 + Math.sin(index / 7) * 5)
}

/** 取某 id 的值序列，缺失点为 undefined。 */
export function values(result: ScriptResult, id: string) {
  return result.plots.find((plot) => plot.id === id)?.data.map((point) => point?.value)
}

/** 取全部 id 的值序列，按 id 建表用于整组比对。 */
export function plotValues(result: ScriptResult): Record<string, (number | undefined)[]> {
  return Object.fromEntries(
    result.plots.map((plot) => [plot.id, plot.data.map((point) => point?.value)]),
  )
}
