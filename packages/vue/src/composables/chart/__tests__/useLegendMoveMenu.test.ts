// 图例移动菜单：目标列表映射、按钮矩形定位，以及关闭事件与选中事件的先后顺序。
import type {
  ChartController,
  LegendAnchorRect,
  LegendMoveRequest,
} from '@363045841yyt/klinechart-core/controllers'
import { createMockChartController } from '@vue-src/__tests__/_mockController'
import { describe, expect, it, vi } from 'vitest'
import { shallowRef } from 'vue'
import { useLegendMoveMenu } from '../useLegendMoveMenu'

type MoveRequest = LegendMoveRequest & { anchor: LegendAnchorRect }

/** 真实目标形状：主图可用、已有副图禁用，覆盖渲染与执行两条分支。 */
function createRequest(): MoveRequest {
  return {
    action: 'move-to',
    id: 'sub_RSI:rsi',
    options: [
      { target: { kind: 'main' }, label: '移至主图', enabled: true },
      { target: { kind: 'pane', paneId: 'sub_MACD' }, label: '移至 MACD', enabled: false },
    ],
    anchor: { left: 40, top: 100, width: 22, height: 22 },
  }
}

/** 装配菜单与控制器替身；迁移只断言命令面入参。 */
function createFixture() {
  const controller = createMockChartController()
  const moveTo = vi.spyOn(controller.legend, 'moveTo').mockReturnValue(true)
  const menu = useLegendMoveMenu(shallowRef<ChartController | null>(controller))
  return { controller, moveTo, menu }
}

describe('图例移动指标菜单', () => {
  it('目标列表平铺为一个分组，坐标取触发按钮矩形并带普通下拉的间距', () => {
    const { menu } = createFixture()
    menu.show(createRequest())
    expect(menu.open.value).toBe(true)
    expect(menu.origin.value).toEqual({ x: 40, y: 100, width: 22, height: 22 })
    expect(menu.offset).toBe(4)
    expect(menu.groups.value).toEqual([
      {
        id: 'move-to',
        label: '',
        items: [
          { id: 'move-0', label: '移至主图', disabled: false },
          { id: 'move-1', label: '移至 MACD', disabled: true },
        ],
      },
    ])
  })

  it('选中可用目标后执行迁移并关闭菜单', () => {
    const { menu, moveTo } = createFixture()
    menu.show(createRequest())
    menu.select('move-0')
    expect(moveTo).toHaveBeenCalledExactlyOnceWith('sub_RSI:rsi', { kind: 'main' })
    expect(menu.open.value).toBe(false)
  })

  it('禁用目标不执行迁移；关闭事件先于选中事件时仍能解析目标', () => {
    const { menu, moveTo } = createFixture()
    menu.show(createRequest())
    menu.select('move-1')
    expect(moveTo).not.toHaveBeenCalled()

    // DropMenu 选中时先发 update:open(false) 再发 select，目标解析不能依赖打开状态。
    menu.onUpdateOpen(false)
    expect(menu.open.value).toBe(false)
    menu.select('move-0')
    expect(moveTo).toHaveBeenCalledExactlyOnceWith('sub_RSI:rsi', { kind: 'main' })
  })
})
