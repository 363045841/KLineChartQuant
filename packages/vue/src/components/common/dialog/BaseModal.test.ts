/** Native modal lifecycle, dismissal policies, and focus and drag boundaries. */
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import { h } from 'vue'
import BaseModal from './BaseModal.vue'

enableAutoUnmount(afterEach)
afterEach(() => vi.restoreAllMocks())

function dialog(): HTMLDialogElement {
  const element = document.querySelector('dialog')
  if (!element) throw new Error('Missing dialog')
  return element
}

function pointer(target: Element, type: string, x = 0, y = 0, pointerId = 1): void {
  target.dispatchEvent(new PointerEvent(type, {
    bubbles: true, cancelable: true, button: 0, isPrimary: true, pointerId, clientX: x, clientY: y,
  }))
}

function clickBackdrop(element: HTMLDialogElement): void {
  pointer(element, 'pointerdown')
  element.click()
}

function mountDialog(overrides: Partial<InstanceType<typeof BaseModal>['$props']> = {}) {
  return mount(BaseModal, {
    attachTo: document.body,
    props: { open: true, title: 'Settings', ...overrides },
    slots: {
      'header-extra': () => h('button', { id: 'help' }, 'Help'),
      default: () => h('button', { id: 'done' }, 'Done'),
    },
  })
}

it('uses the native dialog, labels it, and leaves open state with the owner', async () => {
  const wrapper = mountDialog({ body: 'form' })
  await vi.waitFor(() => expect(dialog().open).toBe(true))
  const element = dialog()
  expect(document.getElementById(element.getAttribute('aria-labelledby') ?? '')?.textContent).toBe('Settings')
  expect(element.querySelector('.base-body--form')).not.toBeNull()
  const escape = new Event('cancel', { cancelable: true })
  element.dispatchEvent(escape)
  expect(escape.defaultPrevented).toBe(true)
  expect(wrapper.emitted('update:open')).toEqual([[false]])
  expect(element.open).toBe(true)
  await wrapper.setProps({ open: false })
  await vi.waitFor(() => expect(document.querySelector('dialog')).toBeNull())
})

it('locks all user dismissal paths without hiding header actions', async () => {
  const wrapper = mountDialog({ dismiss: 'locked' })
  await vi.waitFor(() => expect(dialog().open).toBe(true))
  const element = dialog()
  expect(element.querySelector('.base-close-btn')).toBeNull()
  expect(element.querySelector('#help')).not.toBeNull()
  element.dispatchEvent(new Event('cancel', { cancelable: true }))
  clickBackdrop(element)
  expect(wrapper.emitted('update:open')).toBeUndefined()
  expect(element.open).toBe(true)
  await wrapper.setProps({ dismiss: 'explicit' })
  clickBackdrop(element)
  expect(wrapper.emitted('update:open')).toBeUndefined()
  element.querySelector<HTMLButtonElement>('.base-close-btn')?.click()
  expect(wrapper.emitted('update:open')).toEqual([[false]])
})

it('ignores backdrop clicks that began inside the content', async () => {
  const wrapper = mountDialog()
  await vi.waitFor(() => expect(dialog().open).toBe(true))
  const element = dialog()
  const done = element.querySelector('#done')
  if (!done) throw new Error('Missing content action')
  pointer(element, 'pointerdown')
  pointer(done, 'pointerdown')
  element.click()
  expect(wrapper.emitted('update:open')).toBeUndefined()
  clickBackdrop(element)
  expect(wrapper.emitted('update:open')).toEqual([[false]])
})

it('wraps Tab in both directions and restores the opener after closing', async () => {
  const opener = document.createElement('button')
  document.body.append(opener)
  opener.focus()
  try {
    const wrapper = mountDialog()
    await vi.waitFor(() => expect(dialog().open).toBe(true))
    const first = dialog().querySelector<HTMLButtonElement>('#help')
    const last = dialog().querySelector<HTMLButtonElement>('#done')
    const tab = (shiftKey = false) => new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true })
    last?.focus()
    last?.dispatchEvent(tab())
    expect(document.activeElement).toBe(first)
    first?.dispatchEvent(tab(true))
    expect(document.activeElement).toBe(last)
    await wrapper.setProps({ open: false })
    await vi.waitFor(() => expect(document.activeElement).toBe(opener))
  } finally {
    opener.remove()
  }
})

it('uses the header for drag, ignores other pointers, and resets on reopen', async () => {
  const wrapper = mountDialog()
  await vi.waitFor(() => expect(dialog().open).toBe(true))
  const element = dialog()
  const header = element.querySelector<HTMLElement>('.base-header')
  if (!header) throw new Error('Missing header')
  const capture = vi.fn()
  Object.defineProperties(header, {
    setPointerCapture: { value: capture },
    hasPointerCapture: { value: () => true },
    releasePointerCapture: { value: vi.fn() },
  })
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 80, 300, 200))
  pointer(header, 'pointerdown', 150, 100)
  pointer(header, 'pointermove', 230, 145, 2)
  await vi.waitFor(() => expect(element.style.left).toBe('100px'))
  pointer(header, 'pointermove', 230, 145)
  await vi.waitFor(() => expect(element.style.left).toBe('180px'))
  expect(element.style.top).toBe('125px')
  expect(capture).toHaveBeenCalledWith(1)
  pointer(header, 'pointerup', 230, 145)
  await wrapper.setProps({ open: false })
  await wrapper.setProps({ open: true })
  await vi.waitFor(() => expect(dialog().open).toBe(true))
  expect(dialog().style.left).toBe('')
})
