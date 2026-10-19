// @vitest-environment jsdom
/** DOM Legend 的高频差量更新、操作身份与生命周期测试。 */
import eye from '@iconify-icons/tabler/eye'
import eyeOff from '@iconify-icons/tabler/eye-off'
import { describe, expect, it, vi } from 'vitest'
import { projectLegendActions } from '@/engine/legend/impl/projectLegendActions.js'
import {
  LEGEND_TEXT_LINE_HEIGHT,
  LEGEND_UI_EVENT,
  type LegendAction,
  type LegendRow,
  type LegendUiRequest,
} from '@/engine/legend/types.js'
import { createLegendDomRenderer } from '../impl/createLegendDomRenderer.js'

/** 构造真实 DOM 与固定展示行，其余用例只声明差异。 */
function createHarness(hasSelectedSymbol: () => boolean = () => true) {
  const host = document.createElement('div')
  const execute = vi.fn<(id: string, action: LegendAction) => LegendUiRequest | null>(() => null)
  const renderer = createLegendDomRenderer(host, hasSelectedSymbol, execute)
  const row: LegendRow = {
    key: 'main:MA',
    paneId: 'main',
    x: 12,
    y: 16,
    maxWidth: 780,
    height: 18,
    gap: 10,
    indicator: { instanceId: 'main:MA', definitionId: 'MA' },
    actions: projectLegendActions(
      {
        id: 'main:MA',
        kind: 'indicator',
        paneId: 'main',
        definitionId: 'MA',
        params: {},
        hidden: false,
      },
      ['main'],
      () => false,
    ),
    texts: [
      { text: 'MA', color: 'red' },
      { text: '(5)', color: 'gray' },
      { text: 'MA5 100.000', color: 'blue' },
    ],
  }
  return { host, renderer, row, execute }
}

describe('DOM Legend renderer', () => {
  it('错误横幅直接显示诊断，恢复后清除且保留图例节点和操作', () => {
    const { host, renderer, row } = createHarness()
    renderer.update('main', [{ ...row, error: 'invalid plot' }], ['main'])
    const element = host.querySelector('.klc-legend-row')
    const banner = host.querySelector<HTMLDivElement>('.klc-legend-error-banner')!
    expect(banner.textContent).toBe('invalid plot')
    expect(banner.hidden).toBe(false)
    expect(banner.closest('.klc-legend-text')).not.toBeNull()
    renderer.update('main', [row], ['main'])
    expect(host.querySelector('.klc-legend-row')).toBe(element)
    expect(host.querySelector('.klc-legend-error-banner')).toBeNull()
    expect(host.querySelectorAll('.klc-legend-actions button')).toHaveLength(row.actions.length)
    renderer.dispose()
  })
  it('比较名称复用悬浮框，仅提供隐藏和删除按钮，并保留隐藏行供恢复', () => {
    const { host, renderer, row, execute } = createHarness()
    const comparison = {
      ...row,
      key: 'comparison:A',
      indicator: undefined,
      comparison: { identity: 'id:A' },
      actions: projectLegendActions(
        {
          id: 'comparison:A',
          kind: 'comparison',
          paneId: 'main',
          identity: 'id:A',
          spec: { symbol: 'A', market: 'CN' },
          hidden: false,
        },
        ['main'],
        () => false,
      ),
      texts: [{ text: '比较商品 A', color: 'blue' }],
    }
    renderer.update('main', [comparison], ['main'])
    const element = host.querySelector<HTMLElement>('[data-comparison]')!
    const buttons = element.querySelectorAll<HTMLButtonElement>('button')
    expect(buttons).toHaveLength(2)
    expect(element.querySelector('.klc-legend-frame')).not.toBeNull()
    expect(buttons[0]!.disabled).toBe(false)
    expect(buttons[0]!.title).toBe('隐藏比较品种')
    buttons[0]!.click()
    expect(execute).toHaveBeenNthCalledWith(1, comparison.key, 'toggle-visibility')
    renderer.update(
      'main',
      [
        {
          ...comparison,
          hidden: true,
          actions: comparison.actions.map((action) =>
            action.action === 'toggle-visibility' ? { ...action, label: '显示比较品种' } : action,
          ),
        },
      ],
      ['main'],
    )
    expect(element.hasAttribute('data-hidden')).toBe(true)
    expect(buttons[0]!.title).toBe('显示比较品种')
    buttons[0]!.click()
    expect(execute).toHaveBeenNthCalledWith(2, comparison.key, 'toggle-visibility')
    buttons[1]!.click()
    expect(execute).toHaveBeenNthCalledWith(3, comparison.key, 'close')
    renderer.update('main', [], ['main'])
    expect(host.querySelector('[data-comparison]')).toBeNull()
    renderer.dispose()
  })
  it('未选品种时隐藏按钮，选中后显示，收起后清除品种仍隐藏', () => {
    let selected = false
    const { host, renderer, row } = createHarness(() => selected)
    document.body.append(host)
    const button = host.querySelector<HTMLButtonElement>('.klc-legend-collapse')!
    renderer.update('main', [row], ['main'])
    expect(button.hidden).toBe(true)
    expect(getComputedStyle(button).display).toBe('none')

    selected = true
    renderer.update('main', [row], ['main'])
    expect(button.hidden).toBe(false)
    expect(getComputedStyle(button).display).toBe('flex')
    button.click()
    // 收起主图行不改变按钮自身的可见性，它只由品种选择与指标行数决定。
    expect(button.hidden).toBe(false)

    selected = false
    renderer.update('main', [row], ['main'])
    expect(button.hidden).toBe(true)
    expect(getComputedStyle(button).display).toBe('none')
    renderer.dispose()
    host.remove()
  })

  it('相同帧不写 DOM，数值更新复用 Text 节点且不读取布局', () => {
    const { host, renderer, row } = createHarness()
    const geometry = vi.spyOn(host, 'getBoundingClientRect')
    renderer.update('main', [row], ['main'])
    const element = host.querySelector('.klc-legend-row')
    const value = host.querySelectorAll('.klc-legend-text > span')[1]!.firstChild
    const observer = new MutationObserver(() => {})
    observer.observe(host, {
      subtree: true,
      attributes: true,
      characterData: true,
      childList: true,
    })

    renderer.update('main', [{ ...row }], ['main'])
    expect(observer.takeRecords()).toEqual([])
    renderer.update(
      'main',
      [{ ...row, texts: [...row.texts.slice(0, 2), { text: 'MA5 101.000', color: 'blue' }] }],
      ['main'],
    )
    expect(host.querySelector('.klc-legend-row')).toBe(element)
    expect(host.querySelectorAll('.klc-legend-text > span')[1]!.firstChild).toBe(value)
    expect(value?.textContent).toBe('MA5 101.000')
    expect(observer.takeRecords().map((record) => record.type)).toEqual(['characterData'])
    expect(geometry).not.toHaveBeenCalled()
    observer.disconnect()
    renderer.dispose()
  })

  it.each([
    {
      label: '主图指标',
      legendKey: 'main:MA',
      paneId: 'main',
      definitionId: 'MA',
      paneOrder: ['main'],
      titles: ['指标设置', '更换指标', '隐藏指标', '关闭指标'],
      disabled: [false, false, false, false],
      clicks: [0, 1, 2, 3],
      calls: [
        ['main:MA', 'settings'],
        ['main:MA', 'replace'],
        ['main:MA', 'toggle-visibility'],
        ['main:MA', 'close'],
      ],
      reorder: null,
    },
    {
      label: '副图指标',
      legendKey: 'sub_A',
      paneId: 'sub_A',
      definitionId: 'RSI',
      paneOrder: ['main', 'sub_A', 'sub_B'],
      titles: ['上移指标', '下移指标', '指标设置', '更换指标', '隐藏指标', '关闭指标'],
      disabled: [true, false, false, false, false, false],
      clicks: [1],
      calls: [['sub_A', 'move-down']],
      reorder: {
        paneOrder: ['main', 'sub_B', 'sub_A'],
        disabled: [false, true, false, false, false, false],
      },
    },
  ])(
    '$label 按 Pane 角色和顺序投影操作按钮',
    ({ legendKey, paneId, definitionId, paneOrder, titles, disabled, clicks, calls, reorder }) => {
      const { host, renderer, row, execute } = createHarness()
      const rowFor = (order: readonly string[]): LegendRow => ({
        ...row,
        key: legendKey,
        paneId,
        indicator: { instanceId: legendKey, definitionId },
        actions: projectLegendActions(
          { id: legendKey, kind: 'indicator', paneId, definitionId, params: {}, hidden: false },
          order,
          () => false,
        ),
      })

      renderer.update(paneId, [rowFor(paneOrder)], paneOrder)
      const buttons = [
        ...host.querySelectorAll<HTMLButtonElement>('.klc-legend-row')[0]!.querySelectorAll('button'),
      ]
      expect(buttons.map((button) => button.title)).toEqual(titles)
      expect(buttons.map((button) => button.disabled)).toEqual(disabled)
      for (const index of clicks) buttons[index]!.click()
      expect(execute.mock.calls).toEqual(calls)

      if (reorder) {
        renderer.update(paneId, [rowFor(reorder.paneOrder)], reorder.paneOrder)
        expect(buttons.map((button) => button.disabled)).toEqual(reorder.disabled)
      }
      renderer.dispose()
    },
  )

  it('行盒高于文本行高时向上补偿，文本顶部仍落在行坐标上', () => {
    const { host, renderer, row } = createHarness()
    const tall = { ...row, height: 24 }
    renderer.update('main', [tall], ['main'])
    const element = host.querySelector<HTMLElement>('.klc-legend-row')!
    expect(Number.parseFloat(element.style.top)).toBe(
      tall.y - (tall.height - LEGEND_TEXT_LINE_HEIGHT) / 2,
    )
    renderer.dispose()
  })

  it('收起按钮收起全部主图行，展开后回到末行下方并跟随行数更新数量', () => {
    const { host, renderer, row } = createHarness()
    const button = host.querySelector<HTMLButtonElement>('.klc-legend-collapse')!
    const count = host.querySelector<HTMLElement>('.klc-legend-collapse-count')!
    const second = {
      ...row,
      key: 'main:BOLL',
      y: 40,
      indicator: { instanceId: 'main:BOLL', definitionId: 'BOLL' },
    }
    expect(button.hidden).toBe(true)

    renderer.update('main', [row, second], ['main'])
    const rows = host.querySelectorAll<HTMLElement>('.klc-legend-row')
    const buttonTop = () => Number.parseFloat(button.style.top)
    expect(button.hidden).toBe(false)
    // 展开态：按钮位于末行下方，不显示指标数量。
    expect(buttonTop()).toBeGreaterThan(second.y + second.height)
    expect(button.style.left).toBe(`${row.x}px`)
    expect(button.title).toBe('收起指标')
    expect(count.hidden).toBe(true)
    expect([...rows].every((element) => element.style.display === '')).toBe(true)

    button.click()
    // 收起态：全部主图行隐藏，按钮移动到首行位置，图标右侧显示指标数量。
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(button.title).toBe('展开指标')
    expect([...rows].every((element) => element.style.display === 'none')).toBe(true)
    expect(buttonTop()).toBe(row.y)
    expect(count.hidden).toBe(false)
    expect(count.textContent).toBe('2')

    button.click()
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect([...rows].every((element) => element.style.display === '')).toBe(true)
    expect(buttonTop()).toBeGreaterThan(second.y + second.height)
    expect(count.hidden).toBe(true)

    // 收起态再发布行时数量跟随启用指标数变化，新行保持隐藏。
    button.click()
    const third = {
      ...second,
      key: 'main:EXPMA',
      y: 64,
      indicator: { instanceId: 'main:EXPMA', definitionId: 'EXPMA' },
    }
    renderer.update('main', [row, second, third], ['main'])
    expect(count.textContent).toBe('3')
    expect(host.querySelector<HTMLElement>('[data-indicator]')!.style.display).toBe('none')
    renderer.dispose()
  })

  it('收起期间保持隐藏，clear 复位为展开且按钮隐藏', () => {
    const { host, renderer, row } = createHarness()
    const button = host.querySelector<HTMLButtonElement>('.klc-legend-collapse')!
    renderer.update('main', [row], ['main'])
    button.click()
    expect(host.querySelector<HTMLElement>('.klc-legend-row')!.style.display).toBe('none')

    renderer.clear()
    expect(button.hidden).toBe(true)

    // clear 后再发布的行保持可见且展开态。
    renderer.update('main', [row], ['main'])
    expect(button.hidden).toBe(false)
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(host.querySelector<HTMLElement>('.klc-legend-row')!.style.display).toBe('')

    // 只有非指标行时按钮隐藏。
    renderer.update('main', [{ ...row, indicator: undefined }], ['main'])
    expect(button.hidden).toBe(true)

    // 副图更新不影响主图按钮。
    renderer.update('main', [row], ['main'])
    renderer.update('sub_RSI', [{ ...row, paneId: 'sub_RSI' }], ['main', 'sub_RSI'])
    expect(button.hidden).toBe(false)
    renderer.dispose()
  })

  it('隐藏状态标记在行上并切换可见性按钮语义', () => {
    const { host, renderer, row } = createHarness()
    // jsdom 会把自闭合标签序列化为显式闭合，比较前统一形态。
    const icon = (button: HTMLButtonElement) =>
      button
        .querySelector('svg')!
        .innerHTML.replace(/<\/path>/g, '/>')
        .replace(/>\/>/g, '/>')
    renderer.update('main', [row], ['main'])
    const element = host.querySelector<HTMLElement>('.klc-legend-row')!
    expect(element.hasAttribute('data-hidden')).toBe(false)
    const toggle = element.querySelectorAll<HTMLButtonElement>('button')[2]!
    expect(toggle.title).toBe('隐藏指标')
    expect(icon(toggle)).toBe(eye.body)

    renderer.update(
      'main',
      [
        {
          ...row,
          hidden: true,
          actions: row.actions.map((action) =>
            action.action === 'toggle-visibility' ? { ...action, label: '显示指标' } : action,
          ),
        },
      ],
      ['main'],
    )
    expect(element.hasAttribute('data-hidden')).toBe(true)
    expect(toggle.title).toBe('显示指标')
    expect(toggle.getAttribute('aria-label')).toBe('显示指标')
    expect(icon(toggle)).toBe(eyeOff.body)

    renderer.update('main', [{ ...row, hidden: false }], ['main'])
    expect(element.hasAttribute('data-hidden')).toBe(false)
    expect(toggle.title).toBe('隐藏指标')
    expect(icon(toggle)).toBe(eye.body)
    renderer.dispose()
  })

  it('行清理、Pane 移除、clear 和销毁都会释放标题节点', () => {
    const { host, renderer, row } = createHarness()
    renderer.update('sub_RSI', [{ ...row, paneId: 'sub_RSI' }], ['main', 'sub_RSI'])
    renderer.update('main', [row], ['main', 'sub_RSI'])
    expect(host.querySelectorAll('.klc-legend-row')).toHaveLength(2)

    // Pane 被移出顺序时连同其行一起释放。
    renderer.update('main', [row], ['main'])
    expect(host.querySelectorAll('.klc-legend-row')).toHaveLength(1)
    renderer.update('main', [], ['main'])
    expect(host.querySelectorAll('.klc-legend-row')).toHaveLength(0)

    renderer.update('main', [row], ['main'])
    renderer.clear()
    expect(host.querySelectorAll('.klc-legend-row')).toHaveLength(0)
    renderer.dispose()
    expect(host.childElementCount).toBe(0)
  })
})
