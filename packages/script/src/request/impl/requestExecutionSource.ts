/** 序列结果注入 QuickJS 时保留 NaN/Infinity，避免 JSON 将缺值改为 null。 */
import type { RequestExecution, RequestValue } from '../types.js'

/** 仅序列化受限的数据契约，字符串和键名始终经 JSON 转义。 */
function literal(value: RequestValue): string {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    if (Number.isNaN(value)) return 'NaN'
    return value > 0 ? 'Infinity' : '-Infinity'
  }
  if (Array.isArray(value)) return `[${value.map(literal).join(',')}]`
  return JSON.stringify(value)
}

/** 生成数据对象表达式；不包含用户提供的可执行代码。 */
export function requestExecutionSource(execution: RequestExecution): string {
  const results = Object.entries(execution.results).map(
    ([id, values]) => `${JSON.stringify(id)}:${literal(values)}`,
  )
  return `{symbol:${JSON.stringify(execution.symbol)},expressionId:${execution.expressionId === undefined ? 'undefined' : JSON.stringify(execution.expressionId)},results:{${results.join(',')}}}`
}
