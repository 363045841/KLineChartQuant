// @vitest-environment jsdom
// 未来区槽位交互测试：十字线放行进入未来槽位、无 OHLC 不命中 tooltip、分时保持回夹旧行为。
import { describe, expect, it } from 'vitest'

import { InteractionController } from '@/core/controller/interaction'
import { type ChartDataView, ChartDataViewId } from '@/foundation/types/chartView'
import type { KLineData } from '@/types/price'

import { createChartStub, createMockInteractionState } from './helpers/interactionTestKit'

/** 10 根数据、unit 10px、dpr=1 的未来区测试场景。 */
function createFutureScene(args?: {
  dataView?: ChartDataView
  /** 通过公开的 onSettingsChanged 入口切换 tooltip 位置模式（如 'adaptive'）。 */
  tooltipPosition?: 'adaptive'
}) {
  const data: KLineData[] = Array.from({ length: 10 }, (_, i) => ({
    timestamp: 20260101 + i,
    open: 10,
    high: 12,
    low: 8,
    close: 11,
    volume: 1000,
  }))
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
  interaction.setKLinePositions(
    Array.from({ length: 10 }, (_, i) => i * 10),
    { start: 0, end: 12 },
    10,
    Array.from({ length: 10 }, (_, i) => i * 10 + 5),
  )
  return interaction
}

function hoverAt(interaction: InteractionController, clientX: number) {
  interaction.onPointerMove({ clientX, clientY: 40, isPrimary: true } as PointerEvent)
  interaction.flushPendingHover()
}

describe('InteractionController future-slot crosshair', () => {
  it('lets the crosshair snap onto an extrapolated future slot but keeps hoveredIndex null', () => {
    const interaction = createFutureScene()

    // worldX=150，最后一根中心 95，尾步长 10 → 9 + ceil(55/10) = 15
    hoverAt(interaction, 150)

    expect(interaction.crosshairIndex).toBe(15)
    expect(interaction.crosshairPos?.x).toBe(155)
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

  it('clamps to the last bar in timeshare view instead of extrapolating', () => {
    const interaction = createFutureScene({ dataView: ChartDataViewId.TimeShare })

    hoverAt(interaction, 150)

    expect(interaction.crosshairIndex).toBe(9)
  })

  it('clears the crosshair and hit-test on a zero tail step instead of falling back', () => {
    const chart = createChartStub({ dpr: 1, plotWidth: 300, plotHeight: 160 })
    const interaction = new InteractionController(chart as never, createMockInteractionState())
    // centers=[5,5] → 尾步长 0：数据区内可命中，超出最后一根必须清空而非外推 / fallback
    interaction.setKLinePositions([0, 10], { start: 0, end: 2 }, 10, [5, 5])

    expect(interaction.getLogicalIndexAtScreenX(30)).toBeNull()

    hoverAt(interaction, 3)
    expect(interaction.crosshairIndex).toBe(0)

    hoverAt(interaction, 150)
    expect(interaction.crosshairIndex).toBeNull()
    expect(interaction.hoveredIndex).toBeNull()
  })
})

describe('InteractionController future-slot adaptive tooltip guard', () => {
  it('keeps the crosshair on a future slot but leaves hoveredIndex null in adaptive mode', () => {
    const interaction = createFutureScene({ tooltipPosition: 'adaptive' })

    hoverAt(interaction, 150)

    expect(interaction.crosshairIndex).toBe(15)
    expect(interaction.hoveredIndex).toBeNull()
  })

  it('still hovers a real bar in the data region in adaptive mode', () => {
    const interaction = createFutureScene({ tooltipPosition: 'adaptive' })

    hoverAt(interaction, 55)

    expect(interaction.hoveredIndex).toBe(5)
  })
})
