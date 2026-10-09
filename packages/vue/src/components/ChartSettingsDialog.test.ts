// ADR 0006：设置对话框没有草稿，与 Agent 共用 settingsCommands；Agent 在对话框打开时的写入不会被覆盖。
import { getRegisteredChartTools } from '@363045841yyt/klinechart-core/controllers'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { createMockChartController } from '../__tests__/_mockController.js'
import ChartSettingsDialog from './ChartSettingsDialog.vue'

const toolContext = { signal: new AbortController().signal, progress: () => {} }

async function agentCall(
  controller: ReturnType<typeof createMockChartController>,
  name: string,
  input: unknown,
) {
  const tool = getRegisteredChartTools().find((candidate) => candidate.config.name === name)
  if (!tool) throw new Error(`missing tool ${name}`)
  // Agent runtime 按方法身份在 toolHosts 中解析目标；这里直接以 settingsCommands 为宿主。
  expect(tool.owns(controller.settingsCommands)).toBe(true)
  return tool.execute(controller.settingsCommands, input, toolContext)
}

function switchFor(key: string): HTMLInputElement {
  const row = document.querySelector(`[data-setting-key="${key}"]`)
  const control = row?.querySelector<HTMLInputElement>('input[type="checkbox"]')
  if (!control) throw new Error(`no switch for ${key}`)
  return control
}

async function openSection(label: string) {
  const tab = [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find(
    (candidate) => candidate.textContent?.trim() === label,
  )
  if (!tab) throw new Error(`no tab ${label}`)
  tab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))
  tab.click()
  await nextTick()
  await flushPromises()
}

function mountDialog(controller: ReturnType<typeof createMockChartController>) {
  return mount(ChartSettingsDialog, {
    attachTo: document.body,
    props: { show: true, controller, initialSection: 'chart' },
  })
}

describe('ChartSettingsDialog (ADR 0006 instant apply)', () => {
  let wrapper: ReturnType<typeof mountDialog> | null = null
  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
  })

  it('has no 重置 / 取消 / 确定 footer and uses a vertical section nav', async () => {
    const controller = createMockChartController()
    controller.updateSettingsFacade({ showGridLines: true })
    wrapper = mountDialog(controller)
    await flushPromises()
    const buttons = [...document.querySelectorAll('button')].map((b) => b.textContent?.trim())
    expect(buttons).not.toContain('确定')
    expect(buttons).not.toContain('取消')
    expect(buttons).not.toContain('重置')
    const tablist = document.querySelector('[role="tablist"]')
    expect(tablist?.getAttribute('aria-orientation')).toBe('vertical')
    expect(
      [...document.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent?.trim()),
    ).toEqual(['外观', '图表', '数据', '快捷键', '高级', '关于'])
  })

  it('every control writes through settingsCommands immediately', async () => {
    const controller = createMockChartController()
    controller.updateSettingsFacade({ showGridLines: true })
    wrapper = mountDialog(controller)
    await flushPromises()
    switchFor('showGridLines').click()
    await nextTick()
    expect(controller.settings.peek().showGridLines).toBe(false)
  })

  it('reflects an Agent write while open, and a later UI edit does not overwrite it', async () => {
    const controller = createMockChartController()
    controller.updateSettingsFacade({ showGridLines: true, showLastPriceCountdown: true })
    wrapper = mountDialog(controller)
    await flushPromises()
    expect(switchFor('showLastPriceCountdown').checked).toBe(true)

    // Agent 在对话框打开时修改设置：对话框立即反映。
    await agentCall(controller, 'settings_update', { values: { showLastPriceCountdown: false } })
    await nextTick()
    expect(switchFor('showLastPriceCountdown').checked).toBe(false)

    // 用户随后改另一项：Agent 的写入保留，不存在被旧草稿覆盖的路径。
    switchFor('showGridLines').click()
    await nextTick()
    expect(controller.settings.peek().showGridLines).toBe(false)
    expect(controller.settings.peek().showLastPriceCountdown).toBe(false)

    // 关闭对话框（× / Esc 的唯一出口）也不会写入任何东西。
    const before = controller.settings.peek()
    await wrapper.setProps({ show: false })
    await flushPromises()
    expect(controller.settings.peek()).toBe(before)
  })

  it('restores a section to defaults and offers Undo', async () => {
    const controller = createMockChartController()
    controller.updateSettingsFacade({ showGridLines: false, theme: 'light' })
    wrapper = mountDialog(controller)
    await flushPromises()
    const restore = document.querySelector<HTMLButtonElement>('[data-restore="chart"]')
    expect(restore?.disabled).toBe(false)
    restore?.click()
    await nextTick()
    expect(controller.settings.peek().showGridLines).toBe(true)
    // 其它分区的设置不受影响。
    expect(controller.settings.peek().theme).toBe('light')

    const status = document.querySelector('[role="status"]')
    expect(status?.textContent).toContain('已恢复“图表”默认设置')
    const undo = [...(status?.querySelectorAll('button') ?? [])].find(
      (button) => button.textContent?.trim() === '撤销',
    )
    undo?.click()
    await nextTick()
    expect(controller.settings.peek().showGridLines).toBe(false)
  })

  it('edits custom colours inline instead of a nested modal', async () => {
    const controller = createMockChartController()
    wrapper = mount(ChartSettingsDialog, {
      attachTo: document.body,
      props: { show: true, controller, initialSection: 'appearance' },
    })
    await flushPromises()
    expect(document.querySelectorAll('dialog').length).toBe(1)
    const expander = [...document.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('自定义颜色'),
    )
    expect(expander?.getAttribute('aria-expanded')).toBe('false')
    expander?.click()
    await nextTick()
    expect(expander?.getAttribute('aria-expanded')).toBe('true')
    expect(document.querySelectorAll('dialog').length).toBe(1)
    await openSection('图表')
  })
})
