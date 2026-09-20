import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AgentWorkspace from '../components/AgentWorkspace.vue'
import { FakeAgentBridge } from '../testing/fake-agent-bridge'
import { stubProviderModelCatalog } from './_agentProviderFixtures'

/**
 * happy-dom 未实现 Popover API 的开关与分层。
 * 这里补齐 popover 状态属性与事件，使组件走真实的 showPopover/hidePopover 路径。
 */
function installPopoverApi(): void {
  HTMLElement.prototype.showPopover = function (this: HTMLElement) {
    if (this.hasAttribute('popover') === false) return
    this.setAttribute('popover-open', '')
    this.dispatchEvent(new Event('toggle', { bubbles: false }))
  }
  HTMLElement.prototype.hidePopover = function (this: HTMLElement) {
    if (!this.hasAttribute('popover-open')) return
    this.removeAttribute('popover-open')
    this.dispatchEvent(new Event('toggle', { bubbles: false }))
  }
}

describe('AgentWorkspace', () => {
  let wrapper: VueWrapper | undefined

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-24T00:00:00Z'))
    installPopoverApi()
    stubProviderModelCatalog()
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    vi.useRealTimers()
    vi.unstubAllGlobals()
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

  /** 通过“新建 Provider 配置”弹窗创建并激活一个 Profile。 */
  async function createProfile(name: string): Promise<void> {
    document.querySelector<HTMLButtonElement>('.provider-profile-new-button')!.click()
    await flushPromises()
    const nameInput = document.querySelector<HTMLInputElement>(
      '#agent-provider-profile-form input',
    )!
    nameInput.value = name
    nameInput.dispatchEvent(new Event('input', { bubbles: true }))
    document.querySelector<HTMLFormElement>('#agent-provider-profile-form')!.requestSubmit()
    await flushPromises()
  }

  /** 填写 Provider 连接字段并 blur，触发草稿自动持久化。 */
  async function fillConnection(baseUrl: string, apiKey: string): Promise<void> {
    const inputs = [...document.querySelectorAll<HTMLInputElement>('.provider-form input')]
    inputs[0]!.value = baseUrl
    inputs[0]!.dispatchEvent(new Event('input', { bubbles: true }))
    inputs[1]!.value = apiKey
    inputs[1]!.dispatchEvent(new Event('input', { bubbles: true }))
    inputs[1]!.dispatchEvent(new Event('blur'))
    await flushPromises()
  }

  it('preserves a selected prompt while provider setup completes', async () => {
    const mounted = await mountWorkspace()
    const prompt = mounted.wrapper.find('.empty-state__prompts button')
    await prompt.trigger('click')
    const textarea = mounted.wrapper.get('textarea')
    const selectedPrompt = (textarea.element as HTMLTextAreaElement).value

    await textarea.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(document.querySelector('.base-modal')).not.toBeNull()
    expect((textarea.element as HTMLTextAreaElement).value).toBe(selectedPrompt)

    await createProfile('Fake Provider')
    await fillConnection('https://models.example.test/v1', 'temporary-test-key')
    const catalog = await mounted.bridge.listProviderModelCatalog()
    for (const model of catalog.models) await mounted.bridge.addProviderModelPoolModel(model)

    document.querySelector<HTMLButtonElement>('.base-close-btn')!.click()
    await flushPromises()
    expect(document.querySelector('.base-modal')?.classList.contains('base-modal--closing')).toBe(
      true,
    )
    expect((textarea.element as HTMLTextAreaElement).value).toBe(selectedPrompt)

    const modelTrigger = mounted.wrapper.get('.composer__model .dropdown__trigger')
    await modelTrigger.trigger('click')
    await flushPromises()
    await document.querySelector<HTMLButtonElement>('.dropdown__option')!.click()
    await flushPromises()

    await textarea.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(mounted.wrapper.find('.message--user').text()).toContain(selectedPrompt)
    expect((textarea.element as HTMLTextAreaElement).value).toBe('')
  })

  it('selects models from the Composer dropdown', async () => {
    const mounted = await mountWorkspace()
    await mounted.wrapper.get('button[aria-label="Model settings"]').trigger('click')
    await flushPromises()

    await createProfile('Fake Provider')
    await fillConnection('https://models.example.test/v1', 'temporary-test-key')
    const catalog = await mounted.bridge.listProviderModelCatalog()
    for (const model of catalog.models) await mounted.bridge.addProviderModelPoolModel(model)

    document.querySelector<HTMLButtonElement>('.base-close-btn')!.click()
    await flushPromises()

    await mounted.wrapper.get('.composer__model .dropdown__trigger').trigger('click')
    await flushPromises()
    expect(
      [...document.querySelectorAll<HTMLButtonElement>('.dropdown__option')].map(
        (option) => option.textContent,
      ),
    ).toEqual(['Provider Model A', 'Provider Model B'])

    await document.querySelectorAll<HTMLButtonElement>('.dropdown__option')[1]!.click()
    await flushPromises()
    expect(mounted.wrapper.get('.composer__model .dropdown__value').text()).toBe('Provider Model B')
  })

  it('switches the interface language from the settings dialog', async () => {
    const mounted = await mountWorkspace()
    document.querySelector<HTMLButtonElement>('button[aria-label="Model settings"]')!.click()
    await flushPromises()

    const interfaceTab = [...document.querySelectorAll<HTMLButtonElement>('.base-tabs__tab')].find(
      (tab) => tab.textContent?.trim() === 'Interface',
    )!
    interfaceTab.click()
    await flushPromises()

    document
      .querySelector<HTMLButtonElement>('.agent-settings-interface .dropdown__trigger')!
      .click()
    await flushPromises()
    const chinese = [...document.querySelectorAll<HTMLButtonElement>('.dropdown__option')].find(
      (option) => option.textContent?.includes('简体中文'),
    )!
    chinese.click()
    await flushPromises()

    expect(document.querySelector('.base-title')?.textContent).toBe('模型设置')
    expect(mounted.wrapper.find('button[aria-label="模型设置"]').attributes('title')).toBe(
      '模型设置',
    )
  })

  it('renders the interface group first with the collapse-reasoning option', async () => {
    const mounted = await mountWorkspace()
    document.querySelector<HTMLButtonElement>('button[aria-label="Model settings"]')!.click()
    await flushPromises()

    const tabs = [...document.querySelectorAll<HTMLButtonElement>('.base-tabs__tab')]
    expect(tabs.map((tab) => tab.textContent?.trim())).toEqual([
      'Interface',
      'Provider settings',
      'Tools',
    ])

    tabs[0]!.click()
    await flushPromises()
    const interfacePanel = document.querySelector('.agent-settings-interface')!
    expect(interfacePanel.textContent).toContain('Collapse reasoning')
    const toggle = interfacePanel.querySelector<HTMLInputElement>(
      'input[aria-label="Collapse reasoning"]',
    )!
    expect(toggle.checked).toBe(false)
    toggle.click()
    await flushPromises()
    expect(toggle.checked).toBe(true)
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

    expect(mounted.wrapper.find('.composer__primary--stop').exists()).toBe(false)
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
