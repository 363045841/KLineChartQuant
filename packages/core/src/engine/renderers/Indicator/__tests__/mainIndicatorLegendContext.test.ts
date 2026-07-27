import { describe, expect, it } from 'vitest'

import type { RenderContext } from '../../../../foundation/plugin'
import type { TimeShareData } from '../../../../foundation/types/price'
import { buildLegendTemplateContext } from '../mainIndicatorLegendContext'

function point(timestamp: number, price: number): TimeShareData {
  return { timestamp, price, average: price, volume: 100, amount: price * 100 }
}

describe('buildLegendTemplateContext timeshare baseline', () => {
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
