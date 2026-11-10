/** 验证绘图预览保留交互锚点的未来槽位语义，并物化组合图元的全部持久化锚点。 */
import { describe, expect, it } from 'vitest'

import { PreviewRenderer } from '../impl/PreviewRenderer'

describe('PreviewRenderer', () => {
  it('预览保留公共坐标接口解析的绝对时间', () => {
    const preview = new PreviewRenderer().buildPreview(
      'trend-line',
      [{ time: 1_000, price: 10 }],
      { time: 4_000, price: 12 },
      'main',
      'kline',
    )

    expect(preview?.anchors[1]).toMatchObject({ time: 4_000, price: 12 })
  })

  it('materializes the parallel-channel second line on the first two bar times', () => {
    const preview = new PreviewRenderer().buildPreview(
      'parallel-channel',
      [
        { time: 500, price: 10 },
        { time: 1_000, price: 20 },
      ],
      { time: 1_500, price: 30 },
      'main',
      'kline',
    )

    // 光标只提供价格并落在次点 X 上，光标时间（1500）被忽略；首点 X 的派生点按首两点增量反向回推。
    expect(preview?.anchors).toHaveLength(4)
    expect(preview?.anchors[2]).toMatchObject({ time: 500, price: 20 })
    expect(preview?.anchors[3]).toMatchObject({ time: 1_000, price: 30 })
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
    )

    // 光标只提供价格：第二条线与首两点同 X、斜率取反，光标时间（1500）被忽略。
    expect(preview?.anchors).toHaveLength(4)
    expect(preview?.anchors[2]).toMatchObject({ time: 1_000, price: 20 })
    expect(preview?.anchors[3]).toMatchObject({ time: 500, price: 60 })
  })

  it('materializes the four clockwise corners of a rectangle preview', () => {
    const preview = new PreviewRenderer().buildPreview(
      'rectangle',
      [{ time: 2_000, price: 40 }],
      { time: 500, price: 140 },
      'main',
      'kline',
    )

    // 预览同样按持久化四角（左上、右上、右下、左下）输出，绘制端无需再区分输入锚点数。
    expect(preview?.anchors).toHaveLength(4)
    expect(preview?.anchors[0]).toMatchObject({ time: 500, price: 140 })
    expect(preview?.anchors[1]).toMatchObject({ time: 2_000, price: 140 })
    expect(preview?.anchors[2]).toMatchObject({ time: 2_000, price: 40 })
    expect(preview?.anchors[3]).toMatchObject({ time: 500, price: 40 })
  })

  it('渲染工具自身的线型，通道额外保留填充透明度', () => {
    const trend = new PreviewRenderer().buildPreview(
      'trend-line',
      [{ time: 500, price: 10 }],
      { time: 1_000, price: 20 },
      'main',
      'kline',
    )
    expect(trend?.style?.strokeStyle).toBe('solid')

    const channel = new PreviewRenderer().buildPreview(
      'parallel-channel',
      [
        { time: 500, price: 10 },
        { time: 1_000, price: 20 },
      ],
      { time: 1_500, price: 30 },
      'main',
      'kline',
    )
    expect(channel?.style?.strokeStyle).toBe('solid')
    expect(channel?.style?.fillOpacity).toBeGreaterThan(0)
  })
})
