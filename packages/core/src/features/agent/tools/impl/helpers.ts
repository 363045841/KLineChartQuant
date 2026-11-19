/** 工具实现的共用辅助：动作级字段校验与结果收敛。 */
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

/**
 * 拒绝当前 action 不接受的字段。
 *
 * 扁平 schema 对全部 action 开放全部字段；没有这道检查，错放的参数会被静默忽略，
 * 模型会误以为已经生效。规则只有这一处，三只写工具共用。
 */
export function rejectUnusedFields<TAction extends string>(
  input: { readonly action: TAction },
  allowed: Readonly<Record<TAction, ReadonlyArray<string>>>,
): void {
  const fields = allowed[input.action]
  if (fields === undefined)
    throw new ToolInputValidationError(`Unsupported action '${String(input.action)}'.`)
  const unused = Object.keys(input).filter((key) => key !== 'action' && !fields.includes(key))
  if (unused.length === 0) return
  throw new ToolInputValidationError(
    `action=${input.action} does not accept ${unused.join(', ')}. Allowed fields: ${fields.join(', ')}.`,
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
