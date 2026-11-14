/** 轴菜单只按 axisId 操作；多轴必须显式选择，移动对象不改变选中的轴身份。 */

import { objectAxisId } from '@363045841yyt/klinechart-core'
import { PRICE_AXIS_RANGE_MODE, ScaleType } from '@363045841yyt/klinechart-core/config'
import { createMockChartController } from '@vue-src/__tests__/_mockController'
import { describe, expect, it } from 'vitest'
import { shallowRef } from 'vue'
import { usePriceAxisMenu } from '../usePriceAxisMenu.js'

describe('对象轴菜单', () => {
  it('独立对象轴使用统一命令和快捷入口，设置不写入其他轴', () => {
    const controller = createMockChartController()
    const menu = usePriceAxisMenu(shallowRef(controller), () => {})
    const id = objectAxisId('plugin:candle')
    menu.select('mainRightAxisTypeSetting', ScaleType.Percent)
    expect(controller.paneScaleTypes.peek().get(id)).toBe(ScaleType.Percent)
    menu.selectShortcut(menu.shortcuts[1]!)
    expect(controller.paneScaleTypes.peek().get(id)).toBe(ScaleType.Log)
    menu.selectShortcut(menu.shortcuts[0]!)
    expect(controller.panePriceAxisRanges.peek()[id]?.rangeMode).toBe(PRICE_AXIS_RANGE_MODE.HAND)
    menu.select('reset', 'reset-price-axis')
    expect(controller.resetAxisCalls()).toBe(1)
  })

  it('一个窗口含多轴时不默认选第一条，选择后只操作目标轴', () => {
    const controller = createMockChartController()
    const first = controller.objects.groups.peek()[0]!
    controller._setObjectGroups([
      {
        ...first,
        rows: [first.rows[0]!, { ...first.rows[0]!, objectId: 'indicator-b', kind: 'indicator' }],
      },
    ])
    const menu = usePriceAxisMenu(shallowRef(controller), () => {}, first.paneId)
    expect(
      menu.groups.value
        .find((group) => group.id === 'mainRightAxisTypeSetting')
        ?.items.every((item) => item.disabled),
    ).toBe(true)
    const selected = objectAxisId('indicator-b')
    menu.select('axis', selected)
    menu.select('mainRightAxisTypeSetting', ScaleType.Log)
    expect(controller.paneScaleTypes.peek().get(selected)).toBe(ScaleType.Log)
    expect(controller.paneScaleTypes.peek().has(objectAxisId('plugin:candle'))).toBe(false)
  })

  it('对象迁移后保留轴身份，窗口筛选只改变可选项', () => {
    const controller = createMockChartController()
    const menu = usePriceAxisMenu(shallowRef(controller), () => {})
    const groups = controller.objects.groups.peek()
    controller._setObjectGroups(
      groups.map((group) => ({
        ...group,
        paneId: 'pane-9',
        rows: group.rows.map((row) => ({ ...row, paneId: 'pane-9' })),
      })),
    )
    menu.select('mainRightAxisTypeSetting', ScaleType.Percent)
    expect(controller.paneScaleTypes.peek().get(objectAxisId('plugin:candle'))).toBe(
      ScaleType.Percent,
    )
  })
})
