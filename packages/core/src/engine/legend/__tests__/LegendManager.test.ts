// @vitest-environment jsdom
/** 使用真实 Chart 领域状态验证图例 CRUD、交互和帧投影。 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createChartDom,
  installAnimationFrameQueue,
  installChartDomStubs,
} from '@/engine/__tests__/helpers/chartDomTestKit'
import { Chart } from '@/engine/chart/impl/chart'
import { loadBuiltinIndicators } from '@/engine/indicators/registerBuiltins'
import { resolveThemeColors } from '@/foundation/tokens/index'
import { LEGEND_UI_EVENT, type LegendUiRequest } from '../types'

beforeAll(loadBuiltinIndicators)
let chart: Chart
let host: HTMLElement
let restoreDom: () => void
let frames: ReturnType<typeof installAnimationFrameQueue>

beforeEach(() => {
  restoreDom = installChartDomStubs()
  frames = installAnimationFrameQueue()
  const dom = createChartDom(800, 500)
  host = dom.canvasLayer
  chart = new Chart(dom, {
    yPaddingPx: 20,
    rightAxisWidth: 60,
    leftAxisWidth: 0,
    bottomAxisHeight: 24,
    minKWidth: 2,
    maxKWidth: 50,
    panes: [{ id: 'main', ratio: 1 }],
  })
  chart.resize()
})
afterEach(async () => {
  await chart.destroy()
  restoreDom()
  vi.unstubAllGlobals()
})

/** 写入实际内联行情并提交渲染帧，不接入外部网络或复制领域替身。 */
function loadData(): void {
  chart.applyCustomData({
    symbol: 'PRIMARY',
    market: 'CN',
    period: 'daily',
    data: [
      { timestamp: 1000, open: 10, high: 11, low: 9, close: 10 },
      { timestamp: 2000, open: 10, high: 13, low: 10, close: 12 },
    ],
  })
  frames.flush()
}

describe('LegendManager', () => {
  it('图表销毁时释放图例快照，旧 API 不能再写入', async () => {
    loadData()
    expect(chart.legend.context.peek()).not.toBeNull()
    await chart.destroy()
    expect(chart.legend.context.peek()).toBeNull()
    expect(chart.legend.rows.peek()).toEqual([])
    expect(chart.legend.list()).toEqual([])
    expect(chart.legend.create({ kind: 'indicator', definitionId: 'MA', role: 'main' })).toBeNull()
  })
  it('CRUD 使用同一个主图实例身份，并在删除后移除领域内容', () => {
    chart.indicators.clearMain()
    const id = chart.legend.create({ kind: 'indicator', definitionId: 'MA', role: 'main' })
    expect(id).toBe('main:MA')
    expect(chart.legend.get(id!)).toMatchObject({ kind: 'indicator', definitionId: 'MA' })
    expect(chart.legend.update(id!, { params: { period1: 7 }, hidden: true })).toBe(true)
    expect(chart.legend.get(id!)).toMatchObject({
      hidden: true,
      params: expect.objectContaining({ period1: 7 }),
    })
    chart.legend.execute(id!, 'toggle-visibility')
    expect(chart.legend.get(id!)).toMatchObject({ hidden: false })
    expect(chart.legend.remove(id!)).toBe(true)
    expect(chart.legend.get(id!)).toBeNull()
    expect(chart.indicators.isMainActive('MA')).toBe(false)
  })

  it('副图图例替换、移动和删除委托同一个 Pane 领域', () => {
    const first = chart.legend.create({ kind: 'indicator', definitionId: 'RSI', role: 'sub' })!
    const second = chart.legend.create({ kind: 'indicator', definitionId: 'MACD', role: 'sub' })!
    const paneId = chart.legend.get(first)!.paneId
    expect(chart.legend.move(second, 'up')).toBe(true)
    expect(
      chart.panes
        .getLayoutSpecs()
        .map((pane) => pane.id)
        .at(-1),
    ).toBe(paneId)
    expect(chart.legend.replace(first, 'KDJ')).toBe(true)
    const replacement = chart.legend
      .list()
      .find((entry) => entry.paneId === paneId && entry.kind === 'indicator')!
    expect(replacement).toMatchObject({ definitionId: 'KDJ' })
    expect(chart.legend.remove(replacement.id)).toBe(true)
    expect(chart.panes.has(paneId)).toBe(false)
  })

  it('自定义行有独立身份，外部模板与 DOM 消费同一份行数据', () => {
    loadData()
    const colors = resolveThemeColors('light', true)
    const id = chart.legend.create({
      kind: 'custom',
      id: 'note',
      paneId: 'main',
      texts: [{ text: '自定义内容', color: colors.text.primary }],
    })!
    expect(id).toBe('custom:note')
    expect(
      chart.legend.create({ kind: 'custom', id: 'note', paneId: 'main', texts: [] }),
    ).toBeNull()
    frames.flush()
    expect(chart.legend.context.peek()?.rows).toContainEqual(expect.objectContaining({ key: id }))
    expect(
      chart.legend.update(id, { texts: [{ text: '更新内容', color: colors.text.primary }] }),
    ).toBe(true)
    chart.updateOptions({ legend: { visible: false } })
    frames.flush()
    expect(chart.legend.context.peek()?.rows.find((row) => row.key === id)?.texts[0]?.text).toBe(
      '更新内容',
    )
    expect(host.querySelector('.klc-legend-row')).toBeNull()
    expect(chart.legend.remove(id)).toBe(true)
  })

  it('比较品种按当前时间读取真实价格，隐藏后保留数值，缺口不补零', () => {
    loadData()
    const id = chart.legend.create({ kind: 'comparison', spec: { symbol: 'COMP', market: 'CN' } })!
    chart.setComparisonData('COMP', [
      { timestamp: 1000, open: 20, high: 21, low: 19, close: 20 },
      { timestamp: 2000, open: 20, high: 23, low: 20, close: 22 },
    ])
    frames.flush()
    expect(chart.legend.context.peek()?.comparisons[0]).toMatchObject({
      price: 22,
      percent: 10,
      bar: expect.objectContaining({ timestamp: 2000 }),
    })
    const texts = chart.legend.rows
      .peek()
      .find((row) => row.key === id)!
      .texts.map((text) => text.text)
    expect(texts).toContain('现价 22.00')
    expect(texts).toContain('涨幅 +10.00%')
    expect(
      chart.legend.rows
        .peek()
        .find((row) => row.key === id)
        ?.actions.map((button) => button.action),
    ).toEqual(['toggle-visibility', 'close'])
    expect(chart.legend.update(id, { hidden: true })).toBe(true)
    frames.flush()
    expect(chart.legend.context.peek()?.comparisons[0]).toMatchObject({
      hidden: true,
      price: 22,
      percent: 10,
    })
    chart.setComparisonData('COMP', [{ timestamp: 1000, open: 20, high: 21, low: 19, close: 20 }])
    frames.flush()
    expect(chart.legend.context.peek()?.comparisons[0]).toMatchObject({
      price: null,
      percent: null,
      bar: null,
    })
    expect(chart.legend.remove(id)).toBe(true)
    expect(chart.comparisonCommands.list()).toHaveLength(0)
  })

  it('DOM 直接执行 Core 操作，只把界面请求交给宿主', () => {
    loadData()
    chart.indicators.clearMain()
    const id = chart.legend.create({ kind: 'indicator', definitionId: 'MA', role: 'main' })!
    frames.flush()
    const requests: LegendUiRequest[] = []
    host.addEventListener(LEGEND_UI_EVENT, (event) => {
      if (event instanceof CustomEvent) requests.push(event.detail)
    })
    const element = host.querySelector<HTMLElement>('[data-indicator="main:MA"]')!
    expect(
      chart.legend.rows
        .peek()
        .find((row) => row.key === id)
        ?.actions.map((button) => button.action),
    ).toEqual(['move-up', 'move-down', 'replace', 'toggle-visibility', 'settings', 'close'])
    element.querySelectorAll<HTMLButtonElement>('button')[3]!.click()
    expect(chart.legend.get(id)).toMatchObject({ hidden: true })
    expect(requests).toEqual([])
    element.querySelectorAll<HTMLButtonElement>('button')[4]!.click()
    expect(requests).toEqual([
      { action: 'settings', id, paneId: 'main', definitionId: 'MA', role: 'main' },
    ])
    element.querySelectorAll<HTMLButtonElement>('button')[5]!.click()
    expect(chart.legend.get(id)).toBeNull()
  })
})
