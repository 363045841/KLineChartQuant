/** 两种执行后端共用请求计划、独立表达式执行和时间轴对齐。 */
import type { Bar, PlotCollection } from '@363045841yyt/klinechart-plot-contracts'
import type { ScriptParamValue } from '../../quickjs/types.js'
import { pinePeriod, timeframeSeconds, timeValue } from '@363045841yyt/klinechart-plot-contracts'
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
  const time = context?.time ? { ...context.time, period: pinePeriod(context.time.period) } : undefined
  if (bars.length === 0) return run([], params, { symbol, time, results: {} }, true).collection
  const plan = run([], params, { symbol, time, results: {} }, false).requests
  if (plan.length === 0) return run(bars, params, { symbol, time, results: {} }, true).collection
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
        time: time && request.symbol === symbol ? { ...time, period: pinePeriod(request.timeframe) } : undefined,
        expressionId: request.id,
        results: {},
      },
      true,
    )
    results[request.id] = request.mode === 'lower_tf'
      ? intrabars(bars, snapshot.bars, evaluated.values, request, context)
      : align(bars, snapshot.bars, evaluated.values, request.gaps)
  }
  return run(bars, params, { symbol, time, results }, true).collection
}

/** 每个主图槽位收集全部可用子bar，元组转为列数组；缺失槽位不延续上一根明细。 */
function intrabars(bars: readonly Bar[], target: readonly Bar[], values: readonly RequestValue[], request: SecurityRequest, context: ScriptRequestContext): readonly RequestValue[] {
  const sample = values[0]
  const columns = request.tupleSize ?? (Array.isArray(sample) ? sample.length : undefined)
  const empty = (): RequestValue => columns === undefined ? [] : Array.from({ length: columns }, () => [])
  if (context.time && timeframeSeconds(request.timeframe) > timeframeSeconds(context.time.period)) {
    if (!request.ignore_invalid_timeframe) throw new TypeError('security_lower_tf的周期不能高于主图')
    return bars.map(empty)
  }
  let cursor = 0
  return bars.map((bar, index) => {
    const end = context.time ? timeValue(context.time, 'close', context.time.period, bar.time) : bars[index + 1]?.time ?? Number.POSITIVE_INFINITY
    while (cursor < target.length && target[cursor]!.time < bar.time) cursor++
    const bucket: RequestValue[] = []
    while (cursor < target.length && target[cursor]!.time < end) {
      const value = values[cursor++]
      if (value !== undefined) bucket.push(value)
    }
    return columns === undefined ? bucket : Array.from({ length: columns }, (_value, column) => bucket.map((row) => Array.isArray(row) ? row[column]! : null))
  })
}
