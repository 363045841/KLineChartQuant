// 锁定垂直光标：来源是 K 线时间与序列槽距，数据重置后仍保留，只有显式解锁才清除。
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { InteractionController } from '../interaction'
import {
  createChartStub,
  createInteractionBars,
  createMockInteractionState,
} from './helpers/interactionTestKit'

describe('InteractionController 锁定垂直光标', () => {
  it('记录 K 线时间与序列槽距，数据重置后保留，解锁后清除', () => {
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

  it('越界索引与未来槽位不建立锁定', () => {
    const chart = createChartStub({
      dpr: 1,
      plotWidth: 300,
      plotHeight: 160,
      data: createInteractionBars(3),
    })
    const interaction = new InteractionController(chart as never, createMockInteractionState())

    expect(interaction.lockCrosshairAt(3)).toBe(false)
    expect(interaction.lockCrosshairAt(-1)).toBe(false)
    expect(interaction.crosshairLock).toBeNull()
  })
})
