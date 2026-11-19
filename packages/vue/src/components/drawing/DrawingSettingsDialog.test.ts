/** 验证设置文本与绘图模型共用同一套标签目标。 */
import type { DrawingObject } from '@363045841yyt/klinechart-core/controllers'
import { mount } from '@vue/test-utils'
import { createDrawingObject } from '@vue-src/__tests__/_drawingFixture.js'
import { expect, it } from 'vitest'
import DrawingSettingsDialog from './DrawingSettingsDialog.vue'

/** 打开实际的文本页，替换外层弹窗以避免 Teleport。 */
async function openTextSettings(drawing: DrawingObject) {
  const wrapper = mount(DrawingSettingsDialog, {
    props: { show: true, drawing, editableStyleKeys: ['stroke'] },
    global: {
      stubs: { BaseModal: { template: '<section><slot name="tabs" /><slot /></section>' } },
    },
  })
  const textTab = wrapper.findAll('[role="tab"]').find((tab) => tab.text() === '文本')
  if (!textTab) throw new Error('Missing text tab')
  await textTab.trigger('click')
  return wrapper
}

it('shows a vertical-line label in the textarea and saves to line', async () => {
  const drawing: DrawingObject = {
    ...createDrawingObject('event'),
    kind: 'vertical-line',
    labels: { line: { text: 'Listing\\nFirst trade', position: 'start' } },
  }
  const wrapper = await openTextSettings(drawing)
  try {
    const field = wrapper.get('textarea')
    expect(field.element.value).toBe('Listing\nFirst trade')
    expect(wrapper.find('select').exists()).toBe(false)
    await field.setValue('Updated event')
    expect(wrapper.emitted('updateText')).toEqual([['line', 'Updated event', 'start']])
  } finally {
    wrapper.unmount()
  }
})

it('reads and edits each named rectangle label independently', async () => {
  const drawing: DrawingObject = {
    ...createDrawingObject('range'),
    kind: 'rectangle',
    labels: {
      top: { text: 'Resistance', position: 'start' },
      inside: { text: 'Price range', position: 'center' },
    },
  }
  const wrapper = await openTextSettings(drawing)
  try {
    const target = wrapper.get('select')
    const field = wrapper.get('textarea')
    expect(target.element.value).toBe('top')
    expect(field.element.value).toBe('Resistance')
    await target.setValue('inside')
    expect(field.element.value).toBe('Price range')
    await field.setValue('Tight consolidation')
    expect(wrapper.emitted('updateText')).toEqual([['inside', 'Tight consolidation', 'center']])
  } finally {
    wrapper.unmount()
  }
})
