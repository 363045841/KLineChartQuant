import { marketDataProviderRegistry } from '@363045841yyt/klinechart-core/controllers'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  refreshAggregationSourceHealth,
  resetAggregationSourceHealth,
  useAggregationSourceHealth,
} from '../useAggregationSourceHealth'
import {
  createOfflineProbe,
  createOnlineProbe,
  registerProvider,
  source,
} from './_aggregationSourceFixtures'

const REGISTERED_SOURCES = ['health-online', 'health-offline', 'health-chart-only']

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
    registerProvider('health-chart-only', probe, { searchable: false })
    const { onlineNameSet } = useAggregationSourceHealth()

    await refreshAggregationSourceHealth([source('health-chart-only', { searchable: false })])

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
