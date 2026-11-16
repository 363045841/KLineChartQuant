// 期权类工具共用的参数读取：标的解析与输出格式。
//
// 三个工具（快照、波动统计、结构解读）对「标的」的约定必须一致：既接受品种代码
// （BTCUSDT、BTCUSDT.P），也接受直接写标的（BTC）；前者走宿主映射表。

import { resolveOptionUnderlying } from '@363045841yyt/klinechart-core'

/** 判断是否为普通对象；模型给的参数已过 Schema，这里只做类型收敛。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 读取显式传入的标的。
 *
 * @param input 工具输入
 * @returns 标的原文；未传或不是字符串时为 undefined
 */
export function readCurrency(input: unknown): string | undefined {
  if (!isRecord(input)) return undefined
  const value = input.currency
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

/**
 * 读取输出格式。
 *
 * @param input 工具输入
 * @returns json 或默认的 text
 */
export function readFormat(input: unknown): 'text' | 'json' {
  if (!isRecord(input)) return 'text'
  return input.format === 'json' ? 'json' : 'text'
}

/**
 * 把请求里的标的收成期权标的。
 *
 * 既接受品种代码（BTCUSDT、BTCUSDT.P），也接受直接写标的（BTC）；
 * 前者走宿主映射表，后者按大写原样交给服务，由服务决定有没有数据。
 *
 * @param requested 请求里的标的
 * @param fallback 省略参数时的回落来源
 * @returns 期权标的；两者都拿不到时为 null
 */
export function resolveCurrency(
  requested: string | undefined,
  fallback: () => string | null,
): string | null {
  if (requested === undefined) return fallback()
  const mapped = resolveOptionUnderlying(requested)
  if (mapped !== null) return mapped
  const upper = requested.trim().toUpperCase()
  return upper === '' ? null : upper
}
