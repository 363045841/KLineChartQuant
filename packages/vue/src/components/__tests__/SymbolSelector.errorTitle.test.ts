import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import SymbolSelector from '../SymbolSelector.vue'

describe('SymbolSelector error title', () => {
  it('uses errorMessage as chip title when error is true', () => {
    const wrapper = mount(SymbolSelector, {
      props: {
        symbol: '158017',
        symbols: [
          {
            symbol: '158017',
            market: 'CN',
            description: '化工ETF易方达',
            exchange: 'SZ',
            source: 'gotdx',
          },
        ],
        error: true,
        errorMessage: '[gotdx] stock/kline-by-date failed: 500',
      },
    })

    expect(wrapper.get('button.symbol-chip').attributes('title')).toBe(
      '[gotdx] stock/kline-by-date failed: 500',
    )
  })

  it('keeps display text as title when not in error', () => {
    const wrapper = mount(SymbolSelector, {
      props: {
        symbol: '158017',
        symbols: [
          {
            symbol: '158017',
            market: 'CN',
            description: '化工ETF易方达',
            exchange: 'SZ',
            source: 'gotdx',
          },
        ],
        error: false,
        errorMessage: '[gotdx] stock/kline-by-date failed: 500',
      },
    })

    expect(wrapper.get('button.symbol-chip').attributes('title')).toBe('158017 - 化工ETF易方达')
  })
})
