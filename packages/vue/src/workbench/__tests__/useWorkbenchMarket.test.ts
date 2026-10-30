/** 品种解析失败、重试和来源重新注册不应破坏工作台生命周期。 */
import { effectScope, nextTick, shallowReactive } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { createMarketDataHost } from '@363045841yyt/klinechart-core/market-data'
import { createDataSourceFixture } from '../../../../core/src/data/provider/__tests__/helpers/providerTestKit.js'
import { useWorkbenchMarket } from '../impl/useWorkbenchMarket.js'
import type { KlineWorkbenchProps } from '../types.js'

describe('workbench market selection', () => {
  it('recovers from lookup failure, selection changes and source replacement in the same scope', async () => {
    const fixture = createDataSourceFixture([], false)
    const host = createMarketDataHost()
    const scope = effectScope()
    const onError = vi.fn()
    const resolve = vi.spyOn(fixture.source.instruments, 'resolve')
    resolve.mockRejectedValueOnce(new Error('Network unavailable'))
    let unregister = host.registerDataSource(fixture.source)
    const props = shallowReactive<KlineWorkbenchProps>({
      marketDataContext: host, instrument: { sourceId: 'test', id: 'A' },
    })
    const market = scope.run(() => useWorkbenchMarket(props, onError))!
    try {
      await expect(market.initialize()).resolves.toBeUndefined()
      expect(market.error.value?.message).toBe('Network unavailable')
      expect(market.loading.value).toBe(false)
      await market.retry()
      expect(market.error.value).toBeNull()
      expect(market.symbols.value?.[0]?.symbol).toBe('A')

      props.instrument = { sourceId: 'test', id: 'missing' }
      await nextTick()
      await vi.waitFor(() => expect(market.error.value).not.toBeNull())
      props.instrument = { sourceId: 'test', id: 'B' }
      await nextTick()
      await vi.waitFor(() => expect(market.symbols.value?.[0]?.symbol).toBe('B'))
      expect(market.error.value).toBeNull()

      unregister()
      await vi.waitFor(() => expect(market.error.value).not.toBeNull())
      unregister = host.registerDataSource(fixture.source)
      await vi.waitFor(() => expect(market.symbols.value?.[0]?.symbol).toBe('B'))
      expect(market.error.value).toBeNull()
      expect(onError).toHaveBeenCalledTimes(3)
    } finally {
      scope.stop()
      unregister()
      host.dispose()
    }
  })

  it('ignores stale resolutions and releases pending work when its scope ends', async () => {
    const fixture = createDataSourceFixture([], false)
    const host = createMarketDataHost()
    const scope = effectScope()
    let finish: ((value: typeof fixture.instruments[number]) => void) | undefined
    let signal: AbortSignal | undefined
    vi.spyOn(fixture.source.instruments, 'resolve').mockImplementationOnce((_id, active) => {
      signal = active
      return new Promise((resolve) => { finish = resolve })
    })
    host.registerDataSource(fixture.source)
    const props = shallowReactive<KlineWorkbenchProps>({ marketDataContext: host, instrument: { sourceId: 'test', id: 'A' } })
    const onError = vi.fn()
    const market = scope.run(() => useWorkbenchMarket(props, onError))!
    try {
      const first = market.initialize()
      props.instrument = { sourceId: 'test', id: 'B' }
      await nextTick()
      await vi.waitFor(() => expect(market.symbols.value?.[0]?.symbol).toBe('B'))
      expect(signal?.aborted).toBe(true)
      finish!(fixture.instruments[0]!)
      await first
      expect(market.symbols.value?.[0]?.symbol).toBe('B')
      expect(onError).not.toHaveBeenCalled()
    } finally {
      scope.stop()
      host.dispose()
    }
  })
})
