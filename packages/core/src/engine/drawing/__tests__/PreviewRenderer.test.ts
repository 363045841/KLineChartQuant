/** 验证绘图预览保留交互锚点的未来槽位语义，并物化组合图元的全部持久化锚点。 */
import { describe, expect, it } from 'vitest'

import { PreviewRenderer } from '../PreviewRenderer'
import { createDrawingViewportPort } from './helpers/drawingTestKit'

/** 预览物化复用视口 port 的时间轴能力（Bar 时间戳：500 / 1000 / 1500）。 */
const timeline = createDrawingViewportPort()

describe('PreviewRenderer', () => {
  it('keeps the current future-slot offset in a two-anchor preview', () => {
    const preview = new PreviewRenderer().buildPreview(
      'trend-line',
      [{ time: 1_000, price: 10 }],
      { time: 1_000, futureOffset: 3, price: 12 },
      'main',
      'kline',
      timeline,
    )

    expect(preview?.anchors[1]).toMatchObject({ time: 1_000, futureOffset: 3, price: 12 })
  })

  it('materializes the fourth anchor of a parallel-channel preview', () => {
    const preview = new PreviewRenderer().buildPreview(
      'parallel-channel',
      [
        { time: 500, price: 10 },
        { time: 1_000, price: 20 },
      ],
      { time: 1_500, price: 30 },
      'main',
      'kline',
      timeline,
    )

    // 第四个锚点 = 第三个 + 首两点的逻辑索引差（1），落在数据末尾之外 → 记为未来槽位。
    expect(preview?.anchors).toHaveLength(4)
    expect(preview?.anchors[3]).toMatchObject({ time: 1_500, futureOffset: 1, price: 40 })
  })

  it('materializes the mirrored second line of a disjoint-channel preview', () => {
    const preview = new PreviewRenderer().buildPreview(
      'disjoint-channel',
      [
        { time: 500, price: 100 },
        { time: 1_000, price: 140 },
      ],
      { time: 1_500, price: 20 },
      'main',
      'kline',
      timeline,
    )

    // 光标只提供价格：第二条线与首两点同 X、斜率取反，光标时间（1500）被忽略。
    expect(preview?.anchors).toHaveLength(4)
    expect(preview?.anchors[2]).toMatchObject({ time: 1_000, price: 20 })
    expect(preview?.anchors[3]).toMatchObject({ time: 500, price: 60 })
  })
})
