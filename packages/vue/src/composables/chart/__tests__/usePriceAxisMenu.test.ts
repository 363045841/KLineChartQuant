/** 轴菜单绑定单条轴：K 线口径只出现在主价格轴，自动开关与口径是两个维度。 */
import { objectAxisId, PRICE_SERIES_AXIS_ID } from '@363045841yyt/klinechart-core'
import {
  AUTO_PRICE_AXIS_RANGE_MODES,
  type ChartSettings,
  PRICE_AXIS_RANGE_MODE,
  ScaleType,
} from '@363045841yyt/klinechart-core/config'
import type { ChartController, PaneGeometry } from '@363045841yyt/klinechart-core/controllers'
import { createMockChartController } from '@vue-src/__tests__/_mockController'
import { describe, expect, it } from 'vitest'
import { shallowRef } from 'vue'
import { usePriceAxisMenu } from '../usePriceAxisMenu.js'

const INDICATOR_AXIS = objectAxisId('indicator-b')
const AUTO_TOGGLE = 'auto-range'

/** 原有菜单测试适配完整提交视图；替身按需派生，不维护第二份配置。 */
function createMenu(
  controller: ChartController,
  apply: (settings: ChartSettings) => void,
  axisId: string,
) {
  const read = (): ReadonlyArray<PaneGeometry> => [
    {
      id: 'main',
      top: 0,
      height: 600,
      axisWidth: 80,
      axisColumns: [PRICE_SERIES_AXIS_ID, INDICATOR_AXIS].map((id, index) => ({
        axisId: id,
        left: index * 40,
        width: 40,
        configuration: controller.axes.configuration(id),
      })),
    },
  ]
  const paneGeometry = Object.assign(read, {
    peek: read,
    subscribe(listener: () => void) {
      const disposers = [
        controller.paneScaleTypes.subscribe(listener),
        controller.panePriceAxisRanges.subscribe(listener),
      ]
      return () => {
        for (const dispose of disposers) dispose()
      }
    },
  })
  return usePriceAxisMenu(shallowRef({ ...controller, paneGeometry }), apply, () => axisId)
}

/** 纵轴模式分组的菜单项；两个用例共用同一读取入口。 */
function rangeItems(menu: ReturnType<typeof createMenu>) {
  return menu.groups.value.find((group) => group.id === 'rangeMode')!.items
}

describe('轴菜单', () => {
  it('命令与快捷按钮只作用于绑定轴', () => {
    const controller = createMockChartController()
    const menu = createMenu(controller, () => {}, INDICATOR_AXIS)
    menu.select('scaleType', ScaleType.Log)
    expect(controller.paneScaleTypes.peek().get(INDICATOR_AXIS)).toBe(ScaleType.Log)
    expect(controller.paneScaleTypes.peek().has(PRICE_SERIES_AXIS_ID)).toBe(false)
    menu.selectShortcut(menu.shortcuts[0]!)
    expect(controller.panePriceAxisRanges.peek()[INDICATOR_AXIS]?.rangeMode).toBe(
      PRICE_AXIS_RANGE_MODE.Manual,
    )
    expect(menu.isShortcutSelected(menu.shortcuts[0]!)).toBe(false)
    menu.select('reset', 'reset-price-axis')
    expect(controller.resetAxisCalls()).toBe(1)
  })

  it.each([
    {
      name: 'K 线主价格轴',
      axisId: PRICE_SERIES_AXIS_ID,
      chartMode: 'kline' as const,
      modes: [...AUTO_PRICE_AXIS_RANGE_MODES],
    },
    { name: 'K 线指标轴', axisId: INDICATOR_AXIS, chartMode: 'kline' as const, modes: [] },
    { name: '分时主价格轴', axisId: PRICE_SERIES_AXIS_ID, chartMode: 'timeshare' as const, modes: [] },
  ])('$name 按轴配置渲染可选口径', ({ axisId, chartMode, modes }) => {
    const controller = createMockChartController()
    controller._setChartMode(chartMode)
    const menu = createMenu(controller, () => {}, axisId)
    expect(rangeItems(menu).map((item) => item.id)).toEqual([AUTO_TOGGLE, ...modes])
  })

  it('取消自动进入手动，重新勾选回到全并', () => {
    const controller = createMockChartController()
    const menu = createMenu(controller, () => {}, PRICE_SERIES_AXIS_ID)
    expect(rangeItems(menu).find((item) => item.id === AUTO_TOGGLE)?.checked).toBe(true)
    menu.select('rangeMode', AUTO_TOGGLE)
    expect(controller.panePriceAxisRanges.peek()[PRICE_SERIES_AXIS_ID]?.rangeMode).toBe(
      PRICE_AXIS_RANGE_MODE.Manual,
    )
    expect(rangeItems(menu).find((item) => item.id === AUTO_TOGGLE)?.checked).toBe(false)
    expect(
      rangeItems(menu).find((item) => item.id === PRICE_AXIS_RANGE_MODE.Ratio)?.disabled,
    ).toBe(true)
    menu.select('rangeMode', AUTO_TOGGLE)
    expect(controller.panePriceAxisRanges.peek()[PRICE_SERIES_AXIS_ID]?.rangeMode).toBe(
      PRICE_AXIS_RANGE_MODE.All,
    )
  })

  it('选择口径只写绑定轴，并保持自动', () => {
    const controller = createMockChartController()
    const menu = createMenu(controller, () => {}, PRICE_SERIES_AXIS_ID)
    menu.select('rangeMode', PRICE_AXIS_RANGE_MODE.Ratio)
    expect(controller.panePriceAxisRanges.peek()[PRICE_SERIES_AXIS_ID]?.rangeMode).toBe(
      PRICE_AXIS_RANGE_MODE.Ratio,
    )
    expect(rangeItems(menu).find((item) => item.id === PRICE_AXIS_RANGE_MODE.Ratio)?.checked).toBe(
      true,
    )
    expect(rangeItems(menu).find((item) => item.id === AUTO_TOGGLE)?.checked).toBe(true)
  })
})
