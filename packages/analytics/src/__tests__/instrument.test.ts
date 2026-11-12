/**
 * Deribit 合约名解析单元测试。
 */
import { describe, expect, it } from 'vitest'
import { ANALYTICS_ERROR_CODES } from '../errors'
import { parseInstrumentName } from '../options/impl/instrument'
import { expectAnalyticsError } from './testUtils'

describe('parseInstrumentName', () => {
  it('解析 BTC call 的到期时刻、行权价与方向', () => {
    const parsed = parseInstrumentName('BTC-27NOV26-73000-C')
    expect(parsed.currency).toBe('BTC')
    expect(parsed.expiryIso).toBe('2026-11-27')
    expect(parsed.expiryMs).toBe(Date.UTC(2026, 10, 27, 8, 0, 0))
    expect(parsed.strike).toBe(73000)
    expect(parsed.optionType).toBe('call')
  })

  it('解析 ETH put', () => {
    const parsed = parseInstrumentName('ETH-25DEC26-2000-P')
    expect(parsed.currency).toBe('ETH')
    expect(parsed.expiryIso).toBe('2026-12-25')
    expect(parsed.strike).toBe(2000)
    expect(parsed.optionType).toBe('put')
  })

  it.each([
    ['缺少方向后缀', 'BTC-27NOV26-73000'],
    ['月份非法', 'BTC-27XXX26-73000-C'],
    ['标的非法', 'SOL-27NOV26-73000-C'],
    ['日期不存在', 'BTC-31FEB26-73000-C'],
    ['行权价为零', 'BTC-27NOV26-0-C'],
  ])('%s 时抛错', (_label, name) => {
    expectAnalyticsError(
      () => parseInstrumentName(name),
      ANALYTICS_ERROR_CODES.INSTRUMENT_UNPARSEABLE,
    )
  })
})
