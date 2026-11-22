/** 品种模型与 SymbolSpec 的唯一转换：字段映射与旧目录兜底。 */

import type { SymbolInfo } from '@363045841yyt/klinechart-core/controllers'
import type { InstrumentDescriptor } from '@363045841yyt/klinechart-core/market-data'
import { InstrumentType, KLineAdjustment } from '@363045841yyt/klinechart-core/market-data'
import { describe, expect, it } from 'vitest'
import {
  fromSymbolInfo,
  legacyInstrumentId,
  symbolItemForSpec,
  toSymbolSpec,
} from '../symbolSpec.js'

const instrument: InstrumentDescriptor = {
  id: 'BTCUSDT',
  source: 'binance',
  symbol: 'BTCUSDT',
  name: 'Bitcoin',
  instrumentType: InstrumentType.Crypto,
  exchange: 'BINANCE',
  sessionId: 'binance',
  providerRef: { network: 'mainnet' },
  tickSize: 0.01,
  lotSize: 0.001,
  currency: 'USDT',
  capabilities: {},
}

const selection: { period: string; adjust: KLineAdjustment } = {
  period: '1D',
  adjust: KLineAdjustment.None,
}

describe('symbolSpec', () => {
  it('按品种与选择构造 SymbolSpec，未提供边界时不写日期字段', () => {
    const spec = toSymbolSpec(instrument, selection)
    expect(spec).toEqual({
      instrument,
      period: '1D',
      adjust: KLineAdjustment.None,
    })
    expect(spec).not.toHaveProperty('startDate')
    expect(spec).not.toHaveProperty('endDate')
  })

  it('显式边界与复权覆盖品种默认值', () => {
    const spec = toSymbolSpec(instrument, {
      period: '1D',
      adjust: KLineAdjustment.Qfq,
      bounds: { startDate: '2024-01-01', endDate: '2024-12-31' },
    })
    expect(spec).toEqual({
      instrument,
      period: '1D',
      adjust: KLineAdjustment.Qfq,
      startDate: '2024-01-01',
      endDate: '2024-12-31',
    })
  })

  it('旧目录条目缺少 id 时生成确定性身份', () => {
    const info: SymbolInfo = {
      symbol: 'BTCUSDT',
      market: 'binance',
      exchange: 'BINANCE',
      source: 'binance',
      description: 'Bitcoin',
      params: { network: 'mainnet' },
    }
    const item = fromSymbolInfo(info)
    expect(item.id).toBe(
      legacyInstrumentId('binance', 'BTCUSDT', 'BINANCE', { network: 'mainnet' }),
    )
    expect(item).toMatchObject({ name: 'Bitcoin', sessionId: 'binance' })
  })

  it('直接返回业务品种自带的统一品种模型', () => {
    expect(symbolItemForSpec(toSymbolSpec(instrument, selection))).toBe(instrument)
  })
})
