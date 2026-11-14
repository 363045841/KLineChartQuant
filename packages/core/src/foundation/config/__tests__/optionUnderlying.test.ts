/** 品种到期权标的映射的验收：脚本只读结果，映射缺失一律不猜。 */
import { describe, expect, it } from 'vitest'
import { resolveOptionUnderlying } from '../optionUnderlying.js'

describe('品种到期权标的映射', () => {
  it.each([
    ['BTCUSDT', 'BTC'],
    ['BTCUSDT.P', 'BTC'],
    [' btcusdt.p ', 'BTC'],
    ['ETHUSDT', 'ETH'],
    ['XAUUSD', 'XAUUSD'],
  ])('%s → %s', (symbol, expected) => {
    expect(resolveOptionUnderlying(symbol)).toBe(expected)
  })

  it('没有映射的品种返回 null，不按前缀或相似代码猜', () => {
    for (const symbol of ['AAPL', '0700.HK', 'BTCUSD', 'BTC', '', '   ']) {
      expect(resolveOptionUnderlying(symbol)).toBeNull()
    }
  })
})
