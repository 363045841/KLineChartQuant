import type { DataSourceParams, SymbolSpec } from '../../controllers/types'

type SymbolIdentity = Pick<SymbolSpec, 'source' | 'exchange' | 'symbol'> & {
  params?: DataSourceParams
}

export function symbolSpecIdentityKey(spec: SymbolIdentity): string {
  const params = Object.entries(spec.params ?? {}).sort(([left], [right]) =>
    left.localeCompare(right),
  )
  return JSON.stringify([spec.source ?? '', spec.exchange ?? '', spec.symbol, params])
}
