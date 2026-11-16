/**
 * 品种注册表的验收：一个标的只登记一个主场所，命令行默认值与目录名都从它来。
 */
import { describe, expect, it } from 'vitest'
import { OPTION_CURRENCIES, OPTION_MARKETS, optionMarketOf } from '../options/markets'

describe('期权品种注册表', () => {
  it('标的清单由注册表推导，五个可采标的', () => {
    expect([...OPTION_CURRENCIES]).toEqual(['BTC', 'ETH', 'SOL', 'BNB', 'XRP'])
    expect(OPTION_MARKETS).toHaveLength(5)
  })

  it('每个标的只登记一个场所，场内写法不重复', () => {
    const symbols = new Set<string>()
    const venueSymbols = new Set<string>()
    for (const market of OPTION_MARKETS) {
      expect(symbols.has(market.symbol)).toBe(false)
      expect(venueSymbols.has(`${market.venue}:${market.venueSymbol}`)).toBe(false)
      symbols.add(market.symbol)
      venueSymbols.add(`${market.venue}:${market.venueSymbol}`)
    }
  })

  it('按标的查场所，大小写不敏感；未登记返回 null', () => {
    expect(optionMarketOf('btc')?.venue).toBe('deribit')
    expect(optionMarketOf(' SOL ')?.venue).toBe('binance')
    expect(optionMarketOf('XRP')?.venueSymbol).toBe('XRPUSDT')
    expect(optionMarketOf('ADA')).toBeNull()
    expect(optionMarketOf('')).toBeNull()
  })
})
