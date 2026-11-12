// 锁定垂直光标：来源是槽位时间与序列槽距，未来槽位按常规槽距外推，数据重置后仍保留。
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { InteractionController } from '../interaction'
import {
  createChartStub,
  createInteractionBars,
  createMockInteractionState,
} from './helpers/interactionTestKit'

describe('InteractionController 锁定垂直光标', () => {
  it('记录槽位时间与序列槽距，数据重置后保留，解锁后清除', () => {
    const bars = createInteractionBars(5)
    const chart = createChartStub({ dpr: 1, plotWidth: 300, plotHeight: 160, data: bars })
    const interaction = new InteractionController(chart as never, createMockInteractionState())

    expect(interaction.lockCrosshairAt(2)).toBe(true)
    expect(interaction.crosshairLock).toEqual({ timestamp: bars[2]!.timestamp, intervalMs: 1 })

    // 切周期/切换标的走同一个 reset；锁不能随瞬时十字线一起清空。
    interaction.reset()
    expect(interaction.crosshairLock).not.toBeNull()

    interaction.unlockCrosshair()
    expect(interaction.crosshairLock).toBeNull()
  })

  it('未来槽位用序列槽距外推时间，负槽位与空数据拒绝', () => {
    const bars = createInteractionBars(3)
    const chart = createChartStub({ dpr: 1, plotWidth: 300, plotHeight: 160, data: bars })
    const interaction = new InteractionController(chart as never, createMockInteractionState())

    expect(interaction.lockCrosshairAt(5)).toBe(true)
    expect(interaction.crosshairLock).toEqual({
      timestamp: bars[2]!.timestamp + 3,
      intervalMs: 1,
    })

    interaction.unlockCrosshair()
    expect(interaction.lockCrosshairAt(-1)).toBe(false)
    expect(interaction.crosshairLock).toBeNull()

    const empty = createChartStub({ dpr: 1, plotWidth: 300, plotHeight: 160, data: [] })
    const emptyInteraction = new InteractionController(empty as never, createMockInteractionState())
    expect(emptyInteraction.lockCrosshairAt(0)).toBe(false)
  })
})
