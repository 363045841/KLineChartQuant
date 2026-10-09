/** BaseModal：原生 dialog 的打开、可访问名称、Esc、焦点陷阱与焦点归还。 */

import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import BaseModal from './BaseModal.vue'

function dialogEl(): HTMLDialogElement {
  const element = document.querySelector('dialog')
  if (!element) throw new Error('dialog not rendered')
  return element
}

async function flush(): Promise<void> {
  await nextTick()
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('BaseModal', () => {
  let showModal: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal')
  })

  afterEach(() => {
    showModal.mockRestore()
  })

  it('用 showModal() 打开，并以标题作为 aria-labelledby', async () => {
    const wrapper = mount(BaseModal, {
      attachTo: document.body,
      props: { show: true, title: '图表设置' },
      slots: { default: () => h('p', '内容') },
    })
    await flush()
    const dialog = dialogEl()
    expect(showModal).toHaveBeenCalledTimes(1)
    expect(dialog.open).toBe(true)
    const titleId = dialog.getAttribute('aria-labelledby')
    expect(titleId).toBeTruthy()
    expect(document.getElementById(titleId as string)?.textContent).toBe('图表设置')
    const close = dialog.querySelector<HTMLButtonElement>('.base-close-btn')
    expect(close?.getAttribute('type')).toBe('button')
    expect(close?.getAttribute('aria-label')).toBe('关闭')
    wrapper.unmount()
  })

  it('Esc（cancel 事件）关闭：发出 close 与 update:open，并关闭原生 dialog', async () => {
    const wrapper = mount(BaseModal, {
      attachTo: document.body,
      props: { open: true, title: 'T' },
    })
    await flush()
    const cancel = new Event('cancel', { cancelable: true })
    dialogEl().dispatchEvent(cancel)
    await flush()
    expect(cancel.defaultPrevented).toBe(true)
    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(wrapper.emitted('update:open')?.[0]).toEqual([false])
    expect(document.querySelector('dialog')).toBeNull()
    wrapper.unmount()
  })

  it('只有按下与抬起都在背景上才关闭', async () => {
    const wrapper = mount(BaseModal, { attachTo: document.body, props: { show: true, title: 'T' } })
    await flush()
    const dialog = dialogEl()
    dialog.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(wrapper.emitted('close')).toBeUndefined()
    dialog.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    dialog.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('Tab 在对话框内循环（焦点陷阱）', async () => {
    const wrapper = mount(BaseModal, {
      attachTo: document.body,
      props: { show: true, title: 'T' },
      slots: {
        default: () => [h('input', { id: 'first-field' }), h('button', { id: 'last' }, 'OK')],
      },
    })
    await flush()
    const dialog = dialogEl()
    const close = dialog.querySelector<HTMLButtonElement>('.base-close-btn')
    const last = dialog.querySelector<HTMLButtonElement>('#last')
    last?.focus()
    const forward = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    last?.dispatchEvent(forward)
    expect(forward.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(close)

    const backward = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    })
    close?.dispatchEvent(backward)
    expect(backward.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(last)
    wrapper.unmount()
  })

  it('关闭后焦点回到打开前的元素', async () => {
    const Host = defineComponent({
      setup() {
        const open = ref(false)
        return () =>
          h('div', [
            h('button', { id: 'opener', onClick: () => (open.value = true) }, 'open'),
            h(
              BaseModal,
              {
                open: open.value,
                'onUpdate:open': (v?: boolean) => (open.value = Boolean(v)),
                title: 'T',
              },
              { default: () => h('input', { id: 'inside' }) },
            ),
          ])
      },
    })
    const wrapper = mount(Host, { attachTo: document.body })
    const opener = document.getElementById('opener') as HTMLButtonElement
    opener.focus()
    opener.click()
    await flush()
    ;(document.getElementById('inside') as HTMLInputElement).focus()
    dialogEl().querySelector<HTMLButtonElement>('.base-close-btn')?.click()
    await flush()
    expect(document.activeElement).toBe(opener)
    wrapper.unmount()
  })

  it('兼容旧的 show + close 用法：父级置 false 时卸载内容', async () => {
    const wrapper = mount(BaseModal, {
      attachTo: document.body,
      props: { show: true, title: 'T' },
      slots: { default: () => h('p', { id: 'body' }, 'x') },
    })
    await flush()
    expect(document.getElementById('body')).not.toBeNull()
    await wrapper.setProps({ show: false })
    await flush()
    expect(document.getElementById('body')).toBeNull()
    expect(wrapper.emitted('close')).toBeUndefined()
    wrapper.unmount()
  })
})
