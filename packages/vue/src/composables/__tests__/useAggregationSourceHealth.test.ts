import type { SourceProbeResult } from '@363045841yyt/klinechart-core/controllers'
import { marketDataProviderRegistry } from '@363045841yyt/klinechart-core/controllers'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  refreshAggregationSourceHealth,
  resetAggregationSourceHealth,
  useAggregationSourceHealth,
} from '../useAggregationSourceHealth'
import type { AggregationSourceDefinition } from '../useAggregationSources'

const REGISTERED_SOURCES = ['health-online', 'health-offline', 'health-chart-only']

/** 构造拨测用的最小源元数据；capabilities 仅用于展示，可搜索性以注册表为准。 */
function source(name: string, searchable = true): AggregationSourceDefinition {
  return {
    name,
    displayName: name,
    capabilities: searchable ? ['search'] : ['daily'],
  }
}

/** 在线拨测替身；latencyMs 省略时不带延迟字段。 */
function createOnlineProbe(latencyMs?: number) {
  return vi.fn(
    async (): Promise<SourceProbeResult> => ({
      status: 'online',
      checkedAt: 1,
      ...(latencyMs === undefined ? {} : { latencyMs }),
    }),
  )
}

/** 离线拨测替身。 */
function createOfflineProbe() {
  return vi.fn(async (): Promise<SourceProbeResult> => ({ status: 'offline', checkedAt: 1 }))
}

/** 注册一个测试 Provider；不传 catalog 时该源不可参与聚合搜索。 */
function registerProvider(
  name: string,
  probe: () => Promise<SourceProbeResult>,
  searchable = true,
): void {
  marketDataProviderRegistry.register({
    source: { id: name, displayName: name },
    probe,
    ...(searchable ? { catalog: { search: async () => [] } } : {}),
  })
}

describe('useAggregationSourceHealth', () => {
  beforeEach(() => {
    resetAggregationSourceHealth()
  })

  afterEach(() => {
    resetAggregationSourceHealth()
    for (const name of REGISTERED_SOURCES) marketDataProviderRegistry.unregister(name)
  })

  it('marks online sources and excludes offline ones from onlineNameSet', async () => {
    registerProvider('health-online', createOnlineProbe(8))
    registerProvider('health-offline', createOfflineProbe())
    const { onlineNameSet, health } = useAggregationSourceHealth()

    await refreshAggregationSourceHealth([source('health-online'), source('health-offline')])

    expect(health.value['health-online']).toEqual({ status: 'online', latencyMs: 8 })
    expect(health.value['health-offline']).toEqual({ status: 'offline' })
    expect([...onlineNameSet.value]).toEqual(['health-online'])
  })

  it('ignores sources that cannot participate in aggregation search', async () => {
    const probe = createOnlineProbe()
    registerProvider('health-chart-only', probe, false)
    const { onlineNameSet } = useAggregationSourceHealth()

    await refreshAggregationSourceHealth([source('health-chart-only', false)])

    expect(probe).not.toHaveBeenCalled()
    expect(onlineNameSet.value.size).toBe(0)
  })

  it('reuses cached results within TTL unless forced', async () => {
    const probe = createOnlineProbe()
    registerProvider('health-online', probe)

    await refreshAggregationSourceHealth([source('health-online')])
    await refreshAggregationSourceHealth([source('health-online')])
    expect(probe).toHaveBeenCalledTimes(1)

    await refreshAggregationSourceHealth([source('health-online')], { force: true })
    expect(probe).toHaveBeenCalledTimes(2)
  })

  it('limits probing to the provided source names', async () => {
    const probed = createOnlineProbe()
    const skipped = createOfflineProbe()
    registerProvider('health-online', probed)
    registerProvider('health-offline', skipped)

    await refreshAggregationSourceHealth([source('health-online'), source('health-offline')], {
      names: new Set(['health-online']),
    })

    expect(probed).toHaveBeenCalledTimes(1)
    expect(skipped).not.toHaveBeenCalled()
  })
})
