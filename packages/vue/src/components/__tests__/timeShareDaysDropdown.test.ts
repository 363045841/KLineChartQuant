/** 多日分时天数下拉按后端能力过滤并回传数字值。 */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import TimeShareDaysDropdown from '../TimeShareDaysDropdown.vue'

describe('TimeShareDaysDropdown', () => {
  // 验证选项不会超过当前品种声明的 maxTradingDays。
  it('limits selectable days to maxTradingDays', async () => {
    const wrapper = mount(TimeShareDaysDropdown, {
      props: { modelValue: 1, maxTradingDays: 5 },
      global: { stubs: { Teleport: true } },
    })

    await wrapper.get('.dropdown__trigger').trigger('click')

    expect(wrapper.findAll('.dropdown__option').map((item) => item.text())).toEqual([
      '1日',
      '2日',
      '3日',
      '5日',
    ])
  })

  // 验证选择结果以 number 而非 Dropdown 内部 string 回传。
  it('emits the selected days as a number', async () => {
    const wrapper = mount(TimeShareDaysDropdown, {
      props: { modelValue: 1, maxTradingDays: 5 },
      global: { stubs: { Teleport: true } },
    })

    await wrapper.get('.dropdown__trigger').trigger('click')
    await wrapper.findAll('.dropdown__option')[2]!.trigger('click')

    expect(wrapper.emitted('update:modelValue')).toEqual([[3]])
  })
})
