/** 指标参数校验：按定义声明的参数表校验 Agent 输入，返回可修正的问题列表。 */
import type { IndicatorInputDef } from '@/controllers/types.js'

/** 单条参数问题的分类；模型据此决定改键、改类型还是改范围。 */
type IndicatorParamIssueReason = 'unknown' | 'missing' | 'type' | 'range' | 'option'

/** 一条参数问题；expected 直接来自定义声明，供错误文案原样展示。 */
export interface IndicatorInputIssue {
  readonly key: string
  readonly reason: IndicatorParamIssueReason
  readonly expected: string
  readonly received?: unknown
}

/** 校验结果：成功时只保留已声明的键，失败时一次返回全部问题。 */
export type IndicatorInputsResult =
  | { readonly ok: true; readonly inputs: Readonly<Record<string, unknown>> }
  | { readonly ok: false; readonly issues: ReadonlyArray<IndicatorInputIssue> }

/** 校验选项；update 需要完整参数集，add 只校验显式给出的键。 */
export interface ParseIndicatorInputsOptions {
  readonly requireComplete?: boolean
}

/**
 * 按定义声明校验参数。
 *
 * null / undefined 视为未提供；number 声明接受数字字符串并转换为数字，
 * 因为工具 schema 无法为开放字典逐键声明类型。返回的问题按输入顺序排列，
 * 缺少的键按定义顺序追加。
 */
export function parseIndicatorInputs(
  defs: ReadonlyArray<IndicatorInputDef>,
  input: Readonly<Record<string, unknown>>,
  options: ParseIndicatorInputsOptions = {},
): IndicatorInputsResult {
  const byKey = new Map(defs.map((def) => [def.key, def]))
  const issues: IndicatorInputIssue[] = []
  const params: Record<string, unknown> = {}

  for (const [key, raw] of Object.entries(input)) {
    if (raw === null || raw === undefined) continue
    const def = byKey.get(key)
    if (def === undefined) {
      issues.push({ key, reason: 'unknown', expected: 'declared param' })
      continue
    }
    const checked = checkValue(def, raw)
    if ('issue' in checked) {
      issues.push(checked.issue)
      continue
    }
    params[key] = checked.value
  }

  if (options.requireComplete === true) {
    for (const def of defs) {
      if (def.key in params) continue
      issues.push({ key: def.key, reason: 'missing', expected: describeConstraint(def) })
    }
  }

  return issues.length > 0 ? { ok: false, issues } : { ok: true, inputs: params }
}

/** 校验单个值；返回规范化后的值或一条问题。 */
function checkValue(
  def: IndicatorInputDef,
  raw: unknown,
): { readonly value: unknown } | { readonly issue: IndicatorInputIssue } {
  switch (def.type) {
    case 'number': {
      const value = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw
      if (typeof value !== 'number' || !Number.isFinite(value))
        return { issue: invalid(def, 'type', raw) }
      if ((def.min !== undefined && value < def.min) || (def.max !== undefined && value > def.max))
        return { issue: invalid(def, 'range', raw) }
      return { value }
    }
    case 'boolean':
      return typeof raw === 'boolean' ? { value: raw } : { issue: invalid(def, 'type', raw) }
    case 'select': {
      const options = def.options?.map((option) => option.value) ?? []
      const value = typeof raw === 'string' || typeof raw === 'number' ? String(raw) : undefined
      return value !== undefined && options.includes(value)
        ? { value }
        : { issue: invalid(def, 'option', raw) }
    }
    default:
      return typeof raw === 'string' ? { value: raw } : { issue: invalid(def, 'type', raw) }
  }
}

/** 构造一条带声明约束的问题。 */
function invalid(
  def: IndicatorInputDef,
  reason: 'type' | 'range' | 'option',
  received: unknown,
): IndicatorInputIssue {
  return { key: def.key, reason, expected: describeConstraint(def), received }
}

/** 把参数声明压成一行可读约束，供错误文案列出合法参数。 */
export function describeParam(def: IndicatorInputDef): string {
  return `${def.key} (${describeConstraint(def)})`
}

/** 只描述约束本身，供“must be …”句式使用，不重复键名。 */
function describeConstraint(def: IndicatorInputDef): string {
  const constraints: string[] = []
  if (def.type === 'number') {
    if (def.min !== undefined) constraints.push(`min ${def.min}`)
    if (def.max !== undefined) constraints.push(`max ${def.max}`)
  }
  if (def.options !== undefined && def.options.length > 0)
    constraints.push(`one of ${def.options.map((option) => option.value).join('|')}`)
  const suffix = constraints.length > 0 ? `, ${constraints.join(', ')}` : ''
  return `${def.type}${suffix}, default ${JSON.stringify(def.default)}`
}
