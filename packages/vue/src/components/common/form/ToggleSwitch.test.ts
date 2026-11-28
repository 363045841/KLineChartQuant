/** 开关交互壳：视觉统一走 ToggleSwitchTrack，状态与键盘仍由原生 checkbox 提供。 */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ToggleSwitch from './ToggleSwitch.vue'

/** 挂载受控开关，并回传每次更新值。 */
function mountSwitch(options: { modelValue?: boolean; size?: 'default' | 'compact' } = {}) {
  return mount(ToggleSwitch, {
    props: {
      label: '自动保存',
      modelValue: options.modelValue ?? false,
      ...(options.size === undefined ? {} : { size: options.size }),
      'onUpdate:modelValue': () => {},
    },
  })
}

describe('ToggleSwitch', () => {
  it.each([
    { modelValue: false, size: undefined, checked: false, compact: false },
    { modelValue: true, size: 'compact' as const, checked: true, compact: true },
  ])(
    'maps checked=$checked and compact=$compact to the shared track',
    ({ modelValue, size, checked, compact }) => {
      const wrapper = mountSwitch({
        modelValue,
        ...(size === undefined ? {} : { size }),
      })
      const track = wrapper.get('.toggle-switch-track')
      expect(track.classes().includes('is-checked')).toBe(checked)
      expect(track.classes().includes('is-compact')).toBe(compact)
      expect(wrapper.find('input[type="checkbox"]').exists()).toBe(true)
    },
  )

  it('emits the next value from the native input', async () => {
    const wrapper = mountSwitch()
    await wrapper.get('input').setValue(true)
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([true])
  })
})
