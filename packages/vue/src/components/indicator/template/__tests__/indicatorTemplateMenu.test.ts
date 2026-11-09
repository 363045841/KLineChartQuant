// 指标模板弹层：验证两页签渲染、保存校验与应用调用。

import type {
  ChartController,
  IndicatorTemplateSummary,
} from '@363045841yyt/klinechart-core/controllers'
import { mount } from '@vue/test-utils'
import IndicatorTemplateMenu from '@vue-src/components/indicator/template/impl/IndicatorTemplateMenu.vue'
import {
  describeApplyMessage,
  INDICATOR_TEMPLATE_TABS,
} from '@vue-src/composables/indicator/useIndicatorTemplates.js'
import { describe, expect, it, vi } from 'vitest'
import { createTestSignal } from '../../../../__tests__/_mockController.js'

/** 只声明模板弹层实际消费的成员，避免整份控制器替身。 */
function createTemplateController(templates: ReadonlyArray<IndicatorTemplateSummary> = []): {
  controller: ChartController
  applyTemplate: ReturnType<typeof vi.fn>
  saveTemplate: ReturnType<typeof vi.fn>
} {
  const list = createTestSignal(templates)
  const recent = createTestSignal<ReadonlyArray<string>>([])
  const currentLabels = createTestSignal<ReadonlyArray<string>>(['MACD', 'RSI x 2'])
  const applyTemplate = vi.fn(async () => ({ applied: 2, skipped: [], dropped: [] }))
  const saveTemplate = vi.fn(async () => 'id-1')
  // 只声明被消费的成员：契约新增其它成员时不必补桩，组件真正读取时才需要。
  const partial: Partial<ChartController> = {
    templates: list,
    recentTemplateIds: recent,
    currentIndicatorLabels: currentLabels,
    listTemplates: vi.fn(async () => templates),
    saveTemplate,
    renameTemplate: vi.fn(async () => undefined),
    deleteTemplate: vi.fn(async () => undefined),
    applyTemplate,
  }
  return { controller: partial as ChartController, applyTemplate, saveTemplate }
}

/** BaseModal 会 Teleport 到 body，这里替换成普通容器以便断言内部结构。 */
const MODAL_STUB = {
  BaseModal: {
    props: ['open'],
    template: '<section v-if="open"><slot name="tabs" /><slot /><slot name="footer" /></section>',
  },
}

/** 渲染弹层并展开，返回包装器。 */
async function mountMenu(controller: ChartController) {
  const wrapper = mount(IndicatorTemplateMenu, {
    props: { controller },
    global: { stubs: MODAL_STUB },
  })
  await wrapper.get('button[aria-label="指标模板"]').trigger('click')
  await wrapper.vm.$nextTick()
  return wrapper
}

describe('指标模板弹层', () => {
  it('默认停在「指标」页签，含保存入口与打开模板入口', async () => {
    const { controller } = createTemplateController()
    const wrapper = await mountMenu(controller)

    expect(wrapper.text()).toContain('保存指标模板…')
    expect(wrapper.text()).toContain('打开模板…')
    expect(wrapper.text()).not.toContain('模板名称')
  })

  it('切到「模板」页签后列出模板与指标摘要', async () => {
    const { controller } = createTemplateController([
      { id: 'a', name: 'A股', labels: ['MACD', 'RSI x 2'], instanceCount: 3 },
      { id: 'b', name: '加密', labels: ['BOLL'], instanceCount: 1 },
    ])
    const wrapper = await mountMenu(controller)

    const tabs = wrapper.findAll('[role="tab"]')
    expect(tabs).toHaveLength(2)
    await tabs[1].trigger('click')

    expect(wrapper.text()).toContain('A股')
    expect(wrapper.text()).toContain('MACD，RSI x 2')
    expect(wrapper.text()).toContain('加密')
  })

  it('点击模板行调用应用，成功后展示恢复条数', async () => {
    const { controller, applyTemplate } = createTemplateController([
      { id: 'a', name: 'A股', labels: ['MACD'], instanceCount: 1 },
    ])
    const wrapper = await mountMenu(controller)

    await wrapper.findAll('[role="tab"]')[1].trigger('click')
    await wrapper.get('.indicator-template__item-main').trigger('click')
    await vi.waitFor(() => expect(applyTemplate).toHaveBeenCalledWith({ id: 'a' }))
    await vi.waitFor(() => expect(wrapper.text()).toContain('已应用模板，恢复 2 个指标'))
  })

  it('搜索词过滤模板列表', async () => {
    const { controller } = createTemplateController([
      { id: 'a', name: 'A股', labels: ['MACD'], instanceCount: 1 },
      { id: 'b', name: '加密', labels: ['BOLL'], instanceCount: 1 },
    ])
    const wrapper = await mountMenu(controller)
    await wrapper.findAll('[role="tab"]')[1].trigger('click')

    await wrapper.get('input[aria-label="搜索模板"]').setValue('BOLL')

    expect(wrapper.text()).toContain('加密')
    expect(wrapper.text()).not.toContain('A股')
  })

  it('保存对话框展示当前指标摘要，名称为空时保存按钮禁用', async () => {
    const { controller, saveTemplate } = createTemplateController()
    const wrapper = await mountMenu(controller)

    await wrapper.get('.indicator-template__row').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('MACD，RSI x 2')
    const saveButton = wrapper
      .findAll('button')
      .find((button) => button.text() === '保存' && button.attributes('type') === 'submit')
    expect(saveButton?.attributes('disabled')).toBeDefined()
    expect(saveTemplate).not.toHaveBeenCalled()
  })

  it('应用结果文案点名无法加载的指标', () => {
    expect(describeApplyMessage(1, [])).toBe('已应用模板，恢复 1 个指标')
    expect(describeApplyMessage(1, ['gone', 'lost'])).toBe(
      '已恢复 1 个指标，2 个无法加载：gone、lost',
    )
  })

  it('页签常量与界面顺序一致', () => {
    expect(Object.values(INDICATOR_TEMPLATE_TABS)).toEqual(['indicators', 'templates'])
  })
})
