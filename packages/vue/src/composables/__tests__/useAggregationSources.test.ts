import {
  clearFetcherBaseUrlsForTest,
  getFetcherBaseUrl,
  marketDataProviderRegistry,
  type DataFetcherDefinition,
} from '@363045841yyt/klinechart-core/controllers'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  AGGREGATION_SOURCES_STORAGE_KEY,
  applyAggregationSourceBaseUrls,
  probeAggregationSource,
  resolveAggregationSourceEndpoints,
  resolveEnabledAggregationSources,
  useAggregationSources,
} from '../useAggregationSources'

const fetcher = async () => []
const searcher = async () => []

function source(
  name: string,
  options: { searchable?: boolean; defaultBaseUrl?: string } = {},
): DataFetcherDefinition {
  const searchable = options.searchable ?? true
  return {
    name,
    displayName: name.toUpperCase(),
    capabilities: searchable ? ['search'] : ['daily'],
    defaultBaseUrl: options.defaultBaseUrl,
    fetcher,
    searcher: searchable ? searcher : undefined,
  }
}

describe('useAggregationSources', () => {
  beforeEach(() => {
    window.localStorage.clear()
    clearFetcherBaseUrlsForTest()
  })

  afterEach(() => {
    clearFetcherBaseUrlsForTest()
  })

  it('enables every searchable fetcher on first use', () => {
    expect(
      resolveEnabledAggregationSources([
        source('first'),
        source('chart-only', { searchable: false }),
      ]),
    ).toEqual(['first'])
  })

  it('keeps disabled fetchers disabled and enables newly registered fetchers', () => {
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

  it('applies endpoint edits to the core runtime base URL', () => {
    applyAggregationSourceBaseUrls([source('gotdx', { defaultBaseUrl: 'http://127.0.0.1:8080' })], {
      gotdx: { host: '10.0.0.2', port: '7000' },
    })

    expect(getFetcherBaseUrl('gotdx', 'http://127.0.0.1:8080')).toBe('http://10.0.0.2:7000')
  })

  it('persists toggle and endpoint changes', async () => {
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
  })

  it('marks a fetcher online when its search probe succeeds', async () => {
    const search = vi.fn().mockResolvedValue([])
    const definition = { ...source('first'), searcher: search }
    const controller = new AbortController()

    await expect(probeAggregationSource(definition, controller.signal)).resolves.toBe('online')
    expect(search).toHaveBeenCalledWith('first', {
      query: '0',
      limit: 1,
      signal: controller.signal,
    })
  })

  it('marks a fetcher offline when its search probe fails', async () => {
    const definition = {
      ...source('first'),
      searcher: vi.fn().mockRejectedValue(new Error('down')),
    }

    await expect(probeAggregationSource(definition, new AbortController().signal)).resolves.toBe(
      'offline',
    )
  })

  // 验证已迁移 Provider 优先使用统一 probe，而不是旧 searcher 拨测。
  it('uses MarketDataProvider probe for migrated sources', async () => {
    const probe = vi.fn().mockResolvedValue({ status: 'online', checkedAt: 1 })
    marketDataProviderRegistry.register({
      source: { id: 'probe-source', displayName: 'Probe Source' },
      probe,
    })
    const search = vi.fn().mockResolvedValue([])

    await expect(
      probeAggregationSource(
        { ...source('probe-source'), searcher: search },
        new AbortController().signal,
      ),
    ).resolves.toBe('online')
    expect(probe).toHaveBeenCalledOnce()
    expect(search).not.toHaveBeenCalled()

    marketDataProviderRegistry.unregister('probe-source')
  })
})
