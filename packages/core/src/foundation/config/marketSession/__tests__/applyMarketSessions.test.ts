/** 校验会话装配优先级：内置表为底，数据源声明覆盖内置，图表覆盖优先级最高。 */
import { describe, expect, it } from 'vitest'
import { applyMarketSessions } from '../applyMarketSessions.js'
import { MarketSessionRegistry } from '../marketSessionRegistry.js'

describe('applyMarketSessions', () => {
  it('registers sessions declared by data sources', () => {
    const registry = new MarketSessionRegistry()
    const declared = { timeZone: 'Asia/Shanghai', sessions: [{ open: 570, close: 900 }] }

    applyMarketSessions(registry, [{ marketSessions: { CUSTOM: declared } }])

    expect(registry.getRequired('CUSTOM')).toEqual(declared)
    // 私有声明不能清掉内置表。
    expect(registry.getRequired('BINANCE_PERP').timeZone).toBe('UTC')
  })

  it('lets chart overrides win over data source declarations', () => {
    const registry = new MarketSessionRegistry()

    applyMarketSessions(
      registry,
      [{ marketSessions: { CUSTOM: { timeZone: 'UTC', sessions: [{ open: 0, close: 60 }] } } }],
      { CUSTOM: { timeZone: 'Asia/Shanghai', sessions: [{ open: 0, close: 60 }] } },
    )

    expect(registry.getRequired('CUSTOM').timeZone).toBe('Asia/Shanghai')
  })
})
