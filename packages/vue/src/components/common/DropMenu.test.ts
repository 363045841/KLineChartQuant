/** DropMenu：列表选择、键盘导航与菜单互斥。 */

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { resetTooltipGroup } from '@vue-src/composables/ui/useTooltip.js'
import DropMenu from './DropMenu.vue'
import MenuSurface from './MenuSurface.vue'
import type { DropMenuGroup } from './dropMenuTypes.js'

const selectionGroups: DropMenuGroup[] = [
  {
    id: 'selection',
    label: '',
    items: [
      { label: 'Alpha', id: 'a', selection: 'radio', checked: false },
      { label: 'Beta', id: 'b', selection: 'radio', checked: true },
      { label: 'Gamma', id: 'g', selection: 'radio', checked: false },
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

/** 面板根节点上写入的圆角覆盖变量；不覆盖时为空。 */
function panelRadius(): string {
  return document.querySelector<HTMLElement>('.drop-menu__panel')?.style.getPropertyValue(
    '--popover-surface-radius',
  ) ?? ''
}

function optionEls(): HTMLElement[] {
  return [
    ...document.querySelectorAll<HTMLElement>(
      '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]',
    ),
  ]
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
  it('多个分组按分隔线排列：带标题的分组自己承担分隔，快捷键在右侧展示', async () => {
    const grouped = [
      { id: 'a', label: '', items: [{ id: '1', label: 'One', shortcut: 'Alt+R' }] },
      { id: 'b', label: '组', items: [{ id: '2', label: 'Two' }] },
    ]
    const wrapper = mount(DropMenu, {
      attachTo: document.body,
      props: { label: '菜单', groups: grouped },
    })
    ;(wrapper.get('button').element as HTMLButtonElement).click()
    await flush()
    const rendered = [...document.querySelectorAll<HTMLElement>('.drop-menu__group')]
    expect(rendered).toHaveLength(2)
    // 无标题分组才画普通横线；带标题分组由标题两侧的线分隔，两种形态互斥。
    expect(rendered[0]?.classList).not.toContain('drop-menu__group--titled')
    expect(rendered[1]?.classList).toContain('drop-menu__group--titled')
    expect(document.querySelector('.drop-menu__shortcut')?.textContent).toBe('Alt+R')
    wrapper.unmount()
  })

  it('触发器提示默认在按钮上方，与菜单弹出方向无关', async () => {
    resetTooltipGroup()
    const wrapper = mount(DropMenu, {
      attachTo: document.body,
      props: { label: '菜单', groups, placement: 'bottom' },
    })
    wrapper.get('.base-tooltip__trigger').trigger('pointerenter')
    await new Promise((resolve) => setTimeout(resolve, 350))
    await flush()
    expect(document.querySelector('.base-tooltip.is-open')?.classList).toContain('base-tooltip--top')
    wrapper.unmount()

    const overridden = mount(DropMenu, {
      attachTo: document.body,
      props: { label: '菜单', groups, tooltipPlacement: 'bottom' },
    })
    overridden.get('.base-tooltip__trigger').trigger('pointerenter')
    await flush()
    expect(document.querySelector('.base-tooltip.is-open')?.classList).toContain(
      'base-tooltip--bottom',
    )
    overridden.unmount()
  })

  it('面板圆角跟随触发器，坐标锚点沿用表面默认值', async () => {
    const trigger = document.createElement('button')
    trigger.style.borderRadius = '4px'
    document.body.append(trigger)

    const anchored = mount(MenuSurface, {
      attachTo: document.body,
      props: { label: '菜单', groups, open: false, anchor: { kind: 'trigger', element: trigger } },
    })
    await flush()
    await anchored.setProps({ open: true })
    await flush()
    // 触发器是圆角唯一来源，宿主不必再传一份。
    expect(panelRadius()).toBe('4px')
    anchored.unmount()
    trigger.remove()

    const pointed = mount(MenuSurface, {
      attachTo: document.body,
      props: { label: '菜单', groups, open: true, anchor: { kind: 'point', x: 10, y: 10 } },
    })
    await flush()
    // 坐标锚点没有触发器，交给 popover-surface.css 的默认圆角。
    expect(panelRadius()).toBe('')
    pointed.unmount()
  })
})

describe('MenuSurface 指针锚点（右键菜单）', () => {
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

  it('按坐标打开且不聚焦菜单项，选择后发出 select', async () => {
    const wrapper = mount(MenuSurface, {
      attachTo: document.body,
      props: {
        label: '图表菜单',
        groups,
        open: true,
        anchor: { kind: 'point', x: 24, y: 36 },
      },
    })
    await flush()
    expect(wrapper.find('.control-button').exists()).toBe(false)
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

describe('DropMenu 图标槽位', () => {
  const icon = defineComponent({ render: () => h('svg') })

  it('只有存在图标时才保留左侧槽位，并为无图标项对齐', async () => {
    const plain = mount(DropMenu, {
      attachTo: document.body,
      props: {
        label: '菜单',
        groups: [{ id: 'g', label: '', items: [{ id: '1', label: 'One' }] }],
      },
    })
    ;(plain.get('button').element as HTMLButtonElement).click()
    await flush()
    expect(document.querySelector('.drop-menu__icon')).toBeNull()
    plain.unmount()

    const withIcon = mount(DropMenu, {
      attachTo: document.body,
      props: {
        label: '菜单',
        groups: [
          {
            id: 'g',
            label: '',
            items: [
              { id: '1', label: 'One', icon },
              { id: '2', label: 'Two' },
            ],
          },
        ],
      },
    })
    ;(withIcon.get('button').element as HTMLButtonElement).click()
    await flush()
    expect(document.querySelectorAll('.drop-menu__icon')).toHaveLength(2)
    withIcon.unmount()
  })
})

describe('DropMenu 顶层选择语义', () => {
  it('单选不因再次点击而取消，开关切换后保持打开', async () => {
    const wrapper = mount(DropMenu, {
      attachTo: document.body,
      props: {
        label: '菜单',
        groups: [
          {
            id: 'g',
            label: '',
            items: [
              { id: 'auto', label: '自动', checked: true, selection: 'radio' },
              {
                id: 'price-only',
                label: '仅缩放价格图表',
                checked: true,
                selection: 'checkbox',
              },
            ],
          },
        ],
      },
    })
    ;(wrapper.get('button').element as HTMLButtonElement).click()
    await flush()

    const radio = document.querySelector<HTMLElement>('[role="menuitemradio"]')
    const checkbox = document.querySelector<HTMLElement>('[role="menuitemcheckbox"]')
    // 两种勾互不排斥，各自渲染勾选图标。
    expect(radio?.getAttribute('aria-checked')).toBe('true')
    expect(checkbox?.getAttribute('aria-checked')).toBe('true')
    expect(document.querySelectorAll('.drop-menu__check svg')).toHaveLength(2)

    checkbox?.click()
    await flush()
    expect(wrapper.emitted('select')?.[0]).toEqual(['g', 'price-only'])
    expect(wrapper.emitted('close')).toBeUndefined()

    // 单选再点一次仍是一次选择，不会变成未勾选，按常规则关闭菜单。
    radio?.click()
    await flush()
    expect(wrapper.emitted('select')?.[1]).toEqual(['g', 'auto'])
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })
})

describe('DropMenu 二级菜单', () => {
  const groups: ReadonlyArray<DropMenuGroup> = [
    {
      id: 'g',
      label: '',
      items: [
        {
          id: 'period',
          label: '时间周期可见性',
          children: [
            { id: 'above', label: '当前及以上时间周期', checked: false, selection: 'checkbox' },
            { id: 'all', label: '所有时间周期', checked: true, selection: 'checkbox' },
          ],
        },
      ],
    },
  ]

  async function mountMenu() {
    const wrapper = mount(MenuSurface, {
      attachTo: document.body,
      props: {
        label: '菜单',
        groups,
        open: true,
        anchor: { kind: 'point', x: 24, y: 36 },
        keepOpenOnSelect: true,
      },
    })
    await flush()
    return wrapper
  }

  it('父项展开、复选保持打开、勾选态更新，方向键进出子菜单', async () => {
    const wrapper = await mountMenu()
    const parent = document.querySelector<HTMLElement>('[data-item-id="period"] [role="menuitem"]')
    expect(parent?.getAttribute('aria-haspopup')).toBe('menu')
    parent?.click()
    await flush()

    const checkboxes = [...document.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]')]
    expect(checkboxes.map((item) => item.getAttribute('aria-checked'))).toEqual(['false', 'true'])
    expect(parent?.getAttribute('aria-expanded')).toBe('true')

    checkboxes[0]?.click()
    await flush()
    expect(wrapper.emitted('select')?.[0]).toEqual(['g', 'above', 'period'])
    expect(wrapper.emitted('close')).toBeUndefined()
    expect(document.querySelector('[role="menuitemcheckbox"]')).not.toBeNull()

    // 父项只保存 id，子项始终从最新 groups 派生，外部更新勾选态后立即反映。
    await wrapper.setProps({
      groups: [
        {
          id: 'g',
          label: '',
          items: [
            {
              id: 'period',
              label: '时间周期可见性',
              children: [
                { id: 'above', label: '当前及以上时间周期', checked: true, selection: 'checkbox' },
                { id: 'all', label: '所有时间周期', checked: false, selection: 'checkbox' },
              ],
            },
          ],
        },
      ],
    })
    await flush()
    const updated = [...document.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]')]
    expect(updated.map((item) => item.getAttribute('aria-checked'))).toEqual(['true', 'false'])

    updated[0]?.focus()
    if (updated[0]) key(updated[0], 'ArrowLeft')
    await flush()
    expect(document.activeElement).toBe(parent)
    expect(document.querySelector('[role="menuitemcheckbox"]')).toBeNull()

    if (parent) key(parent, 'ArrowRight')
    await flush()
    expect(document.activeElement).toBe(
      document.querySelector<HTMLElement>('[role="menuitemcheckbox"]'),
    )
    wrapper.unmount()
  })
})
