/** 主副图共用的指标标题投影契约与十字线取值测试。 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createMockRenderContext } from '@/engine/__tests__/helpers/renderTestKit'
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
  it('副图成交量标题沿用指标自己的格式器', () => {
    const data = [{ timestamp: 1, open: 10, high: 12, low: 9, close: 11, volume: 1250000000 }]
    expect(project('VOL', data, 0).texts.map((item) => item.text)).toEqual(['VOL', 'VOL 1.25B'])
  })

  it('保留隐藏标记，不因当前位置没有取值而丢弃副图行', () => {
    const { title } = project('dpo', [], -1, true)
    expect(title).toMatchObject({
      instanceId: 'instance',
      definitionId: 'dpo',
      name: 'DPO',
      hidden: true,
    })
  })
})
