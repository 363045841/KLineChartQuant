/** 验证抽屉拆分后的互斥编辑、事件契约、草稿保留与焦点行为。 */
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import AgentSessionDrawer from '../AgentSessionDrawer.vue'

enableAutoUnmount(afterEach)

/** 挂载真实会话行与抽屉，仅关闭动画以便验证 DOM 焦点。 */
function mountDrawer() {
  return mount(AgentSessionDrawer, {
    attachTo: document.body,
    props: {
      show: true,
      locale: 'zh-CN',
      activeSessionId: 'first',
      sessions: [
        { id: 'first', title: '第一会话', updatedAt: 1 },
        { id: 'second', title: '第二会话', updatedAt: 2 },
      ],
    },
  })
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('AgentSessionDrawer', () => {
  it('保持单行编辑，重命名校验后发出带 id 的事件并恢复面板焦点', async () => {
    const wrapper = mountDrawer()
    const rows = wrapper.findAll('li')
    await rows[0]!.get('.agent-session-drawer__item-actions button').trigger('click')
    await nextTick()
    const input = wrapper.get('input')
    expect(document.activeElement).toBe(input.element)
    await input.setValue('   ')
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('rename')).toBeUndefined()

    await rows[1]!.get('.agent-session-drawer__item-actions button').trigger('click')
    await nextTick()
    expect(wrapper.findAll('input')).toHaveLength(1)
    expect(wrapper.get('input').element.value).toBe('第二会话')
    await wrapper.get('input').setValue('  新名称  ')
    await wrapper.get('form').trigger('submit')
    await nextTick()
    expect(wrapper.emitted('rename')).toEqual([['second', '新名称']])
    expect(document.activeElement).toBe(wrapper.get('aside').element)
  })

  it('删除默认聚焦取消，Escape 仅取消编辑，确认后发出目标 id', async () => {
    const wrapper = mountDrawer()
    const actions = wrapper.findAll('li')[0]!.findAll('.agent-session-drawer__item-actions button')
    await actions[1]!.trigger('click')
    await nextTick()
    const cancel = wrapper.get('.agent-session-drawer__confirm button')
    expect(document.activeElement).toBe(cancel.element)
    await cancel.trigger('keydown', { key: 'Escape' })
    await nextTick()
    expect(wrapper.find('.agent-session-drawer__confirm').exists()).toBe(false)
    expect(wrapper.emitted('close')).toBeUndefined()
    expect(wrapper.emitted('delete')).toBeUndefined()
    expect(document.activeElement).toBe(wrapper.get('aside').element)

    await wrapper
      .findAll('li')[1]!
      .findAll('.agent-session-drawer__item-actions button')[1]!
      .trigger('click')
    await wrapper.get('.agent-session-drawer__text-button--danger').trigger('click')
    expect(wrapper.emitted('delete')).toEqual([['second']])
  })

  it('关闭再打开保留重命名草稿并恢复输入焦点', async () => {
    const wrapper = mountDrawer()
    await wrapper
      .findAll('li')[0]!
      .get('.agent-session-drawer__item-actions button')
      .trigger('click')
    await wrapper.get('input').setValue('未提交草稿')
    await wrapper.setProps({ show: false })
    await wrapper.setProps({ show: true })
    await nextTick()
    expect(wrapper.get('input').element.value).toBe('未提交草稿')
    expect(document.activeElement).toBe(wrapper.get('input').element)
  })
})
