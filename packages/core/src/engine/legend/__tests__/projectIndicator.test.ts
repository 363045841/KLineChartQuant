/** 主副图共用的指标标题投影契约与十字线取值测试。 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createMockRenderContext } from '@/engine/__tests__/helpers/renderTestKit'
import { getRegisteredIndicatorDefinition } from '@/engine/indicators/indicatorDefinitionRegistry'
import { loadBuiltinIndicators } from '@/engine/indicators/registerBuiltins'
import { resolveThemeColors } from '@/foundation/tokens/index'
import type { KLineData } from '@/foundation/types/price'
import { projectIndicator } from '../impl/projectLegendContext'
import { projectIndicatorTexts } from '../impl/projectLegendRows'

beforeAll(loadBuiltinIndicators)
afterEach(() => vi.restoreAllMocks())

/** 使用生产主题与共享帧读取器运行副图标题投影。 */
function project(definitionId: string, data: KLineData[], index: number, hidden = false) {
  const context = createMockRenderContext({ data, indicatorStateReader: { get: vi.fn() } })
  const colors = resolveThemeColors(
    context.theme,
    context.isAsiaMarket,
    context.colorPresetSettings,
  )
  const title = projectIndicator(
    { instanceId: 'instance', definitionId, paneId: 'sub', params: {}, hidden },
    context.indicatorStateReader,
    context.indicatorAvailability,
    data,
    index,
    colors,
  )
  return {
    title,
    context,
    texts: title
      ? projectIndicatorTexts(title, {
          textPrimary: colors.text.primary,
          textTertiary: colors.text.tertiary,
          up: colors.candleUpBody,
          down: colors.candleDownBody,
        })
      : [],
  }
}

describe('统一指标图例投影', () => {
  it.each([
    { volume: 2500, text: '2.50K' },
    { volume: 12500, text: '12.50K' },
    { volume: 125000000, text: '125.00M' },
    { volume: 1250000000, text: '1.25B' },
  ])('副图成交量使用指标自己的格式 $text', ({ volume, text }) => {
    const data = [{ timestamp: 1, open: 10, high: 12, low: 9, close: 11, volume }]
    expect(project('VOL', data, 0).texts.map((item) => item.text)).toEqual(['VOL', `VOL ${text}`])
  })

  it('将实例身份、取值索引和帧读取器传给定义，并保留隐藏标题', () => {
    const getTitleInfo = vi
      .spyOn(getRegisteredIndicatorDefinition('rsi')!, 'getTitleInfo')
      .mockReturnValue({ name: 'RSI' })
    const { title, context } = project('rsi', [], -1, true)
    expect(getTitleInfo).toHaveBeenCalledWith(
      [],
      -1,
      {},
      context.indicatorStateReader,
      'instance',
      'sub',
      expect.any(Object),
    )
    expect(title).toMatchObject({
      instanceId: 'instance',
      definitionId: 'rsi',
      name: 'RSI',
      hidden: true,
    })
  })
})
