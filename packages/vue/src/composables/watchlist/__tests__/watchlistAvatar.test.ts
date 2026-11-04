/** 自选行图标：首字符与色板槽位映射。 */

import { describe, expect, it } from 'vitest'
import { AVATAR_PALETTE_SIZE, symbolInitial, symbolPaletteIndex } from '../watchlistAvatar.js'

describe('watchlist avatar', () => {
  it('uses the first character of the symbol as the icon text', () => {
    expect(symbolInitial('aapl')).toBe('A')
    expect(symbolInitial('600519')).toBe('6')
    expect(symbolInitial('  btcusdt')).toBe('B')
    expect(symbolInitial('   ')).toBe('?')
  })

  it('maps every symbol into the palette slot range', () => {
    for (const symbol of ['AAPL', '600519', 'BTCUSDT', 'EURUSD', 'IF2412']) {
      const index = symbolPaletteIndex(symbol)
      expect(index).toBeGreaterThanOrEqual(1)
      expect(index).toBeLessThanOrEqual(AVATAR_PALETTE_SIZE)
    }
  })

  it('keeps the same slot for the same symbol across calls', () => {
    expect(symbolPaletteIndex('AAPL')).toBe(symbolPaletteIndex('AAPL'))
  })
})
