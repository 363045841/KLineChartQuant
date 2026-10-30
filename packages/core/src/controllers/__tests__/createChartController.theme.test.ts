// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createCanvasGetContextMock,
  ResizeObserverMock,
  stubAnimationFrame,
} from '@/engine/__tests__/helpers/chartDomTestKit'

import { loadBuiltinIndicators } from '../../engine/indicators/registerBuiltins'
import { createChartController } from '../chart/index'
import { MarketDataContext } from '@/data/management/impl/context.js'
import { createDataSourceFixture } from '@/data/provider/__tests__/helpers/providerTestKit.js'

import type { KLineData } from '../types'

function createBars(length = 30): KLineData[] {
  return Array.from({ length }, (_, index) => ({
    timestamp: (index + 1) * 60_000,
    open: index + 1,
    high: index + 2,
    low: index,
    close: index + 1,
    volume: 100,
  }))
}

describe('createChartController mount theme', () => {
  beforeAll(async () => {
    await loadBuiltinIndicators()
  })

  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
    stubAnimationFrame()
    HTMLCanvasElement.prototype.getContext = createCanvasGetContextMock()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  // 验证新实例默认深色，且调用方仍可显式指定浅色。
  it.each([
    { theme: undefined, expected: 'dark' },
    { theme: 'light', expected: 'light' },
  ] as const)('挂载参数 $theme 得到 $expected 主题', async ({ theme, expected }) => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', { value: 800, configurable: true })
    Object.defineProperty(container, 'clientHeight', { value: 600, configurable: true })
    document.body.appendChild(container)

    const ctrl = await createChartController({
      container,
      theme,
    })

    expect(ctrl.settings.peek().theme).toBe(expected)
    expect(ctrl.theme.peek()).toBe(expected)

    ctrl.dispose()
    container.remove()
  })

  // 验证显式 auto 偏好仍跟随系统，不受默认深色影响。
  it('显式 auto 设置保持跟随系统', async () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', { value: 800, configurable: true })
    Object.defineProperty(container, 'clientHeight', { value: 600, configurable: true })
    document.body.appendChild(container)

    const ctrl = await createChartController({ container, settings: { theme: 'auto' } })

    // 生效主题由 systemTheme 推导，其初值为 light。
    expect(ctrl.settings.peek().theme).toBe('auto')
    expect(ctrl.theme.peek()).toBe('light')

    ctrl.setSystemTheme('dark')
    expect(ctrl.settings.peek().theme).toBe('auto')
    expect(ctrl.theme.peek()).toBe('dark')

    ctrl.dispose()
    container.remove()
  })

  it('owns generated DOM but leaves caller-provided layers intact', async () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', { value: 800, configurable: true })
    Object.defineProperty(container, 'clientHeight', { value: 600, configurable: true })
    document.body.appendChild(container)

    const generated = await createChartController({ container })
    expect(container.querySelector('.klc-scroll-content')).not.toBeNull()
    generated.dispose()
    expect(container.querySelector('.klc-scroll-content')).toBeNull()

    const canvasLayer = document.createElement('div')
    const rightAxisLayer = document.createElement('div')
    const xAxisCanvas = document.createElement('canvas')
    container.append(canvasLayer, rightAxisLayer)
    canvasLayer.appendChild(xAxisCanvas)
    const provided = await createChartController({
      container,
      canvasLayer,
      rightAxisLayer,
      xAxisCanvas,
    })
    provided.dispose()
    expect(container.contains(canvasLayer)).toBe(true)
    expect(container.contains(rightAxisLayer)).toBe(true)
    container.remove()
  })

  it('keeps delegated disposed defaults and dispose idempotent', async () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', { value: 800, configurable: true })
    Object.defineProperty(container, 'clientHeight', { value: 600, configurable: true })
    document.body.appendChild(container)
    const ctrl = await createChartController({ container })

    ctrl.dispose()
    ctrl.dispose()
    ctrl.setSymbols([])
    expect(ctrl.getData()).toEqual([])
    expect(ctrl.removeDrawing('missing')).toBe(false)
    expect(ctrl.getPaneInfo('main')).toBeUndefined()
    expect(ctrl.getViewport()).toBeNull()
    expect(ctrl.getZoomLevelCount()).toBe(0)
    container.remove()
  })

  it('exposes isolated Agent facades backed by live controller state', async () => {
    const firstContainer = document.createElement('div')
    const secondContainer = document.createElement('div')
    for (const container of [firstContainer, secondContainer]) {
      Object.defineProperty(container, 'clientWidth', { value: 800, configurable: true })
      Object.defineProperty(container, 'clientHeight', { value: 600, configurable: true })
      document.body.appendChild(container)
    }

    const data = createBars()
    const host = new MarketDataContext()
    host.registerDataSource(createDataSourceFixture(data, false).source)
    const firstInstrument = await host.resolveInstrument('test', 'A')
    const secondInstrument = await host.resolveInstrument('test', 'B')
    const first = await createChartController({ container: firstContainer, marketDataContext: host,
      symbols: [{ instrument: firstInstrument, market: 'CN', symbol: 'A', source: 'test', period: 'daily' }] })
    const second = await createChartController({ container: secondContainer, marketDataContext: host,
      symbols: [{ instrument: secondInstrument, market: 'CN', symbol: 'B', source: 'test', period: 'daily' }] })
    await vi.waitFor(() => expect(first.getData()).toHaveLength(30))
    await vi.waitFor(() => expect(second.getData()).toHaveLength(30))

    const initial = first.agent.getContext()
    expect(initial.chartId).not.toBe(second.agent.getContext().chartId)
    expect(initial).toMatchObject({
      symbol: 'A',
      market: 'CN',
      exchange: 'TEST',
      period: 'kline',
      dataSource: 'test',
    })
    first.setTheme('light')

    first.setSymbols([{ instrument: secondInstrument, symbol: 'B', market: 'CN', source: 'test', period: 'daily' }])
    await vi.waitFor(() => expect(first.getData()).toHaveLength(30))
    const afterData = first.agent.getContext()
    expect(afterData.symbol).toBe('B')

    first.dispose()
    second.dispose()
    host.dispose()
    firstContainer.remove()
    secondContainer.remove()
  })
})
