/** Request 结果对齐：保留上一轮的主图结果，只重算受影响的尾部 bar。 */
import type { Bar } from '@363045841yyt/klinechart-plot-contracts'
import { timeframeSeconds, timeValue } from '@363045841yyt/klinechart-plot-contracts'
import type { RequestValue, ScriptRequestContext, SecurityRequest } from '../types.js'

/** 对齐更新输入；startIndex 为第一根需要重算的主图 bar。 */
export interface RequestAlignerInput {
  readonly bars: readonly Bar[]
  readonly target: readonly Bar[]
  readonly values: readonly RequestValue[]
  readonly startIndex: number
  readonly context: ScriptRequestContext
}

/** 对齐器：同一 Request 身份跨 tick 复用结果列。 */
export interface RequestAligner {
  update(input: RequestAlignerInput): readonly RequestValue[]
}

/** 空点保持元组形状，数值用 NaN，与既有 Plot 缺值语义相同。 */
function missing(value: RequestValue): RequestValue {
  return Array.isArray(value) ? value.map(missing) : Number.NaN
}

/** 首个目标 bar 的游标：扫描到 <= 指定时间的最后一根。 */
function cursorAt(target: readonly Bar[], time: number): number {
  let cursor = -1
  while (cursor + 1 < target.length && target[cursor + 1]!.time <= time) cursor++
  return cursor
}

/** 创建一个 Request 对齐器；结果列按 bar 下标保留，尾部更新只覆盖变化区间。 */
export function createRequestAligner(request: SecurityRequest): RequestAligner {
  const result: RequestValue[] = []
  const selectedIndices: number[] = []

  /** lower_tf：每个主图槽位收集全部可用子 bar，元组转为列数组。 */
  function updateLowerTimeframe(input: RequestAlignerInput): readonly RequestValue[] {
    const { bars, target, values, startIndex, context } = input
    result.length = bars.length
    if (bars.length === 0) return result
    const sample = values[0]
    const columns = request.tupleSize ?? (Array.isArray(sample) ? sample.length : undefined)
    const empty = (): RequestValue =>
      columns === undefined ? [] : Array.from({ length: columns }, () => [])
    if (
      context.time &&
      timeframeSeconds(request.timeframe) > timeframeSeconds(context.time.period)
    ) {
      if (!request.ignore_invalid_timeframe)
        throw new TypeError('security_lower_tf的周期不能高于主图')
      for (let index = Math.max(0, startIndex); index < bars.length; index++)
        result[index] = empty()
      return result
    }
    const from = Number.isFinite(startIndex)
      ? Math.min(Math.max(0, startIndex), bars.length - 1)
      : 0
    // 从第一根不早于当前主图 bar 的明细开始；空目标时游标保持 0。
    let cursor = 0
    while (cursor < target.length && target[cursor]!.time < bars[from]!.time) cursor++
    for (let index = from; index < bars.length; index++) {
      const bar = bars[index]!
      const end = context.time
        ? timeValue(context.time, 'close', context.time.period, bar.time)
        : (bars[index + 1]?.time ?? Number.POSITIVE_INFINITY)
      const bucket: RequestValue[] = []
      while (cursor < target.length && target[cursor]!.time < end) {
        const value = values[cursor++]
        if (value !== undefined) bucket.push(value)
      }
      result[index] =
        columns === undefined
          ? bucket
          : Array.from({ length: columns }, (_value, column) =>
              bucket.map((row) => (Array.isArray(row) ? row[column]! : null)),
            )
    }
    return result
  }

  /** security：按主图右边界选择目标槽位，缺口策略与整段重算一致。 */
  function updateSecurity(input: RequestAlignerInput): readonly RequestValue[] {
    const { bars, target, values, startIndex } = input
    result.length = bars.length
    selectedIndices.length = bars.length
    if (bars.length === 0) return result
    const sample = values[0]
    if (sample === undefined) throw new Error('Request 目标序列没有可计算的数据')
    const from = Number.isFinite(startIndex)
      ? Math.min(Math.max(0, startIndex - 1), bars.length - 1)
      : 0
    let cursor = cursorAt(target, bars[from]!.time)
    for (let index = from; index < bars.length; index++) {
      const bar = bars[index]!
      while (cursor + 1 < target.length && target[cursor + 1]!.time <= bar.time) cursor++
      const next = bars[index + 1]
      const boundary = target[cursor + 1]
      const selected =
        next === undefined || (boundary !== undefined && boundary.time <= next.time)
          ? cursor
          : cursor - 1
      selectedIndices[index] = selected
      if (index < startIndex) continue
      const value = values[selected]
      const changed = selected !== (index > 0 ? selectedIndices[index - 1] : -1)
      result[index] =
        value === undefined || (request.gaps === 'on' && !changed) ? missing(sample) : value
    }
    return result
  }

  return {
    update(input) {
      return request.mode === 'lower_tf' ? updateLowerTimeframe(input) : updateSecurity(input)
    },
  }
}
