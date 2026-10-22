/** 设置导航行使用原生按钮，键盘与辅助技术和鼠标走同一条选择路径。 */
import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import SettingsNavRow from './SettingsNavRow.vue'

it('以原生按钮呈现设置入口，并触发选择事件', async () => {
  const wrapper = mount(SettingsNavRow, { slots: { default: '行情数据源' } })
  try {
    const button = wrapper.get('button[type="button"]')
    expect(button.text()).toBe('行情数据源')
    await button.trigger('click')
    expect(wrapper.emitted('select')).toHaveLength(1)
  } finally {
    wrapper.unmount()
  }
})
