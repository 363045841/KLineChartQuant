/** 两种执行后端共用请求计划、独立表达式执行和时间轴对齐。 */
import type { Bar, PlotCollection } from '@363045841yyt/klinechart-plot-contracts'
import type { ScriptParamValue } from '../../quickjs/types.js'
import type {
  RequestExecution,
  RequestValue,
  ScriptRequestContext,
  SecurityRequest,
} from '../types.js'

export const CURRENT_SYMBOL = '$chart'
export const EMPTY_REQUEST_EXECUTION: RequestExecution = { symbol: CURRENT_SYMBOL, results: {} }

export interface RequestRunResult {
  readonly requests: readonly SecurityRequest[]
  readonly values: readonly RequestValue[]
  readonly collection: PlotCollection
}
export type RequestRunner = (
  bars: readonly Bar[],
  params: Readonly<Record<string, ScriptParamValue>>,
  execution: RequestExecution,
  emitOutput: boolean,
) => RequestRunResult

/** 空点保持元组形状，数值用 NaN，与既有 Plot 缺值语义相同。 */
function missing(value: RequestValue): RequestValue {
  return Array.isArray(value) ? value.map(missing) : Number.NaN
}

/** 历史结果在主图 bar 的右边界可用时映射；末根读取目标尾部最新快照。 */
function align(
  bars: readonly Bar[],
  target: readonly Bar[],
  values: readonly RequestValue[],
  gaps: SecurityRequest['gaps'],
): readonly RequestValue[] {
  let cursor = -1
  let previous = -1
  const sample = values[0]
  if (sample === undefined) throw new Error('Request 目标序列没有可计算的数据')
  return bars.map((bar, index) => {
    while (cursor + 1 < target.length && target[cursor + 1]!.time <= bar.time) cursor++
    const next = bars[index + 1]
    const boundary = target[cursor + 1]
    const selected =
      next === undefined || (boundary !== undefined && boundary.time <= next.time)
        ? cursor
        : cursor - 1
    const value = values[selected]
    const changed = selected !== previous
    previous = selected
    return value === undefined || (gaps === 'on' && !changed) ? missing(sample) : value
  })
}

/** 每个请求调用使用全新运行态；只把已计算、已对齐的值注入主图运行态。 */
export function executeRequests(
  run: RequestRunner,
  bars: readonly Bar[],
  params: Readonly<Record<string, ScriptParamValue>>,
  context: ScriptRequestContext | undefined,
): PlotCollection {
  const symbol = context === undefined ? CURRENT_SYMBOL : context.symbol
  // 请求规划会重放顶层源码，但它不是用户的一次实际运行，不应重复输出。
  const plan = run([], params, { symbol, results: {} }, false).requests
  if (plan.length === 0) return run(bars, params, { symbol, results: {} }, true).collection
  if (context === undefined) throw new Error('Request 需要宿主提供行情上下文')
  const results: Record<string, readonly RequestValue[]> = {}
  for (const request of plan) {
    const snapshot = context.snapshots.find((item) => item.id === request.id)
    if (!snapshot) throw new Error(`Request 缺少行情快照：${request.id}`)
    const evaluated = run(
      snapshot.bars,
      params,
      {
        symbol: request.symbol,
        expressionId: request.id,
        results: {},
      },
      true,
    )
    results[request.id] = align(bars, snapshot.bars, evaluated.values, request.gaps)
  }
  return run(bars, params, { symbol, results }, true).collection
}
