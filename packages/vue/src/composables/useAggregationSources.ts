/** 聚合搜索的 Vue 投影；配置和策略只保存在 Core 管理实例。 */
import type { MarketDataContext } from '@363045841yyt/klinechart-core/market-data'
import { computed, type MaybeRefOrGetter, toValue } from 'vue'
import { coreSignalToVueRef } from '../utils/signalBridge.js'
import { useMarketDataContext } from './useMarketDataContext.js'

/** Provider 目录的展示投影。 */
export interface AggregationSourceDefinition {
  name: string
  displayName: string
  description?: string
  capabilities?: ReadonlyArray<string>
  defaultBaseUrl?: string
  endpointEditable?: boolean
  connectionId?: string
}

/** MOCK 的显示顺序规则，不参与运行时路由。 */
export function isMockSourceName(name: string): boolean {
  return name === 'mock' || name.startsWith('mock-')
}
export function supportsAggregationSourceSearch(source: AggregationSourceDefinition): boolean {
  return source.capabilities?.includes('search') ?? false
}

/** 从 Core 策略派生搜索源列表；不存在本地配置副本或隐式持久化。 */
export function useAggregationSources(
  input: MaybeRefOrGetter<ReadonlyArray<AggregationSourceDefinition>>,
  context: MarketDataContext = useMarketDataContext(),
) {
  const state = coreSignalToVueRef(context.registry.state)
  const enabledNames = computed(() =>
    toValue(input)
      .filter(
        (source) =>
          supportsAggregationSourceSearch(source) &&
          state.value.providers.has(source.name) &&
          (state.value.policies.get(source.name)?.searchEnabled ?? true),
      )
      .map((source) => source.name),
  )
  const enabledNameSet = computed<ReadonlySet<string>>(() => new Set(enabledNames.value))
  return { enabledNames, enabledNameSet }
}
