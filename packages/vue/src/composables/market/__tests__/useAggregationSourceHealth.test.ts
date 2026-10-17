/** 消费者卸载不能取消其他组件共享的健康请求。 */
import { MarketDataContext } from '@363045841yyt/klinechart-core/market-data'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent } from 'vue'
import { useAggregationSourceHealth } from '../useAggregationSourceHealth'
import { MARKET_DATA_CONTEXT_KEY } from '../useMarketDataContext'

describe('health ownership', () => {
  it('keeps host-owned probes alive after a consumer unmounts', async () => {
    const context = new MarketDataContext()
    let signal: AbortSignal | undefined
    let complete: (() => void) | undefined
    context.registry.register({
      source: { id: 'one', displayName: 'One' },
      probe: (value) => {
        signal = value
        return new Promise((resolve) => {
          complete = () => resolve({ status: 'online', checkedAt: 1 })
        })
      },
    })
    const wrapper = mount(
      defineComponent({
        setup() {
          useAggregationSourceHealth()
          return () => null
        },
      }),
      {
        global: { provide: { [MARKET_DATA_CONTEXT_KEY]: context } },
      },
    )
    const pending = context.health.refresh()
    await Promise.resolve()
    wrapper.unmount()
    expect(signal?.aborted).toBe(false)
    complete?.()
    await pending
    expect(context.health.state.peek().one?.status).toBe('online')
    context.dispose()
  })
})
