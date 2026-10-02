// @vitest-environment jsdom
/** DOM Legend 的高频差量更新、操作身份与生命周期测试。 */
import { describe, expect, it, vi } from 'vitest'
import { createLegendDomRenderer } from '../impl/createLegendDomRenderer.js'
import { LEGEND_ACTION_EVENT, type LegendRow } from '../types.js'

/** 构造真实 DOM 与固定展示行，其余用例只声明差异。 */
function createHarness() {
  const host = document.createElement('div')
  const renderer = createLegendDomRenderer(host)
  const row: LegendRow = {
    key: 'main:MA',
    paneId: 'main',
    x: 12,
    y: 16,
    maxWidth: 780,
    height: 18,
    gap: 10,
    indicator: { instanceId: 'main:MA', definitionId: 'MA' },
    texts: [
      { text: 'MA', color: 'red' },
      { text: '(5)', color: 'gray' },
      { text: 'MA5 100.000', color: 'blue' },
    ],
  }
  return { host, renderer, row }
}

describe('DOM Legend renderer', () => {
  it('拖动期间保留数值与颜色，仍同步布局，结束后恢复更新', () => {
    const { host, renderer, row } = createHarness()
    renderer.update('main', [row], ['main'])
    const value = host.querySelectorAll('.klc-legend-text > span')[2]!
    const changed = {
      ...row,
      y: 40,
      texts: [...row.texts.slice(0, 2), { text: 'MA5 200.000', color: 'red' }],
    }
    renderer.update('main', [changed], ['main'], true)
    expect(value.textContent).toBe('MA5 100.000')
    expect(value.style.color).toBe('blue')
    expect(host.querySelector<HTMLElement>('.klc-legend-row')?.style.top).toBe('40px')

    renderer.update('main', [{ ...changed, y: 50 }], ['main'], true)
    expect(value.textContent).toBe('MA5 100.000')
    renderer.update('main', [changed], ['main'], false)
    expect(value.textContent).toBe('MA5 200.000')
    expect(value.style.color).toBe('red')
    renderer.dispose()
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

  it('四个按钮传递对应实例身份，并更新上下边界', () => {
    const { host, renderer, row } = createHarness()
    const onAction = vi.fn()
    host.addEventListener(LEGEND_ACTION_EVENT, onAction)
    const second = {
      ...row,
      key: 'main:BOLL',
      indicator: { instanceId: 'main:BOLL', definitionId: 'BOLL' },
    }
    renderer.update('main', [row, second], ['main'])
    const firstButtons = host
      .querySelectorAll<HTMLButtonElement>('.klc-legend-row')[0]!
      .querySelectorAll('button')
    expect(firstButtons[0]!.disabled).toBe(true)
    expect(firstButtons[1]!.disabled).toBe(false)
    for (const index of [1, 2, 3]) firstButtons[index]!.click()
    expect(onAction.mock.calls.map(([event]) => event.detail)).toEqual([
      { action: 'move-down', paneId: 'main', definitionId: 'MA' },
      { action: 'replace', paneId: 'main', definitionId: 'MA' },
      { action: 'close', paneId: 'main', definitionId: 'MA' },
    ])
    renderer.update('main', [second, row], ['main'])
    expect(firstButtons[0]!.disabled).toBe(false)
    expect(firstButtons[1]!.disabled).toBe(true)
    firstButtons[0]!.click()
    expect(onAction.mock.lastCall?.[0].detail.action).toBe('move-up')
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
