/** 行情品种能力对周期和复权下拉菜单的过滤测试。 */

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import Dropdown from '../Dropdown.vue'
import KLineAdjustmentDropdown from '../KLineAdjustmentDropdown.vue'
import KLineLevelDropdown from '../KLineLevelDropdown.vue'

describe('行情能力下拉菜单', () => {
  // 验证长选项列表可由调用方约束高度，并交由菜单自身滚动。
  it('应用传入的菜单最大高度', async () => {
    const wrapper = mount(Dropdown, {
      props: {
        modelValue: 'a',
        options: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ],
        maxHeight: '120px',
      },
      global: { stubs: { Teleport: true } },
    })

    await wrapper.get('.dropdown__trigger').trigger('click')

    expect(wrapper.get('.dropdown__menu').attributes('style')).toContain('max-height: calc(120px)')
  })

  // 验证周期菜单只展示当前品种声明的 K 线和分时能力。
  it('过滤不支持的周期', async () => {
    const wrapper = mount(KLineLevelDropdown, {
      props: {
        modelValue: 'daily',
        supportedLevels: ['timeshare', 'daily'],
      },
      global: { stubs: { Teleport: true } },
    })

    await wrapper.get('.dropdown__trigger').trigger('click')

    expect(wrapper.findAll('.dropdown__option').map((item) => item.text())).toEqual([
      '分时',
      '1day',
    ])
  })

  // 验证多日分时仅在品种声明对应能力后才显示。
  it('展示支持的五日分时周期', async () => {
    const wrapper = mount(KLineLevelDropdown, {
      props: {
        modelValue: '5daytimeshare',
        supportedLevels: ['timeshare', '5daytimeshare'],
      },
      global: { stubs: { Teleport: true } },
    })

    await wrapper.get('.dropdown__trigger').trigger('click')

    expect(wrapper.findAll('.dropdown__option').map((item) => item.text())).toEqual([
      '分时',
      '5日分时',
    ])
  })

  // 验证复权菜单只展示当前品种声明的复权方式。
  it('过滤不支持的复权方式', async () => {
    const wrapper = mount(KLineAdjustmentDropdown, {
      props: {
        modelValue: 'none',
        supportedAdjustments: ['none'],
      },
      global: { stubs: { Teleport: true } },
    })

    await wrapper.get('.dropdown__trigger').trigger('click')

    expect(wrapper.findAll('.dropdown__option').map((item) => item.text())).toEqual(['不复权'])
  })
})
