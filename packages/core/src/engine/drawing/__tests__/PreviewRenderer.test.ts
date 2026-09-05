/** 验证绘图预览保留交互锚点的未来槽位语义。 */
import { describe, expect, it } from 'vitest'

import { PreviewRenderer } from '../PreviewRenderer'

describe('PreviewRenderer', () => {
  it('keeps the current future-slot offset in a two-anchor preview', () => {
    const preview = new PreviewRenderer().buildPreview(
      'trend-line',
      [{ time: 1_000, price: 10 }],
      { time: 1_000, futureOffset: 3, price: 12 },
      'main',
      'kline',
    )

    expect(preview?.anchors[1]).toMatchObject({ time: 1_000, futureOffset: 3, price: 12 })
  })
})
