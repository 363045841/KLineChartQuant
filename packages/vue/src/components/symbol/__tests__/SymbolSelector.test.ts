/** 品种选择器：chip 与 field 共用同一选择会话，只是触发器外观不同。 */
import type { InstrumentDescriptor } from '@363045841yyt/klinechart-core/market-data'
import SymbolSelector from '@vue-src/components/symbol/SymbolSelector.vue'
import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'

const BTC: InstrumentDescriptor = {
  id: 'btc',
  source: 'test',
  symbol: 'BTCUSDT',
  name: 'Bitcoin',
  instrumentType: 'stock',
  exchange: 'SZ',
  capabilities: {
    bars: { periods: ['1min', 'daily'], adjustments: ['none'] },
    timeShare: true,
  },
}

/** 弹层不是本用例的主体；悬浮提示用标记层确认只在 chip 下存在。 */
const BaseTooltipStub = {
  inheritAttrs: false,
  template: '<span class="tooltip-stub"><slot /></span>',
}
const SymbolSearchDialogStub = {
  name: 'SymbolSearchDialog',
  props: [
    'show',
    'search',
    'dialogLabel',
    'searchPlaceholder',
    'searchAriaLabel',
    'manageSources',
  ],
  emits: ['close', 'update:search', 'manageSources'],
  template: '<div />',
}

function mountSelector(
  options: {
    variant?: 'chip' | 'field'
    symbol?: string
    symbols?: readonly InstrumentDescriptor[]
    selectedItem?: InstrumentDescriptor
    loading?: boolean
  } = {},
) {
  return mount(SymbolSelector, {
    props: {
      symbol: options.symbol ?? BTC.symbol,
      symbols: options.symbols ?? [BTC],
      selectedItem: options.selectedItem ?? BTC,
      variant: options.variant ?? 'chip',
      loading: options.loading ?? false,
    },
    global: {
      stubs: { BaseTooltip: BaseTooltipStub, SymbolSearchDialog: SymbolSearchDialogStub },
    },
  })
}

it('keeps the compact chip with its tooltip by default', () => {
  const wrapper = mountSelector()

  expect(wrapper.find('.symbol-chip').exists()).toBe(true)
  expect(wrapper.find('.tooltip-stub').exists()).toBe(true)
  expect(wrapper.find('.selection-field').exists()).toBe(false)
  expect(wrapper.text()).toContain('BTCUSDT - Bitcoin')
})

it('renders the current value as a full-width field without a tooltip', () => {
  const wrapper = mountSelector({ variant: 'field' })

  expect(wrapper.find('.selection-field').exists()).toBe(true)
  expect(wrapper.find('.tooltip-stub').exists()).toBe(false)
  expect(wrapper.find('.symbol-chip').exists()).toBe(false)
  expect(wrapper.text()).toContain('BTCUSDT - Bitcoin')
})

it('shows the field placeholder when there is no symbol', () => {
  const wrapper = mountSelector({ variant: 'field', symbol: '', symbols: [] })

  const field = wrapper.get('.selection-field')
  expect(field.text()).toContain('选择品种')
  expect(field.classes()).toContain('is-empty')
})

it('opens the picker from the field and keeps loading feedback', async () => {
  const wrapper = mountSelector({ variant: 'field', loading: true })
  expect(wrapper.find('.symbol-selector__spinner').exists()).toBe(true)

  await wrapper.get('.selection-field').trigger('click')
  expect(wrapper.getComponent({ name: 'SymbolSearchDialog' }).props('show')).toBe(true)
})
