/** 绘图工具栏锁定/解锁按钮行为测试。 */

import type { DrawingObject } from '@363045841yyt/klinechart-core/controllers'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import DrawingStyleToolbar from './DrawingStyleToolbar.vue'

/** 构造带锁定状态的最小图元；locked 缺省表示未锁定。 */
function createDrawing(id: string, locked?: boolean): DrawingObject {
  return {
    id,
    kind: 'trend-line',
    paneId: 'main',
    visible: true,
    ...(locked === undefined ? {} : { locked }),
    anchors: [],
    params: {},
    style: {},
  }
}

describe('DrawingStyleToolbar 锁定按钮', () => {
  it.each([
    { name: '单个未锁定', drawings: [createDrawing('a', false)], title: '锁定', next: true },
    { name: '单个已锁定', drawings: [createDrawing('a', true)], title: '解锁', next: false },
    { name: '锁定状态缺省', drawings: [createDrawing('a')], title: '锁定', next: true },
    {
      name: '混合选中',
      drawings: [createDrawing('a', true), createDrawing('b', false)],
      title: '锁定',
      next: true,
    },
    {
      name: '全部已锁定',
      drawings: [createDrawing('a', true), createDrawing('b', true)],
      title: '解锁',
      next: false,
    },
  ])('$name：提示「$title」，点击提交 locked=$next', async ({ drawings, title, next }) => {
    const wrapper = mount(DrawingStyleToolbar, {
      props: { drawings, editableStyleKeys: [] },
    })

    const lockButton = wrapper.get('.toolbar-btn--lock')
    expect(lockButton.attributes('title')).toBe(title)

    await lockButton.trigger('click')
    expect(wrapper.emitted('toggleLock')).toEqual([[next]])

    wrapper.unmount()
  })

  it('锁定后样式控件保持可用，仅删除被禁用', () => {
    const wrapper = mount(DrawingStyleToolbar, {
      props: { drawings: [createDrawing('a', true)], editableStyleKeys: ['stroke'] },
    })

    expect(wrapper.get('input[type="color"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.get('.toolbar-btn--delete').attributes('disabled')).toBeDefined()

    wrapper.unmount()
  })

  it('shows icon positions in the canvas toolbar while editing text', async () => {
    const wrapper = mount(DrawingStyleToolbar, {
      props: { drawings: [], editableStyleKeys: [], lineLabelPosition: 'center' },
    })

    expect(wrapper.findAll('.label-position__button')).toHaveLength(3)
    expect(wrapper.get('[aria-label="居中"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.find('.toolbar-btn--delete').exists()).toBe(false)
    await wrapper.get('[aria-label="起点"]').trigger('click')
    expect(wrapper.emitted('updateLineLabelPosition')).toEqual([['start']])
    wrapper.unmount()
  })

  it('opens settings for the single selected drawing only', async () => {
    const drawing = createDrawing('a')
    const wrapper = mount(DrawingStyleToolbar, {
      props: { drawings: [drawing], editableStyleKeys: [] },
    })
    await wrapper.get('.toolbar-btn--settings').trigger('click')
    expect(wrapper.emitted('openSettings')).toEqual([['a']])
    await wrapper.setProps({ drawings: [drawing, createDrawing('b')] })
    expect(wrapper.find('.toolbar-btn--settings').exists()).toBe(false)
    wrapper.unmount()
  })
})
