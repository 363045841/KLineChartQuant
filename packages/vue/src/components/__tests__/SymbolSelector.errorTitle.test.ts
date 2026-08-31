import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import SymbolSelector from '../SymbolSelector.vue'

const symbols = [
  {
    id: 'SZ.158017',
    sourceId: 'gotdx',
    symbol: '158017',
    name: '化工ETF易方达',
    assetClass: 'etf' as const,
    exchange: 'SZ',
    sessionId: 'CN',
    capabilities: {},
  },
]

describe('SymbolSelector error hint', () => {
  it('renders warn icon and errorMessage without outer tag', () => {
    const wrapper = mount(SymbolSelector, {
      props: {
        symbol: '158017',
        symbols,
        error: true,
        errorMessage: '[gotdx] stock/kline-by-date failed: 500',
      },
    })

    const hint = wrapper.get('.symbol-chip__error')
    expect(wrapper.find('.symbol-chip__error-tag').exists()).toBe(false)
    expect(hint.find('.symbol-chip__warn').exists()).toBe(true)
    expect(hint.get('.symbol-chip__error-text').text()).toBe(
      '[gotdx] stock/kline-by-date failed: 500',
    )
    expect(hint.attributes('title')).toBe('[gotdx] stock/kline-by-date failed: 500')
  })

  it('hides error hint when not in error', () => {
    const wrapper = mount(SymbolSelector, {
      props: {
        symbol: '158017',
        symbols,
        error: false,
        errorMessage: '[gotdx] stock/kline-by-date failed: 500',
      },
    })

    expect(wrapper.find('.symbol-chip__error').exists()).toBe(false)
    expect(wrapper.get('button.symbol-chip').attributes('title')).toBe('158017 - 化工ETF易方达')
  })

  it('shows a single value when the symbol and name match', () => {
    const wrapper = mount(SymbolSelector, {
      props: {
        symbol: 'SPX',
        symbols: [
          {
            id: 'tradingview:SP:SPX',
            sourceId: 'tradingview',
            symbol: 'SPX',
            name: 'SPX',
            assetClass: 'index',
            exchange: 'SP',
            sessionId: 'US',
            capabilities: {},
          },
        ],
      },
    })

    expect(wrapper.get('button.symbol-chip').attributes('title')).toBe('SPX')
  })

  it('shows retry progress while loading', () => {
    const wrapper = mount(SymbolSelector, {
      props: {
        symbol: '158017',
        symbols,
        loading: true,
        retrying: true,
        errorMessage: '加载失败 Retry 1/3',
      },
    })

    expect(wrapper.find('.symbol-chip__spinner').exists()).toBe(false)
    expect(wrapper.get('.symbol-chip__error-text').text()).toBe('加载失败 Retry 1/3')
  })

  it('shows fallback text when error has no message', () => {
    const wrapper = mount(SymbolSelector, {
      props: {
        symbol: '158017',
        symbols,
        error: true,
      },
    })

    const hint = wrapper.get('.symbol-chip__error')
    expect(hint.find('.symbol-chip__warn').exists()).toBe(true)
    expect(hint.get('.symbol-chip__error-text').text()).toBe('加载失败')
    expect(hint.attributes('title')).toBe('加载失败')
  })
})
