import type { DataSourceParams, SymbolSpec } from '../../controllers/types'

type SymbolIdentity = Pick<SymbolSpec, 'id' | 'source' | 'market' | 'exchange' | 'symbol'> & {
  params?: DataSourceParams
}

/** 优先使用统一品种 ID，旧调用回退到完整的来源和路由字段。 */
export function symbolSpecIdentityKey(spec: SymbolIdentity): string {
  if (spec.id?.trim()) {
    const sourceId = spec.source?.trim()
    return sourceId ? `instrument:${sourceId}:${spec.id.trim()}` : `id:${spec.id.trim()}`
  }
  const params = Object.entries(spec.params ?? {}).sort(([left], [right]) =>
    left.localeCompare(right),
  )
  return JSON.stringify([spec.source ?? '', spec.market, spec.exchange ?? '', spec.symbol, params])
}
