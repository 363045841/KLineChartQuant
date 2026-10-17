/** 磁吸菜单选择不切换绘图工具，主按钮恢复最近使用的档位。 */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import LeftToolbar from './LeftToolbar.vue'

describe('LeftToolbar 磁吸工具', () => {
  it('展开选择三档，并通过主按钮关闭和恢复最近档位', async () => {
    const wrapper = mount(LeftToolbar, {
      attachTo: document.body,
      props: { drawingToolId: 'trend-line', magnetMode: 'off' },
      global: { stubs: { ChartSettingsDialog: true, AlertDialog: true } },
    })

    async function selectMode(label: string) {
      await wrapper.get('[aria-label="磁吸选项"]').trigger('click')
      expect(wrapper.get('[aria-label="磁吸选项"]').attributes('aria-expanded')).toBe('true')
      const button = document.body.querySelector<HTMLButtonElement>(
        `.tool-dropdown [aria-label="${label}"]`,
      )
      expect(button).not.toBeNull()
      button?.click()
      await nextTick()
    }

    try {
      expect(wrapper.get('[aria-label="磁吸：关闭磁吸"]').attributes('aria-pressed')).toBe('false')
      await selectMode('弱磁铁')
      expect(wrapper.emitted('setMagnetMode')).toEqual([['weak']])
      expect(wrapper.emitted('selectTool')).toBeUndefined()

      await wrapper.setProps({ magnetMode: 'weak' })
      expect(wrapper.get('[aria-label="磁吸：弱磁铁"]').attributes('aria-pressed')).toBe('true')
      await wrapper.get('[aria-label="磁吸：弱磁铁"]').trigger('click')
      await wrapper.setProps({ magnetMode: 'off' })
      await wrapper.get('[aria-label="磁吸：关闭磁吸"]').trigger('click')
      expect(wrapper.emitted('setMagnetMode')).toEqual([['weak'], ['off'], ['weak']])

      await selectMode('强磁铁')
      await wrapper.setProps({ magnetMode: 'strong' })
      await selectMode('关闭磁吸')
      expect(wrapper.emitted('setMagnetMode')).toEqual([
        ['weak'],
        ['off'],
        ['weak'],
        ['strong'],
        ['off'],
      ])
      expect(wrapper.emitted('selectTool')).toBeUndefined()
    } finally {
      wrapper.unmount()
    }
  })
})

describe('LeftToolbar 连续绘图', () => {
  it('通过受控开关发出状态变更且不切换绘图工具', async () => {
    const wrapper = mount(LeftToolbar, {
      props: { drawingToolId: 'trend-line' },
      global: { stubs: { ChartSettingsDialog: true, AlertDialog: true } },
    })
    try {
      const button = wrapper.get('[aria-label="连续绘图"]')
      expect(button.attributes('aria-pressed')).toBe('false')
      await button.trigger('click')
      expect(wrapper.emitted('setContinuousDrawing')).toEqual([[true]])
      await wrapper.setProps({ continuousDrawing: true })
      expect(button.attributes('aria-pressed')).toBe('true')
      await button.trigger('click')
      expect(wrapper.emitted('setContinuousDrawing')).toEqual([[true], [false]])
      expect(wrapper.emitted('selectTool')).toBeUndefined()
    } finally {
      wrapper.unmount()
    }
  })
})

describe('LeftToolbar 图元可见性', () => {
  it('按图元列表状态隐藏和显示全部图元', async () => {
    const wrapper = mount(LeftToolbar, {
      props: { hasDrawings: true, allDrawingsHidden: false },
      global: { stubs: { ChartSettingsDialog: true, AlertDialog: true } },
    })
    try {
      await wrapper.get('[aria-label="隐藏所有图元"]').trigger('click')
      expect(wrapper.emitted('setAllDrawingsVisible')).toEqual([[false]])
      await wrapper.setProps({ allDrawingsHidden: true })
      const button = wrapper.get('[aria-label="显示所有图元"]')
      expect(button.attributes('aria-pressed')).toBe('true')
      await button.trigger('click')
      expect(wrapper.emitted('setAllDrawingsVisible')).toEqual([[false], [true]])
    } finally {
      wrapper.unmount()
    }
  })
})
