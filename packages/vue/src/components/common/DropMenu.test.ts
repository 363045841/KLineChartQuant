/** DropMenu：列表选择、键盘导航与菜单互斥。 */

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import DropMenu from './DropMenu.vue'

const selectionGroups = [
  {
    id: 'selection',
    label: '',
    items: [
      { label: 'Alpha', id: 'a' },
      { label: 'Beta', id: 'b', active: true },
      { label: 'Gamma', id: 'g' },
    ],
  },
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
  return [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
}

describe('DropMenu 单选（无 Popover API 的退化模式）', () => {
  it('点击打开后焦点落在已选项，方向键/Home/End/typeahead 移动焦点', async () => {
    const wrapper = mount(DropMenu, {
      attachTo: document.body,
      props: { groups: selectionGroups, label: '级别' },
    })
    const trigger = wrapper.get('button').element as HTMLButtonElement
    trigger.click()
    await flush()
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    const [alpha, beta, gamma] = optionEls()
    expect(document.activeElement).toBe(beta)
    const listbox = document.querySelector('[role="menu"]') as HTMLElement
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

  it('选择后发出 select、关闭并把焦点还给触发器', async () => {
    const wrapper = mount(DropMenu, {
      attachTo: document.body,
      props: { groups: selectionGroups, label: '级别' },
    })
    const trigger = wrapper.get('button').element as HTMLButtonElement
    trigger.click()
    await flush()
    optionEls()[2]?.click()
    await flush()
    expect(wrapper.emitted('select')?.[0]).toEqual(['selection', 'g'])
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(trigger)
    wrapper.unmount()
  })

  it('打开另一个下拉会关闭当前下拉（同一时间只开一个）', async () => {
    const first = mount(DropMenu, {
      attachTo: document.body,
      props: { groups: selectionGroups, label: '级别' },
    })
    const second = mount(DropMenu, {
      attachTo: document.body,
      props: { groups: selectionGroups, label: '级别' },
    })
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

  it('键盘打开后焦点进入首个可用项，方向键跳过禁用项', async () => {
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

  it('指针打开时不把焦点移入菜单项，只预置 tabindex', async () => {
    const wrapper = mount(DropMenu, { attachTo: document.body, props: { label: '菜单', groups } })
    const trigger = wrapper.get('button').element as HTMLButtonElement
    trigger.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    trigger.click()
    await flush()
    const items = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
    expect(items.length).toBeGreaterThan(0)
    expect(document.activeElement).not.toBe(items[0])
    expect(items[0]?.tabIndex).toBe(0)
    expect(items[2]?.tabIndex).toBe(-1)
    key(trigger, 'ArrowDown')
    expect(document.activeElement).toBe(items[0])
    wrapper.unmount()
  })
  it('多个分组按分隔线排列，快捷键在右侧展示', async () => {
    const grouped = [
      { id: 'a', label: '', items: [{ id: '1', label: 'One', shortcut: 'Alt+R' }] },
      { id: 'b', label: '', items: [{ id: '2', label: 'Two' }] },
    ]
    const wrapper = mount(DropMenu, {
      attachTo: document.body,
      props: { label: '菜单', groups: grouped },
    })
    ;(wrapper.get('button').element as HTMLButtonElement).click()
    await flush()
    expect(document.querySelectorAll('.drop-menu__group')).toHaveLength(2)
    expect(document.querySelector('.drop-menu__shortcut')?.textContent).toBe('Alt+R')
    wrapper.unmount()
  })
})

describe('DropMenu 坐标模式（右键菜单）', () => {
  const groups = [
    {
      id: 'chart',
      label: '',
      items: [
        { id: 'view.reset', label: '重置图表' },
        { id: 'copy-price', label: '复制价格' },
      ],
    },
  ]

  it('不渲染触发器，openAt 打开后不聚焦菜单项，选择后发出 select', async () => {
    const wrapper = mount(DropMenu, {
      attachTo: document.body,
      props: { label: '图表菜单', groups, context: true },
    })
    expect(wrapper.find('.control-button').exists()).toBe(false)
    ;(wrapper.vm as unknown as { openAt: (x: number, y: number) => void }).openAt(24, 36)
    await flush()
    const menu = document.querySelector('[role="menu"]') as HTMLElement
    expect(menu.getAttribute('aria-label')).toBe('图表菜单')
    const items = optionEls()
    // 打开时不把焦点移入菜单项，避免首项常驻 hover 高亮；只预置 roving tabindex。
    expect(document.activeElement).not.toBe(items[0])
    expect(items[0]?.tabIndex).toBe(0)
    items[1]?.click()
    await flush()
    expect(wrapper.emitted('select')?.[0]).toEqual(['chart', 'copy-price'])
    wrapper.unmount()
  })
})
