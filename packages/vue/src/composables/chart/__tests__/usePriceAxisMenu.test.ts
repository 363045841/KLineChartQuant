/** 轴菜单绑定单条轴：命令不跨轴，仅缩放价格图表只出现在主价格轴。 */
import { objectAxisId, PRICE_SERIES_AXIS_ID } from '@363045841yyt/klinechart-core'
import { PRICE_AXIS_RANGE_MODE, ScaleType } from '@363045841yyt/klinechart-core/config'
import { createMockChartController } from '@vue-src/__tests__/_mockController'
import { describe, expect, it, vi } from 'vitest'
import { shallowRef } from 'vue'
import { usePriceAxisMenu } from '../usePriceAxisMenu.js'

const INDICATOR_AXIS = objectAxisId('indicator-b')
const PRICE_ONLY = 'mainPriceAxisPriceOnly'

describe('轴菜单', () => {
  it('命令与快捷按钮只作用于绑定轴', () => {
    const controller = createMockChartController()
    const menu = usePriceAxisMenu(shallowRef(controller), () => {}, INDICATOR_AXIS)
    menu.select('scaleType', ScaleType.Log)
    expect(controller.paneScaleTypes.peek().get(INDICATOR_AXIS)).toBe(ScaleType.Log)
    expect(controller.paneScaleTypes.peek().has(PRICE_SERIES_AXIS_ID)).toBe(false)
    menu.selectShortcut(menu.shortcuts[0]!)
    expect(controller.panePriceAxisRanges.peek()[INDICATOR_AXIS]?.rangeMode).toBe(
      PRICE_AXIS_RANGE_MODE.HAND,
    )
    // 快捷按钮的按下态与菜单同源，状态一变就跟着变。
    expect(menu.isShortcutSelected(menu.shortcuts[0]!)).toBe(false)
    menu.select('reset', 'reset-price-axis')
    expect(controller.resetAxisCalls()).toBe(1)
  })

  it('仅缩放价格图表只出现在主价格轴', () => {
    const controller = createMockChartController()
    const apply = vi.fn()
    const priceMenu = usePriceAxisMenu(shallowRef(controller), apply, PRICE_SERIES_AXIS_ID)
    const priceItem = priceMenu.groups.value
      .find((group) => group.id === 'rangeMode')!
      .items.find((item) => item.id === PRICE_ONLY)!
    // 自动与仅缩放价格图表是两个独立勾，可以同时为真。
    const autoItem = priceMenu.groups.value
      .find((group) => group.id === 'rangeMode')!
      .items.find((item) => item.id === PRICE_AXIS_RANGE_MODE.AUTO)!
    expect(autoItem.checked).toBe(true)
    expect(priceItem.checked).toBe(false)
    priceMenu.select('rangeMode', PRICE_ONLY)
    expect(apply).toHaveBeenCalledWith(expect.objectContaining({ mainPriceAxisPriceOnly: true }))

    const indicatorMenu = usePriceAxisMenu(shallowRef(controller), apply, INDICATOR_AXIS)
    expect(
      indicatorMenu.groups.value.flatMap((group) => group.items).some((item) => item.id === PRICE_ONLY),
    ).toBe(false)
    expect(indicatorMenu.groups.value.some((group) => group.id === 'priceAxisPosition')).toBe(false)
  })

  it('自动是开关：取消勾选进入锁定范围，仅缩放价格图表任何模式都可切换', () => {
    const controller = createMockChartController()
    const menu = usePriceAxisMenu(shallowRef(controller), () => {}, PRICE_SERIES_AXIS_ID)
    const rangeItems = () => menu.groups.value.find((group) => group.id === 'rangeMode')!.items
    expect(rangeItems().find((item) => item.id === PRICE_AXIS_RANGE_MODE.AUTO)?.checked).toBe(true)

    // 取消自动即冻结当前范围，交给手动拖拽。
    menu.select('rangeMode', PRICE_AXIS_RANGE_MODE.AUTO)
    expect(controller.panePriceAxisRanges.peek()[PRICE_SERIES_AXIS_ID]?.rangeMode).toBe(
      PRICE_AXIS_RANGE_MODE.HAND,
    )
    expect(rangeItems().find((item) => item.id === PRICE_AXIS_RANGE_MODE.AUTO)?.checked).toBe(false)
    expect(rangeItems().find((item) => item.id === PRICE_ONLY)?.disabled).toBe(false)
  })
})
