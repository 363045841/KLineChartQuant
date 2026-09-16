// paneTitle 渲染器的标题状态读取调用方测试。
import { describe, expect, it, vi } from 'vitest'
import {
  createMockCanvasContext,
  createMockRenderContext,
  createMockServiceHost,
} from '@/engine/__tests__/helpers/renderTestKit'

import { createPaneTitleRendererPlugin } from '../paneTitle'

describe('createPaneTitleRendererPlugin', () => {
  it('passes the frame indicator state reader to the title callback', () => {
    const getTitleInfo = vi.fn().mockReturnValue({ name: 'RSI' })
    const scheduler = { getIndicatorMetadata: vi.fn(() => ({ getTitleInfo })) }
    const host = createMockServiceHost({ indicatorScheduler: scheduler })
    const stateReader = { get: vi.fn() }
    const canvas = createMockCanvasContext()
    const plugin = createPaneTitleRendererPlugin({
      paneId: 'sub_RSI',
      title: 'RSI',
      indicatorId: 'rsi',
      params: {},
    })
    plugin.onInstall?.(host)

    plugin.draw?.(
      createMockRenderContext({
        overlayCtx: canvas,
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
      null,
      {},
      stateReader,
      'sub_RSI',
      expect.any(Object),
    )
  })
})
