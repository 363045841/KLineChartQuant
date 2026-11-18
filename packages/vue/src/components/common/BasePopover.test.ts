/**
 * BasePopover：非受控契约、两种触发方式与内容角色。
 *
 * 契约本身也在这里守住：组件不声明 open，开合由触发器决定。
 */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { h, nextTick } from 'vue'
import BasePopover from './BasePopover.vue'

async function flush(): Promise<void> {
  await nextTick()
  await nextTick()
}

interface TriggerSlotProps {
  readonly props: Record<string, unknown>
}

/** 挂载带触发器的气泡；触发器与正文都带可用于断言的标记。 */
function mountPopover(props: Record<string, unknown>) {
  return mount(BasePopover, {
    attachTo: document.body,
    props: { label: '说明', ...props },
    slots: {
      trigger: ({ props: triggerProps }: TriggerSlotProps) =>
        h('button', { ...triggerProps, 'data-trigger': '' }, 'i'),
      default: () => h('p', { 'data-body': '' }, '内容'),
    },
  })
}

function panel(): HTMLElement | null {
  return document.body.querySelector('.base-popover')
}

function bodyText(): string | null {
  return document.body.querySelector('[data-body]')?.textContent ?? null
}

describe('BasePopover 非受控契约', () => {
  it('不声明 open：开关只由组件内部持有', () => {
    expect(BasePopover.props).not.toHaveProperty('open')
  })

  it('click 触发：单击展开，Esc 收起', async () => {
    const wrapper = mountPopover({ trigger: 'click' })
    const trigger = wrapper.get('[data-trigger]').element as HTMLButtonElement

    trigger.click()
    await flush()
    expect(bodyText()).toBe('内容')

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flush()
    expect(bodyText()).toBeNull()
    wrapper.unmount()
  })

  it('click 触发：点击外部收起', async () => {
    const wrapper = mountPopover({ trigger: 'click' })
    const trigger = wrapper.get('[data-trigger]').element as HTMLButtonElement

    trigger.click()
    await flush()
    expect(bodyText()).toBe('内容')

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await flush()
    expect(bodyText()).toBeNull()
    wrapper.unmount()
  })

  it('hover 触发：指针进入展开，移出延迟收起', async () => {
    const wrapper = mountPopover({ trigger: 'hover' })
    const trigger = wrapper.get('[data-trigger]').element as HTMLButtonElement

    trigger.dispatchEvent(new Event('mouseenter'))
    await flush()
    expect(bodyText()).toBe('内容')

    trigger.dispatchEvent(new Event('mouseleave'))
    await new Promise((resolve) => setTimeout(resolve, 160))
    await flush()
    expect(bodyText()).toBeNull()
    wrapper.unmount()
  })
})

describe('BasePopover 内容角色', () => {
  it('dialog：面板是 dialog，触发器声明 aria-haspopup', async () => {
    const wrapper = mountPopover({ role: 'dialog' })
    const trigger = wrapper.get('[data-trigger]')

    trigger.element.dispatchEvent(new Event('mouseenter'))
    expect(panel()?.getAttribute('role')).toBe('dialog')
    expect(panel()?.getAttribute('aria-label')).toBe('说明')
    expect(trigger.attributes('aria-haspopup')).toBe('dialog')
    wrapper.unmount()
  })

  it('note：纯说明不声明 aria-haspopup', () => {
    const wrapper = mountPopover({ role: 'note' })
    const trigger = wrapper.get('[data-trigger]')

    expect(panel()?.getAttribute('role')).toBe('note')
    expect(trigger.attributes('aria-haspopup')).toBeUndefined()
    wrapper.unmount()
  })
})
