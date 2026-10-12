/** 将 Core Provider 目录投影给 Vue；没有第二份可写目录。 */
import type { MarketDataContext } from '@363045841yyt/klinechart-core/market-data'
import { computed } from 'vue'
import { coreSignalToVueRef } from '../utils/signalBridge.js'
import type { AggregationSourceDefinition } from './useAggregationSources.js'
import { useMarketDataContext } from './useMarketDataContext.js'

/** 注册、注销和配置变更均从同一个 Core 状态派生。 */
export function useMarketDataSourceCatalog(context: MarketDataContext = useMarketDataContext()) {
  const state = coreSignalToVueRef(context.registry.state)
  return computed<ReadonlyArray<AggregationSourceDefinition>>(() =>
    [...state.value.providers.values()].map((provider) => ({
      name: provider.source.id,
      displayName: provider.source.displayName,
      description: provider.source.description,
      capabilities: provider.catalog ? ['search'] : [],
      defaultBaseUrl: provider.source.defaultBaseUrl,
      endpointEditable: provider.source.endpointEditable,
      connectionId: provider.source.connectionId ?? provider.source.id,
    })),
  )
}
