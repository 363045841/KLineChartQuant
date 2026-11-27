/** 品种身份：统一由 instrument 派生，来源与路由字段不再参与拼接。 */
import type { SymbolInfo } from '../../controllers/types.js'
import type { SymbolSpec } from '@/data/symbolSpec.js'

/**
 * 业务品种的稳定身份键。
 *
 * @param spec 业务品种
 * @returns `instrument:<source>:<id>`；同一品种在任何周期下身份不变
 */
export function symbolSpecIdentityKey(spec: SymbolSpec): string {
  return `instrument:${spec.instrument.source}:${spec.instrument.id}`
}

/**
 * 目录条目的稳定身份键。
 *
 * 目录条目来自搜索结果，可能尚未带有稳定 ID；无 ID 时才用来源与路由字段拼接。
 *
 * @param info 目录条目
 * @returns 稳定身份键
 */
export function symbolInfoIdentityKey(info: SymbolInfo): string {
  if (info.id?.trim()) return `instrument:${info.source ?? ''}:${info.id.trim()}`
  const params = Object.entries(info.params ?? {}).sort(([left], [right]) =>
    left.localeCompare(right),
  )
  return JSON.stringify([info.source ?? '', info.market, info.exchange ?? '', info.symbol, params])
}
