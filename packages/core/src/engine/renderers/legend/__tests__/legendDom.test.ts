// @vitest-environment jsdom
/** DOM Legend 的高频差量更新、操作身份与生命周期测试。 */
import eye from '@iconify-icons/tabler/eye'
import eyeOff from '@iconify-icons/tabler/eye-off'
import { describe, expect, it, vi } from 'vitest'
import { projectLegendActions } from '@/engine/legend/impl/projectLegendActions.js'
import {
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
  it('脚本指标提供代码编辑按钮，普通指标不提供', () => {
    const entry = {
      id: 'main:Script',
      kind: 'indicator' as const,
      paneId: 'main',
      definitionId: 'Script',
      params: {},
      hidden: false,
    }
    const actions = (isScript: boolean) =>
      projectLegendActions(entry, ['main'], () => isScript).map((item) => item.action)
    expect(actions(true)).toContain('edit-code')
    expect(actions(false)).not.toContain('edit-code')
  })

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
    const value = host.querySelectorAll('.klc-legend-text > span')[2]!.firstChild
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
    expect(host.querySelectorAll('.klc-legend-text > span')[2]!.firstChild).toBe(value)
    expect(value?.textContent).toBe('MA5 101.000')
    expect(observer.takeRecords().map((record) => record.type)).toEqual(['characterData'])
    expect(geometry).not.toHaveBeenCalled()
    observer.disconnect()
    renderer.dispose()
  })

  it('主图指标不提供排序按钮，操作按钮按新顺序传递实例身份', () => {
    const { host, renderer, row, execute } = createHarness()
    renderer.update('main', [row], ['main'])
    const buttons = host
      .querySelectorAll<HTMLButtonElement>('.klc-legend-row')[0]!
      .querySelectorAll('button')
    expect([...buttons].map((button) => button.title)).toEqual([
      '指标设置',
      '更换指标',
      '隐藏指标',
      '关闭指标',
    ])
    for (const index of [0, 1, 2, 3]) buttons[index]!.click()
    expect(execute.mock.calls).toEqual([
      [row.key, 'settings'],
      [row.key, 'replace'],
      [row.key, 'toggle-visibility'],
      [row.key, 'close'],
    ])
    renderer.dispose()
  })

  it('副图指标保留上移/下移，并随 Pane 顺序更新边界状态', () => {
    const { host, renderer, row, execute } = createHarness()
    const subRow = (paneId: string, paneOrder: string[]): LegendRow => ({
      ...row,
      key: paneId,
      paneId,
      indicator: { instanceId: paneId, definitionId: 'RSI' },
      actions: projectLegendActions(
        { id: paneId, kind: 'indicator', paneId, definitionId: 'RSI', params: {}, hidden: false },
        paneOrder,
        () => false,
      ),
    })
    renderer.update(
      'sub_A',
      [subRow('sub_A', ['main', 'sub_A', 'sub_B'])],
      ['main', 'sub_A', 'sub_B'],
    )
    const buttons = host
      .querySelectorAll<HTMLButtonElement>('.klc-legend-row')[0]!
      .querySelectorAll('button')
    expect([...buttons].map((button) => button.title)).toEqual([
      '上移指标',
      '下移指标',
      '指标设置',
      '更换指标',
      '隐藏指标',
      '关闭指标',
    ])
    expect(buttons[0]!.disabled).toBe(true)
    expect(buttons[1]!.disabled).toBe(false)
    buttons[1]!.click()
    expect(execute).toHaveBeenLastCalledWith('sub_A', 'move-down')

    renderer.update(
      'sub_A',
      [subRow('sub_A', ['main', 'sub_B', 'sub_A'])],
      ['main', 'sub_B', 'sub_A'],
    )
    expect(buttons[0]!.disabled).toBe(false)
    expect(buttons[1]!.disabled).toBe(true)
    renderer.dispose()
  })

  it('收起按钮收起全部主图行并移动到首行位置，展开后回到末行下方', () => {
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
    renderer.dispose()
  })

  it('收起态再更新时指标数量随启用指标数变化', () => {
    const { host, renderer, row } = createHarness()
    const button = host.querySelector<HTMLButtonElement>('.klc-legend-collapse')!
    const count = host.querySelector<HTMLElement>('.klc-legend-collapse-count')!
    renderer.update('main', [row], ['main'])
    button.click()
    expect(count.textContent).toBe('1')

    renderer.update(
      'main',
      [
        row,
        {
          ...row,
          key: 'main:BOLL',
          y: 40,
          indicator: { instanceId: 'main:BOLL', definitionId: 'BOLL' },
        },
        {
          ...row,
          key: 'main:EXPMA',
          y: 64,
          indicator: { instanceId: 'main:EXPMA', definitionId: 'EXPMA' },
        },
      ],
      ['main'],
    )
    expect(count.textContent).toBe('3')
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

  it('隐藏、删除 Pane、清空和销毁都会释放标题节点', () => {
    const { host, renderer, row } = createHarness()
    renderer.update('sub_RSI', [{ ...row, paneId: 'sub_RSI' }], ['main', 'sub_RSI'])
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
