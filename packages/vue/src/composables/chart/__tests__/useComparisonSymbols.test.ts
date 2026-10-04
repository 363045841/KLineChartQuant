/** 比较选择入口只添加所选折线，不将主品种重复加入比较集合。 */

import type { SymbolSpec } from '@363045841yyt/klinechart-core/controllers'
import { describe, expect, it, vi } from 'vitest'
import { createMockChartController } from '../../../__tests__/_mockController'
import type { SymbolItem } from '../../../components/SymbolSelector.vue'
import { useComparisonSymbols } from '../useComparisonSymbols'

describe('原生比较入口', () => {
  it('一次选择只添加一个比较品种，且不改写主品种或视图', () => {
    const controller = createMockChartController()
    const add = vi.spyOn(controller, 'addComparisonSymbol')
    const setPrimary = vi.spyOn(controller, 'setSymbols')
    const primary: SymbolSpec = { symbol: 'MAIN', market: 'CN', period: 'daily' }
    const selected: SymbolItem = {
      id: 'CMP',
      symbol: 'CMP',
      name: '比较商品',
      exchange: 'SSE',
      sourceId: 'mock',
      sessionId: 'CN',
      assetClass: 'stock',
      capabilities: {},
    }
    const compared: SymbolSpec = { symbol: selected.symbol, market: 'CN', period: 'daily' }
    const entry = useComparisonSymbols({
      getController: () => controller,
      getPrimary: () => primary,
      toSpec: () => compared,
      onError: () => {},
    })
    entry.add(selected)
    expect(add).toHaveBeenCalledExactlyOnceWith(compared, primary)
    expect(setPrimary).not.toHaveBeenCalled()
    expect(controller.chartMode.peek()).toBe('kline')
    const remove = vi.spyOn(controller, 'removeComparisonSymbol')
    entry.remove(selected.id)
    expect(remove).toHaveBeenCalledExactlyOnceWith(selected.id)
  })
})
