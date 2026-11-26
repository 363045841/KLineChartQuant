/** 参数行：控件表面、可见标签关联与各类型控件保持同一套表单语义。 */
import type { IndicatorInputDef } from '@363045841yyt/klinechart-core'
import ParamItem from '@vue-src/components/params/impl/ParamItem.vue'
import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'

/** 只保留触发按钮与 id，避免测试依赖菜单定位。 */
const DropMenuStub = {
  name: 'DropMenu',
  props: {
    label: String,
    groups: Array,
    triggerVariant: String,
    triggerId: String,
  },
  emits: ['select'],
  template: '<button :id="triggerId" class="drop-menu-stub"><slot name="trigger" /></button>',
}

function mountItem(param: IndicatorInputDef, value: number | string | boolean | undefined) {
  return mount(ParamItem, {
    props: { param, value },
    global: { stubs: { DropMenu: DropMenuStub } },
  })
}

it('renders the select as a field trigger and associates its label', () => {
  const wrapper = mountItem(
    {
      key: 'mode',
      label: '模式',
      type: 'select',
      default: 'fast',
      options: [
        { value: 'fast', label: '快速' },
        { value: 'slow', label: '慢速' },
      ],
    },
    'fast',
  )

  const trigger = wrapper.getComponent({ name: 'DropMenu' })
  expect(trigger.props('triggerVariant')).toBe('field')
  expect(wrapper.get('label').attributes('for')).toBe(trigger.props('triggerId'))
})

const cases: ReadonlyArray<{
  name: string
  param: IndicatorInputDef
  value: number | string | boolean
  selector: string
}> = [
  {
    name: 'number',
    param: { key: 'length', label: '周期', type: 'number', default: 20 },
    value: 20,
    selector: 'input[type="number"]',
  },
  {
    name: 'string',
    param: { key: 'title', label: '名称', type: 'string', default: 'MA' },
    value: 'MA',
    selector: 'input[type="text"]',
  },
  {
    name: 'boolean',
    param: { key: 'enabled', label: '启用', type: 'boolean', default: true },
    value: true,
    selector: 'input[type="checkbox"]',
  },
]

it.each(cases)('associates the $name label with its control', ({ param, value, selector }) => {
  const wrapper = mountItem(param, value)
  const control = wrapper.get(selector)

  expect(control.attributes('id')).toBeTruthy()
  expect(wrapper.get('label').attributes('for')).toBe(control.attributes('id'))
})
