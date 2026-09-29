/** 绘图模板菜单的保存、应用、删除与完成反馈。 */

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { createDrawingObject } from '../__tests__/_drawingFixture'
import DrawingStyleToolbar from './DrawingStyleToolbar.vue'

function mountToolbar(templateNames: string[] = []) {
  return mount(DrawingStyleToolbar, {
    attachTo: document.body,
    props: { drawings: [createDrawingObject('a')], editableStyleKeys: ['stroke'], templateNames },
  })
}

async function openMenu(wrapper: ReturnType<typeof mountToolbar>) {
  await wrapper.get('[aria-label="模板"]').trigger('click')
  await nextTick()
}

describe('DrawingStyleToolbar 模板菜单', () => {
  it('单选显示新建模板和已有模板操作', async () => {
    const wrapper = mountToolbar(['existing'])
    try {
      await openMenu(wrapper)
      expect(
        [...document.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent?.trim()),
      ).toEqual(['保存为模板', 'existing'])
      expect(document.querySelector('[aria-label="保存模板 existing"]')).not.toBeNull()
      expect(document.querySelector('[aria-label="删除模板 existing"]')).not.toBeNull()
    } finally {
      wrapper.unmount()
    }
  })

  it('多选隐藏新建和保存已有模板，但保留应用与删除', async () => {
    const wrapper = mountToolbar(['existing'])
    try {
      await wrapper.setProps({ drawings: [createDrawingObject('a'), createDrawingObject('b')] })
      await openMenu(wrapper)
      expect(
        [...document.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent?.trim()),
      ).toEqual(['existing'])
      expect(document.querySelector('[aria-label="保存模板 existing"]')).toBeNull()
      document.querySelector<HTMLButtonElement>('[aria-label="删除模板 existing"]')!.click()
      expect(wrapper.emitted('deleteTemplate')).toEqual([['existing']])
      document.querySelector<HTMLButtonElement>('[role="menuitem"]')!.click()
      expect(wrapper.emitted('applyTemplate')).toEqual([['existing']])
    } finally {
      wrapper.unmount()
    }
  })

  it('保存已有模板后显示禁用的勾选按钮', async () => {
    const wrapper = mountToolbar(['existing'])
    try {
      await openMenu(wrapper)
      document.querySelector<HTMLButtonElement>('[aria-label="保存模板 existing"]')!.click()
      expect(wrapper.emitted('saveExistingTemplate')).toEqual([['existing']])
      await wrapper.setProps({ templateSaved: 'existing' })
      const button = document.querySelector<HTMLButtonElement>('[aria-label="已保存模板 existing"]')
      expect(button?.disabled).toBe(true)
    } finally {
      wrapper.unmount()
    }
  })

  it('单选和多选都可复制，空选择不显示复制按钮', async () => {
    const wrapper = mount(DrawingStyleToolbar, {
      props: { drawings: [createDrawingObject('a', true)], editableStyleKeys: [] },
    })
    try {
      await wrapper.get('[aria-label="复制所选图元"]').trigger('click')
      await wrapper.setProps({ drawings: [createDrawingObject('a'), createDrawingObject('b')] })
      await wrapper.get('[aria-label="复制所选图元"]').trigger('click')
      expect(wrapper.emitted('copy')).toEqual([[], []])
      await wrapper.setProps({ drawings: [] })
      expect(wrapper.find('.toolbar-btn--copy').exists()).toBe(false)
    } finally {
      wrapper.unmount()
    }
  })

  it.each([
    { name: '单个未锁定', drawings: [createDrawingObject('a', false)], title: '锁定', next: true },
    { name: '单个已锁定', drawings: [createDrawingObject('a', true)], title: '解锁', next: false },
    { name: '锁定状态缺省', drawings: [createDrawingObject('a')], title: '锁定', next: true },
    {
      name: '混合选中',
      drawings: [createDrawingObject('a', true), createDrawingObject('b', false)],
      title: '锁定',
      next: true,
    },
    {
      name: '全部已锁定',
      drawings: [createDrawingObject('a', true), createDrawingObject('b', true)],
      title: '解锁',
      next: false,
    },
  ])('$name：提示「$title」，点击提交 locked=$next', async ({ drawings, title, next }) => {
    const wrapper = mount(DrawingStyleToolbar, {
      props: { drawings, editableStyleKeys: [] },
    })
    const lockButton = wrapper.get('.toolbar-btn--lock')
    expect(lockButton.attributes('aria-label')).toBe(title)
    await lockButton.trigger('click')
    expect(wrapper.emitted('toggleLock')).toEqual([[next]])
    wrapper.unmount()
  })

  it('锁定后样式控件保持可用，仅删除被禁用', () => {
    const wrapper = mount(DrawingStyleToolbar, {
      props: { drawings: [createDrawingObject('a', true)], editableStyleKeys: ['stroke'] },
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
    const drawing = createDrawingObject('a')
    const wrapper = mount(DrawingStyleToolbar, {
      props: { drawings: [drawing], editableStyleKeys: [] },
    })
    await wrapper.get('.toolbar-btn--settings').trigger('click')
    expect(wrapper.emitted('openSettings')).toEqual([['a']])
    await wrapper.setProps({ drawings: [drawing, createDrawingObject('b')] })
    expect(wrapper.find('.toolbar-btn--settings').exists()).toBe(false)
    wrapper.unmount()
  })
})
