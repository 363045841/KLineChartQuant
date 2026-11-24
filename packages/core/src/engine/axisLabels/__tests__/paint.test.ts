/** 轴列绘制：附注行（note）与主行的不透明度差异。 */
import { describe, expect, it, vi } from 'vitest'
import { createMockCanvasContext } from '@/engine/__tests__/helpers/renderTestKit'
import { paintAxisLabels } from '../impl/paint.js'
import type { AxisColumn, ValueAxisLabel } from '../types.js'

/** 1 价格 = 10 像素的值轴列；标签铺满列宽，因此只需纵向几何。 */
function valueColumn(): AxisColumn {
  return {
    dpr: 1,
    width: 60,
    height: 200,
    offsetX: 0,
    projection: {
      kind: 'value',
      yFor: (value) => value * 10,
      textFor: (value) => value.toFixed(2),
    },
    palette: { text: '#111', onBackground: '#fff' },
  }
}

/** 最新价钉住标签：带底色，note 为收盘倒计时。 */
function lastPrice(note?: string): ValueAxisLabel {
  return { kind: 'value', axisId: 'price', role: 'marker', value: 10, background: '#f00', note }
}

/** 记录每次 fillText 的文本与绘制时的 globalAlpha。 */
function recordPaintedTexts(ctx: ReturnType<typeof createMockCanvasContext>) {
  const painted: Array<{ text: string; alpha: number }> = []
  vi.mocked(ctx.fillText).mockImplementation((text) => {
    painted.push({ text, alpha: ctx.globalAlpha })
  })
  return painted
}

describe('paintAxisLabels', () => {
  it('note 行与主行同色，只降低不透明度', () => {
    const ctx = createMockCanvasContext()
    const painted = recordPaintedTexts(ctx)

    paintAxisLabels(ctx, [lastPrice('04:59')], valueColumn())

    expect(painted).toEqual([
      { text: '10.00', alpha: 1 },
      { text: '04:59', alpha: 0.7 },
    ])
  })

  it('没有 note 的标签只有主行，保持不透明', () => {
    const ctx = createMockCanvasContext()
    const painted = recordPaintedTexts(ctx)

    paintAxisLabels(ctx, [lastPrice()], valueColumn())

    expect(painted).toEqual([{ text: '10.00', alpha: 1 }])
  })
})
