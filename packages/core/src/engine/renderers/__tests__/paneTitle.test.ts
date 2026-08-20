// paneTitle 渲染器的标题状态读取调用方测试。
import { describe, expect, it, vi } from 'vitest'

import { createPaneTitleRendererPlugin } from '../paneTitle'
import type { IndicatorScheduler } from '../../indicators/scheduler'
import type { PluginHost, RenderContext } from '../../../foundation/plugin'

/** 创建可记录绘制操作的 Canvas 上下文。 */
function createCanvasContext(): CanvasRenderingContext2D {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn().mockReturnValue({ width: 10 }),
    font: '',
    fillStyle: '',
    textAlign: 'left',
    textBaseline: 'top',
  } as unknown as CanvasRenderingContext2D
}

describe('createPaneTitleRendererPlugin', () => {
  it('passes the frame indicator state reader to the title callback', () => {
    const getTitleInfo = vi.fn().mockReturnValue({ name: 'RSI' })
    const scheduler = {
      getIndicatorMetadata: vi.fn().mockReturnValue({ getTitleInfo }),
    } as unknown as IndicatorScheduler
    const host = {
      getService: vi.fn().mockReturnValue(scheduler),
    } as unknown as PluginHost
    const stateReader = { get: vi.fn() }
    const canvas = createCanvasContext()
    const plugin = createPaneTitleRendererPlugin({
      paneId: 'sub_RSI',
      title: 'RSI',
      indicatorId: 'rsi',
      params: {},
    })
    plugin.onInstall(host)

    plugin.draw({
      overlayCtx: canvas,
      pane: { id: 'sub_RSI' },
      paneWidth: 800,
      data: [],
      crosshairIndex: null,
      indicatorStateReader: stateReader,
      theme: 'light',
      isAsiaMarket: true,
    } as unknown as RenderContext)

    expect(getTitleInfo).toHaveBeenCalledWith(
      [],
      null,
      {},
      stateReader,
      'sub_RSI',
      expect.any(Object),
    )
  })
})
