import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AgentWorkspace from '../components/AgentWorkspace.vue'
import { FakeAgentBridge } from '../testing/fake-agent-bridge'

describe('AgentWorkspace', () => {
  let wrapper: VueWrapper | undefined

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-24T00:00:00Z'))
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    vi.useRealTimers()
  })

  async function mountWorkspace(options: { providerConfigured?: boolean } = {}) {
    const bridge = new FakeAgentBridge({ stepDelayMs: 10, ...options })
    wrapper = mount(AgentWorkspace, {
      props: { bridge },
      attachTo: document.body,
    })
    await flushPromises()
    return { bridge, wrapper }
  }

  it('preserves a selected prompt while provider setup completes', async () => {
    const mounted = await mountWorkspace()
    const prompt = mounted.wrapper.find('.empty-state__prompts button')
    await prompt.trigger('click')
    const textarea = mounted.wrapper.get('textarea')
    const selectedPrompt = (textarea.element as HTMLTextAreaElement).value

    await textarea.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(document.querySelector('.settings-dialog')).not.toBeNull()
    expect((textarea.element as HTMLTextAreaElement).value).toBe(selectedPrompt)

    const inputs = [...document.querySelectorAll<HTMLInputElement>('.settings-dialog input')]
    inputs[0]!.value = 'https://api.302.ai/v1'
    inputs[0]!.dispatchEvent(new Event('input', { bubbles: true }))
    inputs[1]!.value = 'temporary-test-key'
    inputs[1]!.dispatchEvent(new Event('input', { bubbles: true }))
    inputs[2]!.value = 'fast-sota-model'
    inputs[2]!.dispatchEvent(new Event('input', { bubbles: true }))
    document.querySelector<HTMLFormElement>('.settings-dialog form')!.requestSubmit()
    await vi.advanceTimersByTimeAsync(10)
    await flushPromises()

    expect(document.querySelectorAll('.settings-dialog__stages li')).toHaveLength(3)
    document
      .querySelector<HTMLButtonElement>('.settings-dialog > header .icon-button')!
      .click()
    await flushPromises()
    expect(document.querySelector('.settings-dialog')).toBeNull()
    expect((textarea.element as HTMLTextAreaElement).value).toBe(selectedPrompt)

    await textarea.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(mounted.wrapper.find('.message--user').text()).toContain(selectedPrompt)
    expect((textarea.element as HTMLTextAreaElement).value).toBe('')
  })

  it('refreshes the Provider catalog and selects a discovered model', async () => {
    const mounted = await mountWorkspace()
    await mounted.wrapper.get('button[aria-label="Provider settings"]').trigger('click')
    const dialog = document.querySelector<HTMLElement>('.settings-dialog')!
    const inputs = dialog.querySelectorAll<HTMLInputElement>('input')
    inputs[1]!.value = 'temporary-test-key'
    inputs[1]!.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    dialog.querySelector<HTMLButtonElement>('.settings-dialog__refresh')!.click()
    await flushPromises()

    const options = dialog.querySelectorAll<HTMLOptionElement>('select option')
    expect([...options].map((option) => option.value)).toEqual([
      'gemini-3.7-flash-high',
      'gpt-5.6-luna',
    ])
    expect(dialog.querySelector<HTMLSelectElement>('select')!.value).toBe(
      'gemini-3.7-flash-high',
    )
  })

  it('does not submit on Shift+Enter and retains a pending draft when stopping', async () => {
    const mounted = await mountWorkspace({ providerConfigured: true })
    const textarea = mounted.wrapper.get('textarea')
    await textarea.setValue('Analyze RSI')
    await textarea.trigger('keydown', { key: 'Enter', shiftKey: true })
    expect(mounted.wrapper.findAll('.message--user')).toHaveLength(0)

    await textarea.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(mounted.wrapper.find('.composer__primary--stop').exists()).toBe(true)

    await textarea.setValue('Keep this follow-up draft')
    await mounted.wrapper.get('.composer__primary--stop').trigger('click')
    await flushPromises()

    expect(mounted.wrapper.get('.run-summary').attributes('data-status')).toBe('cancelled')
    expect((textarea.element as HTMLTextAreaElement).value).toBe('Keep this follow-up draft')
  })

  it('renders a keyboard-focused structured confirmation and rejection state', async () => {
    const mounted = await mountWorkspace({ providerConfigured: true })
    const textarea = mounted.wrapper.get('textarea')
    await textarea.setValue('Clear all drawings')
    await textarea.trigger('keydown', { key: 'Enter' })
    await vi.advanceTimersByTimeAsync(40)
    await flushPromises()

    const confirmation = mounted.wrapper.get('.confirmation')
    expect(confirmation.attributes('data-status')).toBe('pending')
    expect(confirmation.text()).toContain('Clear all drawings?')
    expect(document.activeElement?.textContent).toContain('Reject')

    await confirmation.get('.confirmation__reject').trigger('click')
    await flushPromises()
    expect(mounted.wrapper.get('.confirmation').attributes('data-status')).toBe('rejected')
    expect(mounted.wrapper.get('.tool-card').attributes('data-status')).toBe('rejected')
  })

  it('shows recoverable failure, retries, and applies read-only mode to later runs', async () => {
    const mounted = await mountWorkspace({ providerConfigured: true })
    const textarea = mounted.wrapper.get('textarea')
    await textarea.setValue('Trigger provider error')
    await textarea.trigger('keydown', { key: 'Enter' })
    await vi.advanceTimersByTimeAsync(50)
    await flushPromises()

    expect(mounted.wrapper.get('.error-notice').text()).toContain('Retry')
    await mounted.wrapper.get('.error-notice button').trigger('click')
    await flushPromises()
    expect(mounted.wrapper.findAll('.message--user')).toHaveLength(2)

    await mounted.wrapper.get('.composer__primary--stop').trigger('click')
    await mounted.wrapper.get('.context-bar__toggle input').setValue(true)
    await textarea.setValue('Add EMA 20')
    await textarea.trigger('keydown', { key: 'Enter' })
    await vi.advanceTimersByTimeAsync(40)
    await flushPromises()

    const latestTool = mounted.wrapper.findAll('.tool-card').at(-1)!
    expect(latestTool.text()).toContain('Query RSI(14)')
    expect(latestTool.text()).toContain('Not reversible')
  })
})
