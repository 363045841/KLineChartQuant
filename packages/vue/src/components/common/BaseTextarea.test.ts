/** BaseTextarea：输入同步与 JS 自动增高回退。 */

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

  it('输入内容通过 v-model 更新', async () => {
    mockFieldSizing(true)
    const wrapper = mount(BaseTextarea, {
      props: { modelValue: 'a' },
    })
    const textarea = wrapper.get('textarea')
    await textarea.setValue('abc')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['abc'])
    wrapper.unmount()
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
    wrapper.unmount()
  })
})
