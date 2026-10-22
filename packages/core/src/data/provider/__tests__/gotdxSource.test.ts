/** GOTDX 能力协商：connector 的 probe 声明 liveBars 时，前端必须有对应的流接口。 */
import { describe, expect, it, vi } from 'vitest'
import { MarketDataProviderRegistry } from '../impl/registry.js'
import { createGotdxMarketDataProvider } from '../impl/sources/gotdx.js'
import type { MarketDataProvider } from '../types.js'

describe('GOTDX Provider 实时 K 线能力', () => {
  it('提供 connector 声明 liveBars 后可用的 SSE 流工厂', () => {
    const registry = new MarketDataProviderRegistry()
    const provider = createGotdxMarketDataProvider(registry)
    // 连接配置来自注册表；流的 baseUrl 在 createStream 时解析。
    registry.register(provider)
    expect(provider.liveBars).toBeDefined()
    const stream = provider.liveBars!.createStream({
      symbol: 'sh.600000',
      period: 'daily',
      barAggregation: 'original',
    })
    // 未 connect 前不建立连接，destroy 只释放回调和状态。
    stream.destroy()
  })

  it('能力入库时把没有流实现的 liveBars 声明降级', () => {
    const registry = new MarketDataProviderRegistry()
    const provider: MarketDataProvider = {
      source: {
        id: 'probe-live',
        displayName: 'Probe Live',
        capabilities: { assetClasses: ['stock'] },
      },
      async probe() {
        return { status: 'online', checkedAt: 1 }
      },
    }
    registry.register(provider)
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      registry.setCapabilities('probe-live', { assetClasses: ['stock'], liveBars: true })
      // 契约漂移在入库处解决，运行时只消费已对齐的能力位。
      expect(provider.source.capabilities?.liveBars).toBe(false)
      expect(errorLog).toHaveBeenCalledTimes(1)
    } finally {
      errorLog.mockRestore()
    }
  })
})
