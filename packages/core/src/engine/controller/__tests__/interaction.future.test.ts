// @vitest-environment jsdom
// 槽位交互测试：K 线负/未来槽位由中心网格外推，分时只命中真实交易中心，空白槽位不出 OHLC。
import { describe, expect, it } from 'vitest'

import { InteractionController } from '@/core/controller/interaction'
import { type ChartDataView, ChartDataViewId } from '@/foundation/types/chartView'

import {
  createChartStub,
  createInteractionBars,
  createInteractionTimeShare,
  createMockInteractionState,
} from './helpers/interactionTestKit'

/**
 * 10 根数据、dpr=1 的测试场景。
 * 几何：kWidth=7 → kWidthPx=7、gapPx=3，中心网格 origin=6、step=10。
 */
function createFutureScene(args?: {
  dataView?: ChartDataView
  /** 通过公开的 onSettingsChanged 入口切换 tooltip 位置模式（如 'adaptive'）。 */
  tooltipPosition?: 'adaptive'
}) {
  const isTimeShare = args?.dataView === ChartDataViewId.TimeShare
  const data = isTimeShare ? createInteractionTimeShare(10) : createInteractionBars(10)
  const chart = createChartStub({
    dpr: 1,
    plotWidth: 300,
    plotHeight: 160,
    data,
    dataView: args?.dataView,
  })
  const interaction = new InteractionController(chart as never, createMockInteractionState())
  if (args?.tooltipPosition) {
    interaction.onSettingsChanged({}, { tooltipPosition: args.tooltipPosition })
  }
  interaction.setViewSnapshot(chart.kernel.viewport.readonly.viewSnapshot.peek())
  return interaction
}

function hoverAt(interaction: InteractionController, clientX: number) {
  interaction.onPointerMove({ clientX, clientY: 40, isPrimary: true } as PointerEvent)
  interaction.flushPendingHover()
}

describe('InteractionController future-slot crosshair', () => {
  it('lets the crosshair snap onto an extrapolated future slot but keeps hoveredIndex null', () => {
    const interaction = createFutureScene()

    // world=150 → 最近槽位 14，中心 146；未来槽位无 OHLC，不产生 hover。
    hoverAt(interaction, 150)

    expect(interaction.crosshairIndex).toBe(14)
    expect(interaction.crosshairPos?.x).toBe(146)
    expect(interaction.hoveredIndex).toBeNull()
  })

  it.each([
    { label: '普通位置', clientX: 55, expectedIndex: 5 },
    { label: '精确落在末根中心', clientX: 95, expectedIndex: 9 },
  ])(
    'snaps and hovers a real bar inside the data region（$label）',
    ({ clientX, expectedIndex }) => {
      const interaction = createFutureScene()

      hoverAt(interaction, clientX)

      expect(interaction.crosshairIndex).toBe(expectedIndex)
      expect(interaction.hoveredIndex).toBe(expectedIndex)
    },
  )

  it('hits only real timeshare centers and never extrapolates', () => {
    const interaction = createFutureScene({ dataView: ChartDataViewId.TimeShare })

    // 分钟槽位中心为 30..39；world=150 超过末根中心，回夹到最后一根。
    hoverAt(interaction, 150)

    expect(interaction.crosshairIndex).toBe(9)
  })

  it('过去槽位不依赖可见数据中心，保留十字线并禁止 OHLC hover', () => {
    const chart = createChartStub({ dpr: 1, plotWidth: 300, plotHeight: 160, scrollLeft: -100 })
    const interaction = new InteractionController(chart as never, createMockInteractionState())
    interaction.setViewSnapshot(chart.kernel.viewport.readonly.viewSnapshot.peek())

    expect(interaction.getLogicalIndexAtScreenX(30)).toBe(-8)

    hoverAt(interaction, 3)
    expect(interaction.crosshairIndex).toBe(-10)
    expect(interaction.crosshairPos?.x).toBe(6)
    expect(interaction.hoveredIndex).toBeNull()
  })
})

describe('InteractionController future-slot adaptive tooltip guard', () => {
  it('keeps the crosshair on a future slot but leaves hoveredIndex null in adaptive mode', () => {
    const interaction = createFutureScene({ tooltipPosition: 'adaptive' })

    hoverAt(interaction, 150)

    expect(interaction.crosshairIndex).toBe(14)
    expect(interaction.hoveredIndex).toBeNull()
  })

  it('still hovers a real bar in the data region in adaptive mode', () => {
    const interaction = createFutureScene({ tooltipPosition: 'adaptive' })

    hoverAt(interaction, 55)

    expect(interaction.hoveredIndex).toBe(5)
  })
})
