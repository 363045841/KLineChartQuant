/** 新建警报弹窗：脚本入口打开独立选择器，选择结果写回草稿。 */
import AlertAddDialog from '@vue-src/components/alert/AlertAddDialog.vue'
import {
  CURRENT,
  registerScript,
  scriptDefinition,
} from '@vue-src/composables/alerts/__tests__/helpers/alertTestKit.js'
import { mount } from '@vue/test-utils'
import { beforeAll, expect, it } from 'vitest'

beforeAll(registerScript)

const BaseModalStub = {
  props: {
    open: Boolean,
    body: String,
    size: String,
    footerAlign: String,
  },
  emits: ['update:open'],
  template:
    '<div v-if="open"><slot name="title" /><slot name="tabs" /><slot /><slot name="footer" /></div>',
}

/** 品种选择器依赖行情源上下文，这里只隔离脚本入口的接线。 */
const SymbolSelectorStub = {
  name: 'SymbolSelector',
  props: [
    'symbol',
    'selectedItem',
    'symbols',
    'search',
    'aggregationSources',
    'enabledSourceNames',
    'showWatchlistAction',
    'showManageSources',
    'variant',
  ],
  template: '<div class="symbol-selector-stub" />',
}

/** 挂载新建弹窗；只保留与脚本选择相关的真实组件。 */
function mountDialog() {
  return mount(AlertAddDialog, {
    props: {
      open: true,
      alerts: null,
      currentSpec: CURRENT,
      instruments: [],
      searchSymbols: async () => [],
      aggregationSources: [],
      enabledSourceNames: new Set<string>(),
    },
    global: { stubs: { BaseModal: BaseModalStub, SymbolSelector: SymbolSelectorStub } },
  })
}

it('opens the script picker and writes the chosen script into the draft', async () => {
  const wrapper = mountDialog()
  const trigger = wrapper.get('.selection-field')
  expect(trigger.text()).toContain('选择脚本')

  await trigger.trigger('click')
  const row = wrapper.find('.modal-list-entry .item-select')
  expect(row.exists()).toBe(true)

  await row.trigger('click')
  expect(trigger.text()).toContain(scriptDefinition().label)
  expect(wrapper.find('.modal-list-entry').exists()).toBe(false)
})

it('renders the symbol entry as a form field', () => {
  const wrapper = mountDialog()

  expect(wrapper.getComponent({ name: 'SymbolSelector' }).props('variant')).toBe('field')
})
