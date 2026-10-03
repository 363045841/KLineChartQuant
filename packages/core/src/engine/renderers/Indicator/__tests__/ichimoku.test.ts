/**
 * 一目均衡表 Layer 测试：云层填充路径，以及按投影版本保留几何后的重放与失效。
 */
import { describe, expect, it, vi } from 'vitest'

import {
  createMockCanvasContext,
  createMockRenderContext,
  createMockStateReader,
} from '@/engine/__tests__/helpers/renderTestKit'
import type { IchimokuRenderState } from '@/engine/indicators/state/ichimokuState'
import type { RenderContext } from '@/foundation/plugin/index'
import { type CloudSeg, fillCloud, IchimokuDefinition } from '../ichimoku'

describe('fillCloud', () => {
  it('should include the bottom point of the last segment in the fill polygon', () => {
    const ctx = createMockCanvasContext()
    const segs: CloudSeg[] = [
      { x: 0, ya: 100, yb: 50, bull: true },
      { x: 1, ya: 95, yb: 55, bull: true },
      { x: 2, ya: 90, yb: 60, bull: true },
    ]

    fillCloud(ctx, segs, 'green', 'red', 0.15)

    // 底部回描最后一个 segment 时，必须包含 segs[2] 的 (x, yb)
    // 当前 bug：底部只回描到 end（segs[1]），跳过 segs[2] 的底边
    expect(ctx.lineTo).toHaveBeenCalledWith(segs[2]!.x, segs[2]!.yb)
  })
})

/** 全展示开关的一目均衡表渲染参数。 */
const PARAMS: IchimokuRenderState['params'] = {
  tenkanPeriod: 9,
  kijunPeriod: 26,
  spanBPeriod: 52,
  displacement: 26,
  showTenkan: true,
  showKijun: true,
  showSpanA: true,
  showSpanB: true,
  showCloud: true,
  showChikou: true,
}

/** 构造可观察轴映射调用次数的 pane 与 Layer。 */
function makeContext(state: IchimokuRenderState) {
  const priceRead = vi.fn((price: number) => price)
  const context = createMockRenderContext({
    pane: {
      id: 'main',
      top: 0,
      height: 400,
      priceRange: { minPrice: 90, maxPrice: 110 },
      yAxis: {
        getDisplayRange: () => ({ maxPrice: 110, minPrice: 90 }),
        priceToY: priceRead,
      },
    },
    data: Array.from({ length: 4 }, (_, index) => ({
      timestamp: index,
      open: 100,
      high: 105,
      low: 95,
      close: 102,
    })),
    dataRevision: 1,
    range: { start: 0, end: 4 },
    kLineCenters: [4, 14, 24, 34],
    kWidth: 8,
    kGap: 2,
    dpr: 1,
    paneWidth: 800,
    scrollLeft: 0,
    theme: 'dark',
    indicatorStateReader: createMockStateReader('ichimoku', state),
  })
  return {
    priceRead,
    context,
    layer: IchimokuDefinition.rendererFactory({ paneId: 'main', instanceId: 'ichimoku' }),
  }
}

/** 以主图身份调用一目均衡表 Layer.paint。 */
function paint(context: RenderContext): void {
  IchimokuDefinition.rendererFactory({ paneId: 'main', instanceId: 'ichimoku' }).paint({
    ...context,
    paneId: 'main',
    clear: false,
  })
}

describe('ichimoku retained projection', () => {
  it.each([4, 5, 6, 10])('draws future spans once when the viewport ends at %i', (end) => {
    const { context, priceRead } = makeContext({
      timestamp: 4,
      series: Array.from({ length: 6 }, (_, index) => ({
        spanA: 100 + index,
        spanB: 90 + index,
      })),
      params: { ...PARAMS, displacement: 2 },
      valueMin: 90,
      valueMax: 110,
      visibleMin: 90,
      visibleMax: 110,
    })
    // 可见槽位可越过行情末尾；中心坐标与未来区使用同一物理像素网格。
    const centers = Array.from({ length: end }, (_, index) => 5 + index * 9)
    paint({ ...context, range: { start: 0, end }, kLineCenters: centers })

    // 两条边界各六点，云层再投影各六点，任何槽位均不应重复收集。
    expect(priceRead).toHaveBeenCalledTimes(24)
    const spanLines = vi.mocked(context.ctx.lineTo).mock.calls.slice(-10)
    expect(spanLines).toEqual([
      ...Array.from({ length: 5 }, (_, index) => [14 + index * 9, 101 + index]),
      ...Array.from({ length: 5 }, (_, index) => [14 + index * 9, 91 + index]),
    ])
    expect(context.ctx.lineTo).toHaveBeenCalledTimes(21)
  })

  it('retains the projection across scroll and repaints with the current scroll offset', () => {
    const { priceRead, context, layer } = makeContext({
      timestamp: 4,
      series: [
        { tenkan: 100, kijun: 101, spanA: 102, spanB: 99, chikou: 98 },
        { tenkan: 101, kijun: 102, spanA: 103, spanB: 100, chikou: 99 },
        { tenkan: 102, kijun: 103, spanA: 104, spanB: 101, chikou: 100 },
        { tenkan: 103, kijun: 104, spanA: 105, spanB: 102, chikou: 101 },
      ],
      params: PARAMS,
      valueMin: 90,
      valueMax: 110,
      visibleMin: 95,
      visibleMax: 105,
    })

    layer.paint({ ...context, paneId: 'main', clear: false })
    const reads = priceRead.mock.calls.length
    expect(reads).toBeGreaterThan(0)

    layer.paint({
      ...context,
      paneId: 'main',
      clear: false,
      scrollLeft: 5,
      viewport: { scrollLeft: 5, plotWidth: 800, plotHeight: 400 },
    })

    // 滚动只改变重放偏移，不重建投影：轴映射次数不变。
    expect(priceRead).toHaveBeenCalledTimes(reads)
    expect(context.ctx.translate).toHaveBeenLastCalledWith(-5, 0)
  })

  it('rebuilds the projection when the series version changes', () => {
    const series = [{ tenkan: 100 }, { tenkan: 101 }, { tenkan: 102 }, { tenkan: 103 }]
    const base: IchimokuRenderState = {
      timestamp: 4,
      series,
      params: PARAMS,
      valueMin: 90,
      valueMax: 110,
      visibleMin: 95,
      visibleMax: 105,
    }
    const { priceRead, context, layer } = makeContext(base)
    paint(context)
    const reads = priceRead.mock.calls.length

    layer.paint({
      ...context,
      paneId: 'main',
      clear: false,
      indicatorStateReader: createMockStateReader('ichimoku', { ...base, timestamp: 5 }),
    })

    // series 序列版本变化必须重建，不能继续复用旧投影。
    expect(priceRead.mock.calls.length).toBeGreaterThan(reads)
  })
})
