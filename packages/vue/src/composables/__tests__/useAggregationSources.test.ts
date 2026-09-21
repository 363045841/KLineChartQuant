import { marketDataProviderRegistry } from '@363045841yyt/klinechart-core/controllers'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import {
  AGGREGATION_SOURCES_STORAGE_KEY,
  applyAggregationSourceBaseUrls,
  probeAggregationSource,
  resolveAggregationSourceEndpoints,
  resolveEnabledAggregationSources,
  useAggregationSources,
} from '../useAggregationSources'
import { createOnlineProbe, registerProvider, source } from './_aggregationSourceFixtures'

describe('useAggregationSources', () => {
  beforeEach(() => {
    marketDataProviderRegistry.setConfig('gotdx', { baseUrl: undefined })
  })

  afterEach(() => {
    marketDataProviderRegistry.setConfig('gotdx', { baseUrl: undefined })
    marketDataProviderRegistry.unregister('first')
    marketDataProviderRegistry.unregister('second')
    marketDataProviderRegistry.unregister('probe-source')
  })

  it('enables every searchable provider on first use', () => {
    registerProvider('first', createOnlineProbe())
    expect(
      resolveEnabledAggregationSources([
        source('first'),
        source('chart-only', { searchable: false }),
      ]),
    ).toEqual(['first'])
  })

  it('keeps disabled sources disabled and enables newly registered sources', () => {
    registerProvider('first', createOnlineProbe())
    registerProvider('second', createOnlineProbe())
    expect(
      resolveEnabledAggregationSources([source('first'), source('second')], {
        known: ['first'],
        enabled: [],
      }),
    ).toEqual(['second'])
  })

  it('restores host and port from stored base URLs', () => {
    expect(
      resolveAggregationSourceEndpoints(
        [source('gotdx', { defaultBaseUrl: 'http://127.0.0.1:8080' })],
        {
          known: ['gotdx'],
          enabled: ['gotdx'],
          baseUrls: { gotdx: 'http://192.168.1.8:9090' },
        },
      ),
    ).toEqual({
      gotdx: { host: '192.168.1.8', port: '9090' },
    })
  })

  it('applies endpoint edits to a provider registry', () => {
    applyAggregationSourceBaseUrls(
      [{ name: 'gotdx', displayName: 'GOTDX', defaultBaseUrl: 'http://127.0.0.1:8080' }],
      {
        gotdx: { host: '10.0.0.2', port: '7000' },
      },
    )

    expect(marketDataProviderRegistry.getConfig('gotdx')).toEqual({
      enabled: true,
      priority: 0,
      baseUrl: 'http://10.0.0.2:7000',
    })
  })

  it('persists toggle and endpoint changes', async () => {
    registerProvider('first', createOnlineProbe(), {
      defaultBaseUrl: 'http://127.0.0.1:8080',
    })
    registerProvider('second', createOnlineProbe())
    const state = useAggregationSources([
      source('first', { defaultBaseUrl: 'http://127.0.0.1:8080' }),
      source('second'),
    ])

    state.setEnabled('first', false)
    state.setEndpoint('first', { host: '192.168.0.10', port: '18080' })
    await nextTick()

    expect(JSON.parse(window.localStorage.getItem(AGGREGATION_SOURCES_STORAGE_KEY) ?? '')).toEqual({
      known: ['first', 'second'],
      enabled: ['second'],
      baseUrls: {
        first: 'http://192.168.0.10:18080',
      },
    })
    expect(marketDataProviderRegistry.getConfig('first')).toMatchObject({ enabled: false })
    expect(marketDataProviderRegistry.getConfig('second')).toMatchObject({ enabled: true })
  })

  it('marks a source offline when it is not a registered provider', async () => {
    await expect(
      probeAggregationSource(source('first'), new AbortController().signal),
    ).resolves.toEqual({
      status: 'offline',
    })
  })

  it('uses MarketDataProvider probe for registered sources', async () => {
    const probe = vi.fn().mockResolvedValue({ status: 'online', checkedAt: 1, latencyMs: 12 })
    registerProvider('probe-source', probe)

    await expect(
      probeAggregationSource(source('probe-source'), new AbortController().signal),
    ).resolves.toEqual({ status: 'online', latencyMs: 12 })
    expect(probe).toHaveBeenCalledOnce()
  })
})
