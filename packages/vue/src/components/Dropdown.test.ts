/** Dropdown / DropMenu：Popover 层、焦点进入列表、方向键导航、Esc 归还焦点。 */

import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { anchoredPopoverPlatform } from '../composables/overlay/useAnchoredPopover.js'
import Dropdown from './Dropdown.vue'
import DropMenu from './DropMenu.vue'

const options = [
  { label: 'Alpha', value: 'a' },
  { label: 'Beta', value: 'b' },
  { label: 'Gamma', value: 'g' },
]

async function flush(): Promise<void> {
  await nextTick()
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

function key(target: Element, name: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key: name,
    bubbles: true,
    cancelable: true,
    ...init,
  })
  target.dispatchEvent(event)
  return event
}

function optionEls(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[role="option"]')]
}

describe('Dropdown（无 Popover API 的退化模式）', () => {
  it('点击打开后焦点落在已选项，方向键/Home/End/typeahead 移动焦点', async () => {
    const wrapper = mount(Dropdown, {
      attachTo: document.body,
      props: { modelValue: 'b', options, ariaLabel: '级别' },
    })
    const trigger = wrapper.get('button').element as HTMLButtonElement
    trigger.click()
    await flush()
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    const [alpha, beta, gamma] = optionEls()
    expect(document.activeElement).toBe(beta)
    const listbox = document.querySelector('[role="listbox"]') as HTMLElement
    expect(listbox.getAttribute('aria-label')).toBe('级别')

    key(beta as HTMLElement, 'ArrowDown')
    expect(document.activeElement).toBe(gamma)
    key(gamma as HTMLElement, 'ArrowDown')
    expect(document.activeElement).toBe(alpha)
    key(alpha as HTMLElement, 'End')
    expect(document.activeElement).toBe(gamma)
    key(gamma as HTMLElement, 'Home')
    expect(document.activeElement).toBe(alpha)
    key(alpha as HTMLElement, 'g')
    expect(document.activeElement).toBe(gamma)
    // roving tabindex：只有当前项可 Tab 聚焦
    expect(optionEls().map((option) => option.tabIndex)).toEqual([-1, -1, 0])
    wrapper.unmount()
  })

  it('选择后发出 update:modelValue、关闭并把焦点还给触发器', async () => {
    const wrapper = mount(Dropdown, {
      attachTo: document.body,
      props: { modelValue: 'a', options },
    })
    const trigger = wrapper.get('button').element as HTMLButtonElement
    trigger.click()
    await flush()
    optionEls()[2]?.click()
    await flush()
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['g'])
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(trigger)
    wrapper.unmount()
  })

  it('Esc 关闭并阻止默认行为（不连带关闭外层 dialog），焦点回到触发器', async () => {
    const wrapper = mount(Dropdown, {
      attachTo: document.body,
      props: { modelValue: 'a', options },
    })
    const trigger = wrapper.get('button').element as HTMLButtonElement
    key(trigger, 'ArrowDown')
    await flush()
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    const event = key(document.activeElement as HTMLElement, 'Escape')
    await flush()
    expect(event.defaultPrevented).toBe(true)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(trigger)
    wrapper.unmount()
  })

  it('打开另一个下拉会关闭当前下拉（同一时间只开一个）', async () => {
    const first = mount(Dropdown, { attachTo: document.body, props: { modelValue: 'a', options } })
    const second = mount(Dropdown, { attachTo: document.body, props: { modelValue: 'a', options } })
    const a = first.get('button').element as HTMLButtonElement
    const b = second.get('button').element as HTMLButtonElement
    a.click()
    await flush()
    b.click()
    await flush()
    expect(a.getAttribute('aria-expanded')).toBe('false')
    expect(b.getAttribute('aria-expanded')).toBe('true')
    first.unmount()
    second.unmount()
  })
})

describe('Dropdown（Popover API 模式）', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    delete (HTMLElement.prototype as Partial<HTMLElement>).showPopover
    delete (HTMLElement.prototype as Partial<HTMLElement>).hidePopover
  })

  it('面板为 popover="auto"，触发器通过 popovertarget 关联，beforetoggle 同步状态', async () => {
    const show = vi.fn(function (this: HTMLElement) {
      const before = new Event('beforetoggle') as Event & { newState: string }
      Object.assign(before, { newState: 'open' })
      this.dispatchEvent(before)
      // 浏览器在显示之后异步派发 toggle；此时才可聚焦面板内容。
      queueMicrotask(() => {
        const after = new Event('toggle') as Event & { newState: string }
        Object.assign(after, { newState: 'open' })
        this.dispatchEvent(after)
      })
    })
    const hide = vi.fn(function (this: HTMLElement) {
      const event = new Event('beforetoggle') as Event & { newState: string }
      Object.assign(event, { newState: 'closed' })
      this.dispatchEvent(event)
    })
    Object.assign(HTMLElement.prototype, { showPopover: show, hidePopover: hide })
    vi.spyOn(anchoredPopoverPlatform, 'anchor').mockReturnValue(true)

    const wrapper = mount(Dropdown, {
      attachTo: document.body,
      props: { modelValue: 'a', options },
    })
    const trigger = wrapper.get('button').element as HTMLButtonElement
    const panel = document.querySelector('[role="listbox"]') as HTMLElement
    expect(
      panel.getAttribute('popover') ?? (panel as HTMLElement & { popover?: string }).popover,
    ).toBe('auto')
    expect(trigger.getAttribute('popovertarget')).toBe(panel.id)
    // anchor positioning：触发器声明 anchor-name，面板引用它
    expect(trigger.getAttribute('style')).toContain('anchor-name')
    expect(panel.getAttribute('style')).toContain('position-anchor')

    key(trigger, 'ArrowDown')
    await flush()
    expect(show).toHaveBeenCalled()
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(optionEls()).toHaveLength(3)
    // toggle 之后焦点进入已选项
    expect(document.activeElement).toBe(optionEls()[0])

    optionEls()[1]?.click()
    await flush()
    expect(hide).toHaveBeenCalled()
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    wrapper.unmount()
  })
})

describe('DropMenu', () => {
  const groups = [
    {
      id: 'g',
      label: '组',
      items: [
        { id: '1', label: 'One' },
        { id: '2', label: 'Two', disabled: true },
        { id: '3', label: 'Three' },
      ],
    },
  ]

  it('打开后焦点进入首个可用项，方向键跳过禁用项', async () => {
    const wrapper = mount(DropMenu, { attachTo: document.body, props: { label: '菜单', groups } })
    const trigger = wrapper.get('button').element as HTMLButtonElement
    trigger.click()
    await flush()
    const items = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
    expect(document.activeElement).toBe(items[0])
    key(items[0] as HTMLElement, 'ArrowDown')
    expect(document.activeElement).toBe(items[2])
    key(items[2] as HTMLElement, 'ArrowUp')
    expect(document.activeElement).toBe(items[0])
    ;(items[2] as HTMLElement).click()
    await flush()
    expect(wrapper.emitted('select')?.[0]).toEqual(['g', '3'])
    expect(document.activeElement).toBe(trigger)
    wrapper.unmount()
  })
})
