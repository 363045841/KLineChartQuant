// paneTitle 渲染器的标题状态读取调用方测试。
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  createMockCanvasContext,
  createMockRenderContext,
} from '@/engine/__tests__/helpers/renderTestKit'
import { getRegisteredIndicatorDefinition } from '@/engine/indicators/indicatorDefinitionRegistry'
import { loadBuiltinIndicators } from '@/engine/indicators/registerBuiltins'
import { createPaneTitleRendererPlugin } from '../paneTitle'

beforeAll(async () => {
  await loadBuiltinIndicators()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('createPaneTitleRendererPlugin', () => {
  it('passes the bound instance identity and frame state reader to the title callback', () => {
    // paneTitle 通过静态定义注册表取 metadata，spy 其公开的 getTitleInfo 以观察调用契约
    const getTitleInfo = vi
      .spyOn(getRegisteredIndicatorDefinition('rsi')!, 'getTitleInfo')
      .mockReturnValue({ name: 'RSI' })
    const stateReader = { get: vi.fn() }
    const canvas = createMockCanvasContext()
    const plugin = createPaneTitleRendererPlugin({
      paneId: 'sub_RSI',
      title: 'RSI',
      indicatorId: 'rsi',
      instanceId: 'inst-rsi',
      params: {},
    })

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
      'inst-rsi',
      'sub_RSI',
      expect.any(Object),
    )
  })
})
