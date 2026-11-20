/** 取色器浮层：点击打开、点外/Esc 关闭、Esc 归还焦点，关闭后可再次打开。 */
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ColorPicker from './ColorPicker.vue'

const wrappers: Array<{ unmount(): void }> = []

/** 挂载真实取色器并把面板挂到 body。 */
function mountPicker() {
  const wrapper = mount(ColorPicker, {
    attachTo: document.body,
    props: { modelValue: '#ff0000', label: '颜色' },
  })
  wrappers.push(wrapper)
  return wrapper
}

/** 取当前面板；面板常驻 DOM，关闭时由定位样式隐藏。 */
function panel(): HTMLElement {
  const element = document.body.querySelector<HTMLElement>('.color-picker__panel')
  if (!element) throw new Error('缺少取色面板')
  return element
}

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount()
  document.body.replaceChildren()
})

describe('ColorPicker 浮层', () => {
  it('点击打开、点外关闭', async () => {
    const wrapper = mountPicker()
    const trigger = wrapper.get<HTMLButtonElement>('.color-picker__trigger')

    await trigger.trigger('click')
    await vi.waitFor(() => expect(panel().style.display).not.toBe('none'))

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await vi.waitFor(() => expect(panel().style.display).toBe('none'))
  })

  it('Esc 关闭并归还焦点，关闭后可再次打开', async () => {
    const wrapper = mountPicker()
    const trigger = wrapper.get<HTMLButtonElement>('.color-picker__trigger')

    await trigger.trigger('click')
    await vi.waitFor(() => expect(panel().style.display).not.toBe('none'))

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await vi.waitFor(() => expect(panel().style.display).toBe('none'))
    expect(document.activeElement).toBe(trigger.element)

    await trigger.trigger('click')
    await vi.waitFor(() => expect(panel().style.display).not.toBe('none'))
  })
})
