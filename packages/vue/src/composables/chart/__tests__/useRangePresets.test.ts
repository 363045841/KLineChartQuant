/** 左下栏预置编排：挑周期 → 整体替换 → 等覆盖 → 装进屏幕。 */
import type { SymbolSpec } from '@363045841yyt/klinechart-core/controllers'
import type { InstrumentDescriptor } from '@363045841yyt/klinechart-core/market-data'
import { KLinePeriod } from '@363045841yyt/klinechart-core/market-data'
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { createMockChartController } from '../../../__tests__/_mockController'
import { useRangePresets } from '../useRangePresets'

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

/** 构造控制器与编排实例；用例只声明差异。 */
function setup(periods: readonly KLinePeriod[] = [KLinePeriod.Min60, KLinePeriod.Daily]) {
  const controller = createMockChartController()
  controller._setSymbols([SPEC])
  const ensure = vi.fn(async () => 'covered' as const)
  const frame = vi.fn()
  Object.assign(controller, {
    ensureCoverageFrom: ensure,
    frameTimeRange: frame,
    getPresetWindow: (preset: string) =>
      preset === 'ALL' ? { from: 1, to: 9 } : { from: 1_000, to: 2_000 },
  })
  const controllerRef = ref(controller)
  const api = useRangePresets(controllerRef, () => periods)
  return { controller, ensure, frame, api, controllerRef }
}

describe('useRangePresets', () => {
  it.each([
    {
      preset: '1M',
      current: KLinePeriod.Daily,
      supported: [KLinePeriod.Min60, KLinePeriod.Daily],
      window: { from: 1_000, to: 2_000 },
      expected: KLinePeriod.Min60,
    },
    {
      preset: 'YTD',
      current: KLinePeriod.Min30,
      supported: [KLinePeriod.Min30, KLinePeriod.Daily],
      // 11 月的 YTD 约 326 天：30 分钟放不下，应选日线。
      window: { from: 0, to: 326 * 86_400_000 },
      expected: KLinePeriod.Daily,
    },
    {
      preset: '5Y',
      current: KLinePeriod.Daily,
      supported: [KLinePeriod.Daily],
      window: { from: 1_000, to: 2_000 },
      expected: null,
    },
  ])('derives the period from the real window span ($preset)', async (input) => {
    const { controller, ensure, frame, api } = setup(input.supported)
    const setMarket = vi.spyOn(controller, 'setPrimaryMarket')
    controller._setSymbols([{ ...SPEC, period: input.current }])
    Object.assign(controller, { getPresetWindow: () => input.window })

    await api.apply(input.preset as '1M')

    if (input.expected === null) expect(setMarket).not.toHaveBeenCalled()
    else expect(setMarket).toHaveBeenCalledWith({ ...SPEC, period: input.expected })
    expect(ensure).toHaveBeenCalledWith(input.window.from)
    expect(frame).toHaveBeenCalledWith(input.window.from, input.window.to)
  })

  it('frames the full history on the coarsest period and derives the period from it', async () => {
    const { controller, ensure, frame, api } = setup([KLinePeriod.Min60, KLinePeriod.Daily])
    const setMarket = vi.spyOn(controller, 'setPrimaryMarket')
    controller._setData([
      { timestamp: 0, open: 1, high: 1, low: 1, close: 1 },
      { timestamp: 300 * 86_400_000, open: 1, high: 1, low: 1, close: 1 },
    ])
    Object.assign(controller, {
      getPresetWindow: (preset: string) =>
        preset === 'ALL' ? { from: 0, to: 300 * 86_400_000 } : { from: 1_000, to: 2_000 },
    })

    await api.apply('ALL')

    // 当前已是日线（最粗支持周期），不再切换；跨度 300 天推导出的周期也是日线。
    expect(setMarket).not.toHaveBeenCalled()
    expect(ensure).toHaveBeenCalledWith(Number.NEGATIVE_INFINITY)
    expect(frame).toHaveBeenCalledWith(0, 300 * 86_400_000)
  })

  it.each(['timeshare', 'fiveDayTimeShare'] as const)(
    'disables the bar outside the K-line view (%s)',
    async (mode) => {
      const { controller, api } = setup()
      controller._setChartMode(mode)
      await Promise.resolve()
      expect(api.disabled.value).toBe(true)
    },
  )

  it('ignores a second click while the first is running', async () => {
    const { ensure, api } = setup()
    let release!: () => void
    ensure.mockImplementation(
      () =>
        new Promise<'covered'>((resolve) => {
          release = () => resolve('covered')
        }),
    )

    const first = api.apply('1M')
    await Promise.resolve()
    // 运行期间整排禁点，第二次点击被忽略。
    expect(api.disabled.value).toBe(true)
    await api.apply('3M')
    expect(ensure).toHaveBeenCalledTimes(1)

    release()
    await first
    expect(api.disabled.value).toBe(false)
  })
})
