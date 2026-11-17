/** 工具实现的共用辅助：按 action 校验必填字段，并把领域结果收敛成文本。 */
import { ToolInputValidationError } from '../../../../foundation/agent/index.js'
import type { ChartToolResult } from '../types.js'

/**
 * 校验当前 action 的必填字段。
 *
 * 扁平 schema 无法表达「按 action 必填」，因此在分发前显式检查，
 * 错误信息点名缺失字段与下一步动作，供模型直接修正。
 */
export function requireFields(input: object, fields: ReadonlyArray<string>, hint?: string): void {
  const record = input as Record<string, unknown>
  const missing = fields.filter((field) => record[field] === undefined)
  if (missing.length === 0) return
  const action = typeof record.action === 'string' ? record.action : 'this call'
  throw new ToolInputValidationError(
    `action=${action} requires ${missing.join(', ')}.${hint ? ` ${hint}` : ''}`,
  )
}

/** 把领域结果序列化为模型可读的紧凑 JSON。 */
export function jsonResult(value: unknown, summary: string): ChartToolResult {
  return { content: JSON.stringify(value), summary }
}

/** 已经是文本的结果直接透传。 */
export function textResult(content: string, summary?: string): ChartToolResult {
  return { content, summary: summary ?? 'Tool completed.' }
}
