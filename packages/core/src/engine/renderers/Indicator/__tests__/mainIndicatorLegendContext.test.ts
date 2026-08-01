import { describe, expect, it } from 'vitest'

import type { RenderContext } from '../../../../foundation/plugin'
import type { TimeShareData } from '../../../../foundation/types/price'
import { buildLegendTemplateContext } from '../mainIndicatorLegendContext'

function point(timestamp: number, price: number): TimeShareData {
  return { timestamp, price, average: price, volume: 100, amount: price * 100 }
}

describe('buildLegendTemplateContext timeshare baseline', () => {
  it('formats timeshare volume as hands', () => {
    const context = {
      data: [{ ...point(1, 10), volume: 12_345 }],
      period: 'timeshare',
      range: { start: 0, end: 1 },
      crosshairIndex: 0,
      paneWidth: 800,
      theme: 'light',
      isAsiaMarket: true,
      settings: { preClose: 9 },
    } as unknown as RenderContext

    const result = buildLegendTemplateContext({ context, host: null, yPaddingPx: 0 })

    expect(result?.timeshare?.volumeText).toBe('1.23万手')
  })

  // 验证仅有成交额的分时不伪造成交量。
  it('keeps amount-only timeshare metrics separate from volume', () => {
    const context = {
      data: [{ timestamp: 1, price: 3812.11, average: 3812.11, amount: 6_972_838_100 }],
      period: 'timeshare',
      range: { start: 0, end: 1 },
      crosshairIndex: 0,
      paneWidth: 800,
      theme: 'light',
      isAsiaMarket: true,
      settings: { preClose: 3828.47 },
    } as unknown as RenderContext

    const result = buildLegendTemplateContext({ context, host: null, yPaddingPx: 0 })

    expect(result?.timeshare?.volume).toBeNull()
    expect(result?.timeshare?.volumeText).toBeNull()
    expect(result?.timeshare?.amount).toBe(6_972_838_100)
    expect(result?.timeshare?.amountText).toBe('69.73亿')
  })

  it.each([undefined, -1])(
    'does not derive changes from the first price when preClose is %s',
    (preClose) => {
      const context = {
        data: [point(1, 10), point(2, 11)],
        period: 'timeshare',
        range: { start: 0, end: 2 },
        crosshairIndex: 1,
        paneWidth: 800,
        theme: 'light',
        isAsiaMarket: true,
        settings: { preClose },
      } as unknown as RenderContext

      const result = buildLegendTemplateContext({ context, host: null, yPaddingPx: 0 })

      expect(result?.timeshare).toBeNull()
    },
  )
})
