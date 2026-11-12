// 验证右键菜单的分组、十字线价格快照与命令分发；复制价格走剪贴板并给出反馈。
import {
  type CommandRegistry,
  createCommandRegistry,
  createIdleInteractionSnapshot,
  type DrawingObject,
} from '@363045841yyt/klinechart-core'
import { drawingToolStyle } from '@363045841yyt/klinechart-core/engine/drawing'
import { flushPromises } from '@vue/test-utils'
import { createMockChartController } from '@vue-src/__tests__/_mockController'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { shallowRef } from 'vue'
import { CHART_CONTEXT_MENU_ITEM, useChartContextMenu } from '../useChartContextMenu'

const toastShow = vi.hoisted(() => vi.fn())

vi.mock('@vue-src/composables/toast/useToast.js', () => ({
  useToast: () => ({ show: toastShow }),
}))

interface Fixture {
  readonly controller: ReturnType<typeof createMockChartController>
  readonly registry: CommandRegistry
  readonly openSettings: ReturnType<typeof vi.fn>
  readonly resetChart: ReturnType<typeof vi.fn>
  readonly clearAllIndicators: ReturnType<typeof vi.fn>
  readonly lockCrosshairAt: ReturnType<typeof vi.fn>
  readonly unlockCrosshair: ReturnType<typeof vi.fn>
  readonly createDrawing: ReturnType<typeof vi.fn>
  readonly menu: ReturnType<typeof useChartContextMenu>
}

/** 用真实命令注册表装配菜单，动作分别落到控制器与设置入口。 */
function createFixture(): Fixture {
  const controller = createMockChartController()
  const resetChart = vi.fn()
  controller.resetChart = resetChart
  const clearAllIndicators = vi.fn()
  controller.clearAllIndicators = clearAllIndicators
  const createDrawing = vi.fn((): DrawingObject => ({}) as DrawingObject)
  controller.createDrawing = createDrawing
  const lockCrosshairAt = vi.fn()
  controller.lockCrosshairAt = lockCrosshairAt
  const unlockCrosshair = vi.fn()
  controller.unlockCrosshair = unlockCrosshair
  const openSettings = vi.fn()
  const registry = createCommandRegistry()
  registry.register([
    {
      id: CHART_CONTEXT_MENU_ITEM.RESET,
      group: 'view',
      title: { zh: '重置图表', en: 'Reset chart' },
      shortcut: 'Alt+R',
      run: () => controller.resetChart(),
    },
    {
      id: CHART_CONTEXT_MENU_ITEM.SETTINGS,
      group: 'settings',
      title: { zh: '打开设置', en: 'Open settings' },
      shortcut: 'Mod+,',
      run: openSettings,
    },
  ])
  const menu = useChartContextMenu({ controller: shallowRef(controller), commands: registry })
  return {
    controller,
    registry,
    openSettings,
    resetChart,
    clearAllIndicators,
    lockCrosshairAt,
    unlockCrosshair,
    createDrawing,
    menu,
  }
}

/** 展平全部分组，避免用例依赖分组边界。 */
function items(menu: ReturnType<typeof useChartContextMenu>) {
  return menu.groups.value.flatMap((group) => group.items)
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'clipboard')
  toastShow.mockReset()
  vi.restoreAllMocks()
})

describe('图表右键菜单', () => {
  it('打开时快照十字线价格，作为复制项文案', () => {
    const { controller, menu } = createFixture()
    controller._setInteractionState({
      ...createIdleInteractionSnapshot(),
      crosshairPrice: 123.456,
    })
    menu.captureCrosshair()
    expect(items(menu).map((item) => item.label)).toEqual([
      '重置图表',
      '复制价格 123.46',
      '在 123.46 绘制水平线',
      '锁定垂直光标',
      '移除所有指标',
      '设置',
    ])
  })

  it('按 group 键拆分分组，并在右侧展示命令快捷键', () => {
    const { menu, registry } = createFixture()
    expect(menu.groups.value.map((group) => group.id)).toEqual([
      'view',
      'price',
      'crosshair',
      'indicator',
      'settings',
    ])
    expect(menu.groups.value[1]?.items).toHaveLength(2)
    expect(
      menu.groups.value
        .filter((_, index) => index !== 1)
        .every((group) => group.items.length === 1),
    ).toBe(true)
    expect(items(menu)[0]?.shortcut).toBe(registry.formatShortcut('Alt+R'))
    expect(items(menu)[1]?.shortcut).toBeUndefined()
    expect(items(menu)[2]?.shortcut).toBeUndefined()
    expect(items(menu)[3]?.shortcut).toBeUndefined()
    expect(items(menu)[4]?.shortcut).toBeUndefined()
    expect(items(menu)[5]?.shortcut).toBe(registry.formatShortcut('Mod+,'))
  })

  it('没有十字线价格时复制项禁用，且不写入剪贴板', async () => {
    const { controller, menu } = createFixture()
    controller._setInteractionState(createIdleInteractionSnapshot())
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    menu.captureCrosshair()
    expect(items(menu)[1]?.label).toBe('复制价格')
    expect(items(menu)[1]?.disabled).toBe(true)
    menu.select(CHART_CONTEXT_MENU_ITEM.COPY_PRICE)
    await flushPromises()
    expect(writeText).not.toHaveBeenCalled()
  })

  it('复制价格写入两位小数且成功时不弹提示', async () => {
    const { controller, menu } = createFixture()
    controller._setInteractionState({
      ...createIdleInteractionSnapshot(),
      crosshairPrice: 99.999,
    })
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    menu.captureCrosshair()
    menu.select(CHART_CONTEXT_MENU_ITEM.COPY_PRICE)
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith('100.00')
    expect(toastShow).not.toHaveBeenCalled()
  })

  it('重置与设置分别执行导航和设置使用的同一命令', async () => {
    const { menu, resetChart, openSettings } = createFixture()
    menu.select(CHART_CONTEXT_MENU_ITEM.RESET)
    await flushPromises()
    expect(resetChart).toHaveBeenCalledOnce()
    menu.select(CHART_CONTEXT_MENU_ITEM.SETTINGS)
    await flushPromises()
    expect(openSettings).toHaveBeenCalledOnce()
  })

  it('没有指标时移除项禁用，有指标时调用控制器的清空命令', () => {
    const { controller, menu, clearAllIndicators } = createFixture()
    expect(items(menu)[4]?.disabled).toBe(true)
    controller._setIndicators([
      {
        id: 'instance-1',
        definitionId: 'MA',
        label: 'MA',
        name: 'MA',
        role: 'main',
        ordinal: 0,
        params: {},
      },
    ])
    expect(items(menu)[4]?.disabled).toBe(false)
    menu.select(CHART_CONTEXT_MENU_ITEM.CLEAR_INDICATORS)
    expect(clearAllIndicators).toHaveBeenCalledOnce()
  })

  it('锁定项：无十字线禁用，锁定时显示对勾，选择时按快照锁定或解除', () => {
    const { controller, menu, lockCrosshairAt, unlockCrosshair } = createFixture()
    controller._setInteractionState(createIdleInteractionSnapshot())
    menu.captureCrosshair()
    expect(items(menu)[3]?.disabled).toBe(true)
    expect(items(menu)[3]?.icon).toBeUndefined()

    controller._setInteractionState({
      ...createIdleInteractionSnapshot(),
      crosshairIndex: 7,
      crosshairPrice: 10,
    })
    menu.captureCrosshair()
    expect(items(menu)[3]?.disabled).toBe(false)
    menu.select(CHART_CONTEXT_MENU_ITEM.LOCK_CROSSHAIR)
    expect(lockCrosshairAt).toHaveBeenCalledWith(7)
    expect(unlockCrosshair).not.toHaveBeenCalled()

    controller._setInteractionState({
      ...createIdleInteractionSnapshot(),
      crosshairLock: { timestamp: 1, intervalMs: 60_000 },
    })
    expect(items(menu)[3]?.disabled).toBe(false)
    expect(items(menu)[3]?.icon).toBeDefined()
    menu.select(CHART_CONTEXT_MENU_ITEM.LOCK_CROSSHAIR)
    expect(unlockCrosshair).toHaveBeenCalledOnce()
    expect(lockCrosshairAt).toHaveBeenCalledOnce()
  })

  it('用快照价格在十字线所在 pane 创建水平线', () => {
    const { controller, menu, createDrawing } = createFixture()
    controller._setInteractionState({
      ...createIdleInteractionSnapshot(),
      activePaneId: 'main',
      crosshairPrice: 12.345,
    })
    menu.captureCrosshair()
    expect(items(menu)[2]?.label).toBe('在 12.35 绘制水平线')
    expect(items(menu)[2]?.disabled).toBe(false)
    menu.select(CHART_CONTEXT_MENU_ITEM.DRAW_HORIZONTAL_LINE)
    expect(createDrawing).toHaveBeenCalledWith({
      kind: 'horizontal-line',
      paneId: 'main',
      anchors: [{ price: 12.345 }],
      style: drawingToolStyle(),
    })
  })

  it('没有价格或没有十字线所在 pane 时不创建水平线', () => {
    const { controller, menu, createDrawing } = createFixture()
    controller._setInteractionState({
      ...createIdleInteractionSnapshot(),
      activePaneId: 'main',
    })
    menu.captureCrosshair()
    expect(items(menu)[2]?.disabled).toBe(true)
    menu.select(CHART_CONTEXT_MENU_ITEM.DRAW_HORIZONTAL_LINE)

    controller._setInteractionState({
      ...createIdleInteractionSnapshot(),
      crosshairPrice: 10,
    })
    menu.captureCrosshair()
    expect(items(menu)[2]?.disabled).toBe(true)
    menu.select(CHART_CONTEXT_MENU_ITEM.DRAW_HORIZONTAL_LINE)
    expect(createDrawing).not.toHaveBeenCalled()
  })
})
