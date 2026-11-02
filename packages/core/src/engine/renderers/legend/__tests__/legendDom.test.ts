// @vitest-environment jsdom
/** DOM Legend 的差量更新、行几何、收起与操作身份测试。 */
import eye from '@iconify-icons/tabler/eye'
import eyeOff from '@iconify-icons/tabler/eye-off'
import { describe, expect, it, vi } from 'vitest'
import { LEGEND_COLLAPSE_HEIGHT_PX } from '@/engine/legend/impl/legendGeometry.js'
import { projectLegendActions } from '@/engine/legend/impl/projectLegendActions.js'
import { type LegendAction, type LegendRow, type LegendUiRequest } from '@/engine/legend/types.js'
import { createLegendDomRenderer } from '../impl/createLegendDomRenderer.js'
import type { LegendDomFrame } from '../types.js'

/** 构造真实 DOM、切换回调与固定展示行，其余用例只声明差异。 */
function createHarness() {
  const host = document.createElement('div')
  const execute = vi.fn<(id: string, action: LegendAction) => LegendUiRequest | null>(() => null)
  const setMainCollapsed = vi.fn<(collapsed: boolean) => void>()
  const renderer = createLegendDomRenderer(host, setMainCollapsed, execute)
  const row: LegendRow = {
    key: 'main:MA',
    paneId: 'main',
    x: 12,
    y: 16,
    maxWidth: 780,
    height: 24,
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
      { text: 'MA', color: 'red', gapBefore: 0 },
      { text: '(5)', color: 'gray', gapBefore: 4 },
      { text: 'MA5 100.000', color: 'blue', gapBefore: 10 },
    ],
  }
  return { host, renderer, row, execute, setMainCollapsed }
}

/** 组装一帧图例投影；主图默认可收起，行按 pane 分组。 */
function frameOf(
  panes: ReadonlyArray<readonly [string, ReadonlyArray<LegendRow>]>,
  options: { canCollapse?: boolean; mainCollapsed?: boolean } = {},
): LegendDomFrame {
  return {
    rowsByPane: panes.map(([paneId, rows]) => ({ paneId, rows })),
    mainCollapsed: options.mainCollapsed ?? false,
    canCollapse: options.canCollapse ?? false,
  }
}

describe('DOM Legend renderer', () => {
  it('行盒顶部直接用发布坐标，相同帧不写 DOM，数值更新复用文本节点', () => {
    const { host, renderer, row } = createHarness()
    const geometry = vi.spyOn(host, 'getBoundingClientRect')
    renderer.update(frameOf([['main', [{ ...row, error: 'invalid plot' }]]]))

    const element = host.querySelector<HTMLElement>('.klc-legend-row')!
    expect(element.style.top).toBe(`${row.y}px`)
    const banner = host.querySelector<HTMLDivElement>('.klc-legend-error-banner')!
    expect(banner.textContent).toBe('invalid plot')
    expect(banner.closest('.klc-legend-text')).not.toBeNull()

    renderer.update(frameOf([['main', [row]]]))
    expect(host.querySelector('.klc-legend-row')).toBe(element)
    expect(host.querySelector('.klc-legend-error-banner')).toBeNull()

    const value = host.querySelectorAll('.klc-legend-text > span')[1]!.firstChild
    const observer = new MutationObserver(() => {})
    observer.observe(host, {
      subtree: true,
      attributes: true,
      characterData: true,
      childList: true,
    })

    renderer.update(frameOf([['main', [{ ...row }]]]))
    expect(observer.takeRecords()).toEqual([])
    renderer.update(
      frameOf([
        [
          'main',
          [
            {
              ...row,
              texts: [
                ...row.texts.slice(0, 2),
                { text: 'MA5 101.000', color: 'blue', gapBefore: 10 },
              ],
            },
          ],
        ],
      ]),
    )
    expect(host.querySelectorAll('.klc-legend-text > span')[1]!.firstChild).toBe(value)
    expect(value?.textContent).toBe('MA5 101.000')
    expect(observer.takeRecords().map((record) => record.type)).toEqual(['characterData'])
    expect(geometry).not.toHaveBeenCalled()
    observer.disconnect()
    renderer.dispose()
  })

  it('按每段自带的最终间距排版，容器不按下标推断间距', () => {
    const { host, renderer, row } = createHarness()
    renderer.update(
      frameOf([
        [
          'main',
          [
            {
              ...row,
              texts: [
                { text: 'A', color: 'red', gapBefore: 0 },
                { text: 'B', color: 'gray', gapBefore: 4 },
                { text: 'C', color: 'blue', gapBefore: 10 },
              ],
            },
          ],
        ],
      ]),
    )

    const element = host.querySelector<HTMLElement>('.klc-legend-row')!
    const text = host.querySelector<HTMLElement>('.klc-legend-text')!
    const spans = text.querySelectorAll<HTMLElement>(':scope > span:not(.klc-legend-spinner)')
    expect(element.style.gap).toBe('')
    expect(text.style.gap).toBe('')
    expect([...spans].map((span) => span.style.marginLeft)).toEqual(['4px', '10px'])
    renderer.dispose()
  })

  it('收起态由 Core 决定：按钮可见性跟随 canCollapse，点击只提交切换意图', () => {
    const { host, renderer, row, setMainCollapsed } = createHarness()
    document.body.append(host)
    const button = host.querySelector<HTMLButtonElement>('.klc-legend-collapse')!
    const count = host.querySelector<HTMLElement>('.klc-legend-collapse-count')!
    const second = {
      ...row,
      key: 'main:BOLL',
      y: 40,
      indicator: { instanceId: 'main:BOLL', definitionId: 'BOLL' },
    }
    const buttonTop = () => Number.parseFloat(button.style.top)

    renderer.update(frameOf([['main', [row, second]]]))
    expect(button.hidden).toBe(true)
    expect(getComputedStyle(button).display).toBe('none')

    renderer.update(frameOf([['main', [row, second]]], { canCollapse: true }))
    const rows = host.querySelectorAll<HTMLElement>('.klc-legend-row')
    expect(button.hidden).toBe(false)
    expect(button.title).toBe('收起指标')
    expect(count.hidden).toBe(true)
    // 展开态：按钮在末行下方，左边界与首行对齐。
    expect(buttonTop()).toBeGreaterThan(second.y + second.height)
    expect(button.style.left).toBe(`${row.x}px`)

    button.click()
    expect(setMainCollapsed).toHaveBeenCalledWith(true)

    // Core 发布收起态：全部主图行隐藏，按钮回到首行并显示指标数量。
    renderer.update(frameOf([['main', [row, second]]], { canCollapse: true, mainCollapsed: true }))
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(button.title).toBe('展开指标')
    expect([...rows].every((element) => element.style.display === 'none')).toBe(true)
    expect(buttonTop()).toBe(row.y + (row.height - LEGEND_COLLAPSE_HEIGHT_PX) / 2)
    expect(count.hidden).toBe(false)
    expect(count.textContent).toBe('2')

    // 收起期间新增的行同样隐藏，数量跟随指标行变化。
    const third = {
      ...second,
      key: 'main:EXPMA',
      y: 64,
      indicator: { instanceId: 'main:EXPMA', definitionId: 'EXPMA' },
    }
    renderer.update(
      frameOf([['main', [row, second, third]]], { canCollapse: true, mainCollapsed: true }),
    )
    expect(count.textContent).toBe('3')
    expect(host.querySelectorAll<HTMLElement>('[data-indicator]')[2]!.style.display).toBe('none')

    // clear 复位为展开；之后是否可收起仍由 Core 传入。
    renderer.clear()
    expect(button.hidden).toBe(true)
    renderer.update(frameOf([['main', [row]]], { canCollapse: true }))
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(host.querySelector<HTMLElement>('.klc-legend-row')!.style.display).toBe('')
    renderer.update(frameOf([['main', [{ ...row, indicator: undefined }]]]))
    expect(button.hidden).toBe(true)
    renderer.dispose()
    host.remove()
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

      renderer.update(frameOf([[paneId, [rowFor(paneOrder)]]]))
      const buttons = [
        ...host
          .querySelectorAll<HTMLButtonElement>('.klc-legend-row')[0]!
          .querySelectorAll('button'),
      ]
      expect(buttons.map((button) => button.title)).toEqual(titles)
      expect(buttons.map((button) => button.disabled)).toEqual(disabled)
      for (const index of clicks) buttons[index]!.click()
      expect(execute.mock.calls).toEqual(calls)

      if (reorder) {
        renderer.update(frameOf([[paneId, [rowFor(reorder.paneOrder)]]]))
        expect(buttons.map((button) => button.disabled)).toEqual(reorder.disabled)
      }
      renderer.dispose()
    },
  )

  it('比较名称复用悬浮框，仅提供隐藏和删除按钮，并保留隐藏行供恢复', () => {
    const { host, renderer, row, execute } = createHarness()
    const comparison: LegendRow = {
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
      texts: [{ text: '比较商品 A', color: 'blue', gapBefore: 0 }],
    }
    renderer.update(frameOf([['main', [comparison]]]))
    const element = host.querySelector<HTMLElement>('[data-comparison]')!
    const buttons = element.querySelectorAll<HTMLButtonElement>('button')
    expect(buttons).toHaveLength(2)
    expect(buttons[0]!.disabled).toBe(false)
    expect(buttons[0]!.title).toBe('隐藏比较品种')
    buttons[0]!.click()
    expect(execute).toHaveBeenNthCalledWith(1, comparison.key, 'toggle-visibility')

    renderer.update(
      frameOf([
        [
          'main',
          [
            {
              ...comparison,
              hidden: true,
              actions: comparison.actions.map((action) =>
                action.action === 'toggle-visibility'
                  ? { ...action, label: '显示比较品种' }
                  : action,
              ),
            },
          ],
        ],
      ]),
    )
    expect(element.hasAttribute('data-hidden')).toBe(true)
    expect(buttons[0]!.title).toBe('显示比较品种')
    buttons[0]!.click()
    expect(execute).toHaveBeenNthCalledWith(2, comparison.key, 'toggle-visibility')
    buttons[1]!.click()
    expect(execute).toHaveBeenNthCalledWith(3, comparison.key, 'close')

    renderer.update(frameOf([['main', []]]))
    expect(host.querySelector('[data-comparison]')).toBeNull()
    renderer.dispose()
  })

  it('行清理、Pane 移除、clear 和销毁都会释放标题节点', () => {
    const { host, renderer, row } = createHarness()
    renderer.update(
      frameOf([
        ['main', [row]],
        ['sub_RSI', [{ ...row, key: 'sub:RSI', paneId: 'sub_RSI' }]],
      ]),
    )
    expect(host.querySelectorAll('.klc-legend-row')).toHaveLength(2)

    // Pane 被移出顺序时连同其行一起释放。
    renderer.update(frameOf([['main', [row]]]))
    expect(host.querySelectorAll('.klc-legend-row')).toHaveLength(1)
    renderer.update(frameOf([['main', []]]))
    expect(host.querySelectorAll('.klc-legend-row')).toHaveLength(0)

    renderer.update(frameOf([['main', [row]]]))
    renderer.clear()
    expect(host.querySelectorAll('.klc-legend-row')).toHaveLength(0)
    renderer.dispose()
    expect(host.childElementCount).toBe(0)
  })
})
