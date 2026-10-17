/** Vue 只订阅 Core 实例的拨测结果；组件不拥有共享请求。 */

import { coreSignalToVueRef } from '@vue-src/utils/signalBridge.js'
import { computed } from 'vue'
import type { AggregationSourceDefinition } from './useAggregationSources.js'
import { useMarketDataContext } from './useMarketDataContext.js'

/** 选择器与管理弹窗共享宿主实例的健康状态。 */
export function useAggregationSourceHealth() {
  const context = useMarketDataContext()
  const health = coreSignalToVueRef(context.health.state)
  const onlineNameSet = computed<ReadonlySet<string>>(
    () =>
      new Set(
        Object.entries(health.value)
          .filter(([, entry]) => entry.status === 'online' || entry.status === 'degraded')
          .map(([id]) => id),
      ),
  )
  function refresh(
    sources: ReadonlyArray<AggregationSourceDefinition>,
    options: {
      names?: ReadonlySet<string>
      force?: boolean
    } = {},
  ) {
    return context.health.refresh({
      ...options,
      names: new Set(
        sources
          .filter((source) => !options.names || options.names.has(source.name))
          .map((source) => source.name),
      ),
    })
  }
  return { health, onlineNameSet, refresh }
}
