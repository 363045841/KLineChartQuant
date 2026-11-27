/** 左下栏按钮：共享按钮控件、派生高亮、分时置灰。 */
import type { SymbolSpec } from '@363045841yyt/klinechart-core'
import type { InstrumentDescriptor } from '@363045841yyt/klinechart-core/market-data'
import { KLinePeriod } from '@363045841yyt/klinechart-core/market-data'
import { mount } from '@vue/test-utils'
import { createMockChartController } from '@vue-src/__tests__/_mockController'
import { describe, expect, it, vi } from 'vitest'
import RangePresetBar from './RangePresetBar.vue'

const INSTRUMENT: InstrumentDescriptor = {
  id: 'mock:MAIN',
  source: 'mock',
  symbol: 'MAIN',
  name: 'MAIN',
  instrumentType: 'stock',
  exchange: 'CN',
  sessionId: 'CN',
  capabilities: {},
}
const SPEC: SymbolSpec = { instrument: INSTRUMENT, period: KLinePeriod.Daily }

/** 构造带预置能力的替身控制器。 */
function setup() {
  const controller = createMockChartController()
  controller._setSymbols([SPEC])
  const ensure = vi.fn(async () => 'covered' as const)
  const frame = vi.fn()
  Object.assign(controller, {
    getPresetWindow: () => ({ from: 1, to: 2 }),
    ensureCoverageFrom: ensure,
    frameTimeRange: frame,
  })
  const wrapper = mount(RangePresetBar, {
    props: { controller, supportedPeriods: [KLinePeriod.Min60, KLinePeriod.Daily] },
  })
  return { controller, ensure, frame, wrapper }
}

describe('RangePresetBar', () => {
  it('renders every preset through the shared button and marks the active one', async () => {
    const { controller, wrapper } = setup()
    const buttons = wrapper.findAll('.base-button')
    expect(buttons).toHaveLength(9)
    expect(buttons.every((button) => button.classes().includes('base-button--chip'))).toBe(true)

    // 高亮来自 Core 派生的可见窗口，不是组件内部状态。
    controller._setActiveRangePreset('1M')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[aria-pressed="true"]').text()).toBe('1M')
  })

  it('applies the preset through the controller entry points', async () => {
    const { controller, ensure, frame, wrapper } = setup()
    const setMarket = vi.spyOn(controller, 'setPrimaryMarket')

    await wrapper.findAll('.base-button')[2]!.trigger('click')

    expect(setMarket).toHaveBeenCalledWith({ ...SPEC, period: KLinePeriod.Min60 })
    expect(ensure).toHaveBeenCalledWith(1)
    expect(frame).toHaveBeenCalledWith(1, 2)
  })

  it.each(['timeshare', 'fiveDayTimeShare'] as const)(
    'greys out every button outside the K-line view (%s)',
    async (mode) => {
      const { controller, wrapper } = setup()
      controller._setChartMode(mode)
      await wrapper.vm.$nextTick()

      const buttons = wrapper.findAll('.base-button')
      expect(buttons.every((button) => (button.element as HTMLButtonElement).disabled)).toBe(true)
    },
  )
})
