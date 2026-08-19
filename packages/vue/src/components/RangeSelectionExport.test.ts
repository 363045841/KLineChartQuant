/** 区间选择工具栏收益率展示测试。 */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import RangeSelectionExport from './RangeSelectionExport.vue'

const baseProps = {
  startDate: '',
  endDate: '',
  startLabel: '2026-08-01',
  endLabel: '2026-08-19',
  count: 19,
}

describe('RangeSelectionExport', () => {
  it.each([
    { rate: 12.345, text: '+12.35%', direction: 'up' },
    { rate: -4.2, text: '-4.20%', direction: 'down' },
    { rate: 0, text: '0.00%', direction: 'flat' },
    { rate: null, text: '--', direction: 'flat' },
  ])('展示 $direction 收益率', ({ rate, text, direction }) => {
    const wrapper = mount(RangeSelectionExport, {
      props: { ...baseProps, returnRate: rate },
    })

    const result = wrapper.get('.range-return')
    expect(result.text()).toBe(text)
    expect(result.classes()).toContain(`range-return--${direction}`)
  })
})
