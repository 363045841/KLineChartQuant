/** 跨宿主标签快照与输入校验；不依赖 Vue 运行时或 Electron。 */
import type { SymbolSpec } from '@363045841yyt/klinechart-core/controllers'

export interface WorkspaceTab {
  readonly id: string
  readonly spec: SymbolSpec | null
}

/** 校验持久化与 IPC 边界上的品种字段，其余描述交给图表消费。 */
export function isSymbolSpec(value: unknown): value is SymbolSpec {
  if (typeof value !== 'object' || value === null) return false
  if (!('symbol' in value) || !('market' in value)) return false
  return (
    typeof value.symbol === 'string' &&
    value.symbol.length > 0 &&
    typeof value.market === 'string' &&
    value.market.length > 0
  )
}
