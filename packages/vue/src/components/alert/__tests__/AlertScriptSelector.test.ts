/** 警报脚本选择弹窗：目录来自 Core、搜索过滤、选择回传与关闭请求。 */
import { alertCatalog } from '@363045841yyt/klinechart-core/controllers'
import AlertScriptSelector from '@vue-src/components/alert/AlertScriptSelector.vue'
import { registerScript } from '@vue-src/composables/alerts/__tests__/helpers/alertTestKit.js'
import { mount } from '@vue/test-utils'
import { beforeAll, expect, it } from 'vitest'

beforeAll(registerScript)

const BaseModalStub = {
  props: { open: Boolean },
  emits: ['update:open'],
  template: '<div v-if="open"><slot name="title" /><slot name="tabs" /><slot /></div>',
}

/** 挂载选择器；BaseModal 只渲染插槽，避免测试依赖原生 dialog。 */
function mountSelector(definitionId: string | null = null) {
  return mount(AlertScriptSelector, {
    props: { open: true, definitionId },
    global: { stubs: { BaseModal: BaseModalStub } },
  })
}

it('lists scripts from the Core catalog and marks the current selection', () => {
  const script = alertCatalog()[0]
  if (!script) throw new Error('Alert script fixture is missing')

  const wrapper = mountSelector(script.id)

  expect(wrapper.findAll('.modal-list-entry')).toHaveLength(1)
  expect(wrapper.text()).toContain(script.label)
  expect(wrapper.find('.item-check').exists()).toBe(true)
})

it('filters by label and explains an empty result', async () => {
  const wrapper = mountSelector()
  const search = wrapper.get('input')

  await search.setValue('价格')
  expect(wrapper.findAll('.modal-list-entry')).toHaveLength(1)

  await search.setValue('不存在')
  expect(wrapper.findAll('.modal-list-entry')).toHaveLength(0)
  expect(wrapper.get('[role="status"]').text()).toContain('未找到匹配的警报脚本')
})

it('emits the chosen definition and requests close', async () => {
  const script = alertCatalog()[0]
  if (!script) throw new Error('Alert script fixture is missing')
  const wrapper = mountSelector()

  await wrapper.get('.item-select').trigger('click')

  expect(wrapper.emitted('select')?.[0]).toEqual([{ id: script.id, label: script.label }])
  expect(wrapper.emitted('update:open')?.[0]).toEqual([false])
})

it('does not select when the description trigger is clicked', async () => {
  const wrapper = mountSelector()

  await wrapper.get('.item-info-btn').trigger('click')

  expect(wrapper.emitted('select')).toBeUndefined()
  expect(wrapper.emitted('update:open')).toBeUndefined()
})
