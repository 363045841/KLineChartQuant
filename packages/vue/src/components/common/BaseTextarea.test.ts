/** BaseTextarea：无拖拽手柄、field-sizing 优先、JS 兜底按内容增高。 */

import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import BaseTextarea from './BaseTextarea.vue'

const platform = vi.hoisted(() => ({ fieldSizing: true }))

vi.mock('../../composables/overlay/platform.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composables/overlay/platform.js')>()),
  supportsFieldSizing: () => platform.fieldSizing,
}))

function mockFieldSizing(supported: boolean) {
  platform.fieldSizing = supported
}

describe('BaseTextarea', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('v-model 双向绑定，透传属性，行数写入 CSS 变量', async () => {
    mockFieldSizing(true)
    const wrapper = mount(BaseTextarea, {
      props: { modelValue: 'a', minRows: 3, maxRows: 6, placeholder: '每行一个代码…' },
    })
    const textarea = wrapper.get('textarea')
    expect(textarea.attributes('placeholder')).toBe('每行一个代码…')
    expect(textarea.attributes('rows')).toBe('3')
    const style = textarea.attributes('style') ?? ''
    expect(style).toContain('--base-textarea-min-rows: 3')
    expect(style).toContain('--base-textarea-max-rows: 6')
    await textarea.setValue('abc')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['abc'])
  })

  it('支持 field-sizing 时不写内联高度（交给 CSS）', async () => {
    mockFieldSizing(true)
    const wrapper = mount(BaseTextarea, { props: { modelValue: '' } })
    await wrapper.get('textarea').setValue('line\nline\nline')
    await nextTick()
    const element = wrapper.get('textarea').element as HTMLTextAreaElement
    expect(element.style.height).toBe('')
    expect(wrapper.classes()).not.toContain('base-textarea--js-autosize')
  })

  it('不支持 field-sizing 时按 scrollHeight 自增高', async () => {
    mockFieldSizing(false)
    const wrapper = mount(BaseTextarea, { props: { modelValue: '' }, attachTo: document.body })
    const element = wrapper.get('textarea').element as HTMLTextAreaElement
    Object.defineProperty(element, 'scrollHeight', { configurable: true, get: () => 96 })
    await wrapper.setProps({ modelValue: 'a\nb\nc\nd' })
    await nextTick()
    await nextTick()
    expect(element.style.height).toBe('96px')
    expect(wrapper.classes()).toContain('base-textarea--js-autosize')
    wrapper.unmount()
  })
})
