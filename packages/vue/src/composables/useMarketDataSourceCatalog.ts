/** 将 Provider 目录事件转为 Vue 快照；凭据存储由宿主负责。 */
import { marketDataProviderRegistry } from '@363045841yyt/klinechart-core/controllers'
import { onScopeDispose, shallowRef } from 'vue'
import type { AggregationSourceDefinition } from './useAggregationSources.js'

/** 返回可响应注册/注销的源目录，并在组件作用域结束时取消订阅。 */
export function useMarketDataSourceCatalog() {
  function snapshot(): ReadonlyArray<AggregationSourceDefinition> {
    return marketDataProviderRegistry.getAll().map((provider) => ({
      name: provider.source.id,
      displayName: provider.source.displayName,
      description: provider.source.description,
      capabilities: provider.catalog ? ['search'] : [],
      defaultBaseUrl: provider.source.defaultBaseUrl,
      endpointEditable: provider.source.endpointEditable,
    }))
  }
  const catalog = shallowRef(snapshot())
  const unsubscribe = marketDataProviderRegistry.subscribeCatalog(() => {
    catalog.value = snapshot()
  })
  onScopeDispose(unsubscribe)
  return catalog
}
