/** Search commits composed text and field descriptions track validation. */
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, expect, it } from 'vitest'
import { h } from 'vue'
import BaseField from './BaseField.vue'
import SearchField from './SearchField.vue'

enableAutoUnmount(afterEach)

it('commits search text after IME composition ends', async () => {
  const wrapper = mount(SearchField, { props: { modelValue: '' } })
  const input = wrapper.get('input')
  await input.trigger('compositionstart')
  input.element.value = '中'
  await input.trigger('input')
  expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  await input.trigger('compositionend')
  expect(wrapper.emitted('update:modelValue')).toEqual([['中']])
})

it('links the native control with its label, hint and current error', async () => {
  const wrapper = mount(BaseField, {
    props: { label: 'Name', hint: 'Use a short name', error: 'Already taken' },
    slots: { default: ({ controlAttrs }) => h('input', controlAttrs) },
  })
  const input = wrapper.get('input')
  const hint = wrapper.get('.base-field__hint')
  const error = wrapper.get('[role="alert"]')
  expect(wrapper.get('label').attributes('for')).toBe(input.attributes('id'))
  expect(input.attributes('aria-describedby')).toBe(`${hint.attributes('id')} ${error.attributes('id')}`)
  expect(input.attributes('aria-invalid')).toBe('true')
  await wrapper.setProps({ error: '' })
  expect(input.attributes('aria-describedby')).toBe(hint.attributes('id'))
  expect(input.attributes('aria-invalid')).toBeUndefined()
})
