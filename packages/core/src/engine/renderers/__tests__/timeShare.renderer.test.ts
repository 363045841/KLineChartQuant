import { describe, expect, it } from 'vitest'
import {
  createMockCanvasContext,
  type MockCanvasContext,
} from '@/engine/__tests__/helpers/renderTestKit'
import {
  createTimeSharePoints,
  createTimeShareRenderContext,
  createTimeShareSegment,
} from '@/engine/__tests__/helpers/timeShareTestKit'
import type { RenderContext, TimeShareSegmentGeometry } from '@/plugin'
import type { TimeShareData } from '@/types/price'
import { createTimeShareLayer } from '../timeShare'

function createTsData(n = 4): TimeShareData[] {
  return createTimeSharePoints(n, (i) => ({
    timestamp: 1_700_000_000_000 + i * 60_000,
    price: 10 + i * 0.1,
    average: 10 + i * 0.05,
    volume: 100 + i,
    amount: 1000 + i,
  }))
}

interface ContextOptions {
  baseline?: number | null
  segments?: ReadonlyArray<TimeShareSegmentGeometry>
}

function createContext(
  ctx: MockCanvasContext,
  data: TimeShareData[],
  options: ContextOptions = {},
): RenderContext {
  return createTimeShareRenderContext({ ctx, data, ...options })
}

/** 以主图身份调用分时 Layer.paint。 */
function paint(context: RenderContext): void {
  createTimeShareLayer().paint({ ...context, paneId: 'main', clear: false })
}

describe('timeShare renderer line width', () => {
  it('draws price and average lines at 1px logical width', () => {
    const ctx = createMockCanvasContext()
    paint(createContext(ctx, createTsData()))

    // stroke 顺序：昨收虚线 → 现价折线 → 均价折线
    expect(ctx.strokeLineWidths).toEqual([1, 1, 1])
  })
})

describe('timeShare renderer baseline and gaps', () => {
  it('still draws price and average lines when the baseline is missing', () => {
    const ctx = createMockCanvasContext()
    paint(createContext(ctx, createTsData(), { baseline: null }))

    expect(ctx.strokeLineWidths).toEqual([1, 1])
    expect(ctx.createLinearGradient).not.toHaveBeenCalled()
  })

  it('does not connect points across a missing slot', () => {
    const ctx = createMockCanvasContext()
    paint(
      createContext(ctx, createTsData(), {
        segments: [
          createTimeShareSegment({ dataStartIndex: 0, dataEndIndex: 2, startX: 5, endX: 15 }),
          createTimeShareSegment({ dataStartIndex: 3, dataEndIndex: 4, startX: 35, endX: 35 }),
        ],
      }),
    )

    expect(
      ctx.strokedPaths.some(
        (path) => path.some((point) => point.x === 15) && path.some((point) => point.x === 35),
      ),
    ).toBe(false)
  })
})
