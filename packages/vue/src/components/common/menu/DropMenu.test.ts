/** Menu interactions through the real trigger and teleported surface. */
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import DropMenu from './DropMenu.vue'
import type { DropMenuGroup } from './dropMenuTypes.js'

enableAutoUnmount(afterEach)

const groups: ReadonlyArray<DropMenuGroup> = [{
  id: 'actions',
  label: 'Actions',
  items: [
    { id: 'selected', label: 'Selected', selection: 'radio', checked: true },
    { id: 'disabled', label: 'Disabled', disabled: true },
    { id: 'switch', label: 'Switch', selection: 'checkbox', checked: false },
    { id: 'more', label: 'More', children: [{ id: 'copy', label: 'Copy', shortcut: 'Ctrl+C' }] },
  ],
}]

function mountMenu() {
  const wrapper = mount(DropMenu, { attachTo: document.body, props: { label: 'Actions', groups } })
  return { wrapper, trigger: wrapper.get('button').element }
}

function item(label: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button[role^="menuitem"]'))
    .find((button) => button.textContent?.trim().startsWith(label))
  if (!button) throw new Error(`Missing menu item ${label}`)
  return button
}

function key(target: Element, value: string): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }))
}

it('opens compact by default and moves keyboard focus to the selected item', async () => {
  const { wrapper, trigger } = mountMenu()
  trigger.click()
  await vi.waitFor(() => expect(document.activeElement).toBe(item('Selected')))
  expect(document.querySelector('[role="menu"]')?.classList.contains('drop-menu__panel--compact')).toBe(true)
  key(item('Selected'), 'ArrowDown')
  expect(document.activeElement).toBe(item('Switch'))
  key(item('Switch'), 'End')
  expect(document.activeElement).toBe(item('More'))
  key(item('More'), 's')
  expect(document.activeElement).toBe(item('Selected'))
  item('Selected').click()
  await nextTick()
  expect(wrapper.emitted('select')).toEqual([['actions', 'selected']])
  expect(trigger.getAttribute('aria-expanded')).toBe('false')
  expect(document.activeElement).toBe(trigger)
})

it('keeps pointer focus on the trigger and toggles without reopening', async () => {
  const { trigger } = mountMenu()
  function pointerClick(): void {
    trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    trigger.dispatchEvent(new MouseEvent('click', { detail: 1, bubbles: true }))
  }
  trigger.focus()
  pointerClick()
  await vi.waitFor(() => expect(item('Selected').tabIndex).toBe(0))
  expect(document.activeElement).toBe(trigger)
  pointerClick()
  await nextTick()
  expect(trigger.getAttribute('aria-expanded')).toBe('false')
  trigger.click()
  await vi.waitFor(() => expect(document.activeElement).toBe(item('Selected')))
})

it('keeps checkboxes open and navigates into and out of submenus', async () => {
  const { wrapper, trigger } = mountMenu()
  key(trigger, 'ArrowDown')
  await vi.waitFor(() => expect(document.activeElement).toBe(item('Selected')))
  item('Switch').click()
  expect(wrapper.emitted('select')).toEqual([['actions', 'switch']])
  expect(trigger.getAttribute('aria-expanded')).toBe('true')
  item('More').focus()
  key(item('More'), 'ArrowRight')
  await vi.waitFor(() => expect(document.activeElement).toBe(item('Copy')))
  expect(item('Copy').textContent).toContain('Ctrl+C')
  key(item('Copy'), 'Escape')
  expect(document.activeElement).toBe(item('More'))
  key(item('More'), 'ArrowRight')
  await vi.waitFor(() => expect(document.activeElement).toBe(item('Copy')))
  item('Copy').click()
  expect(wrapper.emitted('select')?.at(-1)).toEqual(['actions', 'copy', 'more'])
  expect(document.activeElement).toBe(trigger)
})

it('closes the previous root menu when another trigger opens', async () => {
  const first = mountMenu()
  const second = mountMenu()
  first.trigger.click()
  await vi.waitFor(() => expect(first.trigger.getAttribute('aria-expanded')).toBe('true'))
  second.trigger.click()
  await vi.waitFor(() => expect(first.trigger.getAttribute('aria-expanded')).toBe('false'))
  expect(second.trigger.getAttribute('aria-expanded')).toBe('true')
})
