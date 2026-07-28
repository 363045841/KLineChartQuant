import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import SymbolSelector from '../SymbolSelector.vue'

const symbols = [
  {
    symbol: '158017',
    market: 'CN',
    description: '化工ETF易方达',
    exchange: 'SZ',
    source: 'gotdx',
  },
]

describe('SymbolSelector error tag', () => {
  it('renders icon and errorMessage inside a rounded error tag', () => {
    const wrapper = mount(SymbolSelector, {
      props: {
        symbol: '158017',
        symbols,
        error: true,
        errorMessage: '[gotdx] stock/kline-by-date failed: 500',
      },
    })

    const tag = wrapper.get('.symbol-chip__error-tag')
    expect(tag.classes()).toContain('symbol-chip__error-tag')
    expect(tag.find('.symbol-chip__warn').exists()).toBe(true)
    expect(tag.get('.symbol-chip__error-text').text()).toBe(
      '[gotdx] stock/kline-by-date failed: 500',
    )
    expect(tag.attributes('title')).toBe('[gotdx] stock/kline-by-date failed: 500')
  })

  it('hides error tag when not in error', () => {
    const wrapper = mount(SymbolSelector, {
      props: {
        symbol: '158017',
        symbols,
        error: false,
        errorMessage: '[gotdx] stock/kline-by-date failed: 500',
      },
    })

    expect(wrapper.find('.symbol-chip__error-tag').exists()).toBe(false)
    expect(wrapper.get('button.symbol-chip').attributes('title')).toBe('158017 - 化工ETF易方达')
  })

  it('shows error tag with icon only when error has no message', () => {
    const wrapper = mount(SymbolSelector, {
      props: {
        symbol: '158017',
        symbols,
        error: true,
      },
    })

    const tag = wrapper.get('.symbol-chip__error-tag')
    expect(tag.find('.symbol-chip__warn').exists()).toBe(true)
    expect(tag.find('.symbol-chip__error-text').exists()).toBe(false)
  })
})
