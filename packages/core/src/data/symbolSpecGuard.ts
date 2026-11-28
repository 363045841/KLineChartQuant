/** 持久化边界上的品种校验：只有完整 instrument 的 spec 才能进入图表。 */

import type { SymbolSpec } from './symbolSpec.js'
import type { InstrumentDescriptor } from './provider/types.js'

/** 判断任意值是否是完整的统一品种描述。 */
function isInstrumentDescriptor(value: unknown): value is InstrumentDescriptor {
  if (typeof value !== 'object' || value === null) return false
  const item = value as Record<string, unknown>
  return (
    typeof item.id === 'string' &&
    item.id.length > 0 &&
    typeof item.source === 'string' &&
    item.source.length > 0 &&
    typeof item.symbol === 'string' &&
    item.symbol.length > 0 &&
    typeof item.name === 'string' &&
    typeof item.instrumentType === 'string' &&
    typeof item.exchange === 'string' &&
    typeof item.capabilities === 'object' &&
    item.capabilities !== null
  )
}

/**
 * 判断任意值是否是可用的业务品种。
 *
 * 旧版本用扁平字段保存品种；这类数据在这里被明确拒绝，由调用方按“无品种”处理。
 *
 * @param value 反序列化得到的值
 * @returns 是否包含完整 instrument
 */
export function isSymbolSpec(value: unknown): value is SymbolSpec {
  if (typeof value !== 'object' || value === null) return false
  return isInstrumentDescriptor((value as { instrument?: unknown }).instrument)
}
