// paneTitle 渲染器的标题状态读取调用方测试。
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  createMockCanvasContext,
  createMockRenderContext,
} from '@/engine/__tests__/helpers/renderTestKit'
import { getRegisteredIndicatorDefinition } from '@/engine/indicators/indicatorDefinitionRegistry'
import { loadBuiltinIndicators } from '@/engine/indicators/registerBuiltins'
import { createPaneTitleRendererLayer } from '../paneTitle'

beforeAll(async () => {
  await loadBuiltinIndicators()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('createPaneTitleRendererLayer', () => {
  it.each([
    { crosshairIndex: null, latestVolume: 2500, text: '2.50K' },
    { crosshairIndex: 0, latestVolume: 2500, text: '0.00' },
    { crosshairIndex: null, latestVolume: 12500, text: '12.50K' },
    { crosshairIndex: null, latestVolume: 125000000, text: '125.00M' },
    { crosshairIndex: null, latestVolume: 1250000000, text: '1.25B' },
  ])('publishes VOL $text at crosshair index $crosshairIndex', ({ crosshairIndex, latestVolume, text }) => {
    const publishLegendRows = vi.fn()
    const layer = createPaneTitleRendererLayer({
      paneId: 'sub_VOL',
      title: 'VOL',
      indicatorId: 'VOL',
      instanceId: 'inst-vol',
      params: {},
    })
    layer.paint(
      createMockRenderContext({
        pane: { id: 'sub_VOL' },
        publishLegendRows,
        crosshairIndex,
        indicatorStateReader: { get: vi.fn() },
        data: [
          { timestamp: 1, open: 10, high: 12, low: 9, close: 11, volume: 0 },
          { timestamp: 2, open: 11, high: 13, low: 10, close: 12, volume: latestVolume },
        ],
      }),
    )
    expect(publishLegendRows).toHaveBeenCalledWith('sub_VOL', [
      expect.objectContaining({
        texts: [
          expect.objectContaining({ text: 'VOL' }),
          expect.objectContaining({ text: `VOL ${text}` }),
        ],
      }),
    ])
  })

  it('passes the bound instance identity and frame state reader to the title callback', () => {
    // paneTitle 通过静态定义注册表取 metadata，spy 其公开的 getTitleInfo 以观察调用契约
    const getTitleInfo = vi
      .spyOn(getRegisteredIndicatorDefinition('rsi')!, 'getTitleInfo')
      .mockReturnValue({ name: 'RSI' })
    const stateReader = { get: vi.fn() }
    const canvas = createMockCanvasContext()
    const publishLegendRows = vi.fn()
    const layer = createPaneTitleRendererLayer({
      paneId: 'sub_RSI',
      title: 'RSI',
      indicatorId: 'rsi',
      instanceId: 'inst-rsi',
      params: {},
    })

    layer.paint(
      createMockRenderContext({
        overlayCtx: canvas,
        publishLegendRows,
        pane: { id: 'sub_RSI' },
        paneWidth: 800,
        data: [],
        crosshairIndex: null,
        indicatorStateReader: stateReader,
        isAsiaMarket: true,
      }),
    )

    expect(getTitleInfo).toHaveBeenCalledWith(
      [],
      -1,
      {},
      stateReader,
      'inst-rsi',
      'sub_RSI',
      expect.any(Object),
    )
    expect(publishLegendRows).toHaveBeenCalledWith('sub_RSI', [
      expect.objectContaining({
        indicator: { instanceId: 'inst-rsi', definitionId: 'rsi' },
        paneId: 'sub_RSI',
        texts: [expect.objectContaining({ text: 'RSI' })],
        height: 18,
        maxWidth: expect.any(Number),
      }),
    ])
    expect(canvas.fillText).not.toHaveBeenCalled()
    expect(canvas.measureText).not.toHaveBeenCalled()
  })

  it('reads the latest bar when there is no crosshair, not the visible range end', () => {
    const getTitleInfo = vi
      .spyOn(getRegisteredIndicatorDefinition('rsi')!, 'getTitleInfo')
      .mockReturnValue({ name: 'RSI' })
    const layer = createPaneTitleRendererLayer({
      paneId: 'sub_RSI',
      title: 'RSI',
      indicatorId: 'rsi',
      instanceId: 'inst-rsi',
      params: {},
    })
    const data = Array.from({ length: 10 }, (_, i) => ({
      timestamp: 1000000000000 + i * 60000,
      open: 100 + i,
      high: 101 + i,
      low: 99 + i,
      close: 100 + i,
      volume: 1000,
    }))

    layer.paint(
      createMockRenderContext({
        pane: { id: 'sub_RSI' },
        paneWidth: 800,
        data,
        // 视口只覆盖前 5 根，取值仍应落到最新一根（索引 9）。
        range: { start: 0, end: 5 },
        crosshairIndex: null,
        indicatorStateReader: { get: vi.fn() },
        isAsiaMarket: true,
      }),
    )

    expect(getTitleInfo).toHaveBeenCalledWith(
      data,
      9,
      {},
      expect.any(Object),
      'inst-rsi',
      'sub_RSI',
      expect.any(Object),
    )
  })

  it('marks the title row hidden when the indicator is hidden', () => {
    vi.spyOn(getRegisteredIndicatorDefinition('rsi')!, 'getTitleInfo').mockReturnValue({
      name: 'RSI',
    })
    const publishLegendRows = vi.fn()
    const layer = createPaneTitleRendererLayer({
      paneId: 'sub_RSI',
      title: 'RSI',
      indicatorId: 'rsi',
      instanceId: 'inst-rsi',
      hidden: true,
      params: {},
    })

    layer.paint(
      createMockRenderContext({
        publishLegendRows,
        pane: { id: 'sub_RSI' },
        paneWidth: 800,
        data: [],
        crosshairIndex: null,
        indicatorStateReader: { get: vi.fn() },
        isAsiaMarket: true,
      }),
    )

    expect(publishLegendRows).toHaveBeenCalledWith('sub_RSI', [
      expect.objectContaining({ hidden: true }),
    ])
  })
})
