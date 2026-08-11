/** FinShare V1 Provider 装配与注册测试。 */

import { describe, expect, it } from 'vitest'

import { finshareMarketDataProvider } from '../sources/finshare'
import { marketDataProviderRegistry } from '../registry'

describe('finshareMarketDataProvider', () => {
  // 验证模块加载后 Provider 可被 SourceRouter 和聚合源面板发现。
  it('registers the FinShare V1 provider', () => {
    expect(marketDataProviderRegistry.get('finshare')).toBe(finshareMarketDataProvider)
    expect(finshareMarketDataProvider.source).toMatchObject({
      id: 'finshare',
      displayName: 'FinShare Futures',
      defaultBaseUrl: 'http://127.0.0.1:8000',
    })
    expect(finshareMarketDataProvider.catalog).toBeDefined()
    expect(finshareMarketDataProvider.bars).toBeDefined()
    expect(marketDataProviderRegistry.getConfig('finshare')).toEqual({
      enabled: true,
      priority: 0,
    })
  })
})
