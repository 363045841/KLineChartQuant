// 验证价格轴菜单的分组、勾选与命令写入：切换只覆盖目标字段，重置走独立控制器入口。
import {
  type ChartSettings,
  PRICE_AXIS_RANGE_MODE,
  ScaleType,
} from '@363045841yyt/klinechart-core/config'
import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
import { describe, expect, it } from 'vitest'
import { shallowRef } from 'vue'
import { createMockChartController } from '../../__tests__/_mockController'
import { usePriceAxisMenu } from '../chart/usePriceAxisMenu'

/** 以给定设置创建菜单，并记录 applySettings 写入的设置快照。 */
function createMenu(settings: ChartSettings) {
  const controller = createMockChartController()
  controller._setSettings(settings)
  const applied: ChartSettings[] = []
  const menu = usePriceAxisMenu(shallowRef<ChartController | null>(controller), (next) =>
    applied.push(next),
  )
  return { controller, applied, menu }
}

/** 按分组 label 取分组，避免用例硬编码内部 id。 */
function group(menu: ReturnType<typeof usePriceAxisMenu>, label: string) {
  const found = menu.groups.find((item) => item.label === label)
  if (!found) throw new Error(`missing menu group: ${label}`)
  return found
}

describe('价格轴菜单', () => {
  it('快捷按钮与轴类型分组一一对应，并标记当前轴类型', () => {
    const { menu } = createMenu({ mainRightAxisTypeSetting: ScaleType.Log })
    expect(menu.shortcuts.map((shortcut) => shortcut.text)).toEqual(['A', 'L', '%'])
    expect(menu.shortcuts.map((shortcut) => shortcut.id)).toEqual([
      ScaleType.Linear,
      ScaleType.Log,
      ScaleType.Percent,
    ])
    expect(menu.isAxisTypeSelected(ScaleType.Log)).toBe(true)
    expect(menu.isAxisTypeSelected(ScaleType.Linear)).toBe(false)
  })

  it('切换轴类型只覆盖该字段并沿用当前设置', () => {
    const { menu, applied } = createMenu({
      mainRightAxisTypeSetting: ScaleType.Log,
      mainPriceAxisRangeMode: PRICE_AXIS_RANGE_MODE.HAND,
      priceAxisPosition: 'left',
    })
    menu.selectAxisType(ScaleType.Percent)
    expect(applied).toEqual([
      {
        mainRightAxisTypeSetting: ScaleType.Percent,
        mainPriceAxisRangeMode: PRICE_AXIS_RANGE_MODE.HAND,
        priceAxisPosition: 'left',
      },
    ])
  })

  it('切换纵轴模式与摆放位置分别写入对应字段', () => {
    const { menu, applied } = createMenu({ mainRightAxisTypeSetting: ScaleType.Linear })
    menu.select(group(menu, '纵轴模式').id, PRICE_AXIS_RANGE_MODE.HAND)
    menu.select(group(menu, '位置').id, 'left')
    expect(applied).toEqual([
      {
        mainRightAxisTypeSetting: ScaleType.Linear,
        mainPriceAxisRangeMode: PRICE_AXIS_RANGE_MODE.HAND,
      },
      { mainRightAxisTypeSetting: ScaleType.Linear, priceAxisPosition: 'left' },
    ])
  })

  it('重置调用控制器入口且不写设置', () => {
    const { menu, applied, controller } = createMenu({
      mainRightAxisTypeSetting: ScaleType.Linear,
    })
    const reset = group(menu, '重置')
    menu.select(reset.id, reset.items[0]!.id)
    expect(controller.resetMainPriceAxisCalls()).toBe(1)
    expect(applied).toEqual([])
  })

  it('暴露四个分组并按当前设置勾选', () => {
    const { menu } = createMenu({
      mainRightAxisTypeSetting: ScaleType.Percent,
      mainPriceAxisRangeMode: PRICE_AXIS_RANGE_MODE.HAND,
      priceAxisPosition: 'left',
    })
    expect(menu.groups.map((item) => item.label)).toEqual(['轴类型', '纵轴模式', '重置', '位置'])
    expect(menu.isSelected(group(menu, '轴类型').id, ScaleType.Percent)).toBe(true)
    expect(menu.isSelected(group(menu, '轴类型').id, ScaleType.Linear)).toBe(false)
    expect(menu.isSelected(group(menu, '位置').id, 'left')).toBe(true)
    expect(menu.isSelected(group(menu, '位置').id, 'right')).toBe(false)
  })
})
