// 价格轴菜单的分组与命令入口，设置写入复用 controller，重置保留模式偏好。
import {
  type ChartSettings,
  PRICE_AXIS_RANGE_MODE,
  resolveSettings,
  ScaleType,
} from '@363045841yyt/klinechart-core/config'
import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
import type { Ref } from 'vue'
import type { DropMenuGroup } from '../../components/DropMenu.vue'
import { useControllerSignal } from './useControllerSignal.js'

const GROUP = {
  TYPE: 'mainRightAxisTypeSetting',
  RANGE: 'mainPriceAxisRangeMode',
  RESET: 'reset',
  POSITION: 'priceAxisPosition',
} as const
const RESET_AXIS = 'reset-price-axis'

/** 快捷按钮：绑定所属菜单分组与开/关值，按下态与切换命令都按该分组解析。 */
export interface PriceAxisShortcut {
  group: string
  on: string
  off: string
  label: string
  text: string
}

/** 提供菜单与价格轴快捷入口，参数为 controller 与已有设置更新入口。 */
export function usePriceAxisMenu(
  controller: Ref<ChartController | null>,
  applySettings: (settings: ChartSettings) => void,
) {
  const settings = useControllerSignal(controller, (chart) => chart.settings, resolveSettings)
  // 自动写纵轴模式，对数是轴类型，两者分属不同设置，互不排斥；再次点击切回非激活值。
  const shortcuts: ReadonlyArray<PriceAxisShortcut> = [
    {
      group: GROUP.RANGE,
      on: PRICE_AXIS_RANGE_MODE.AUTO,
      off: PRICE_AXIS_RANGE_MODE.HAND,
      label: '自动',
      text: 'A',
    },
    { group: GROUP.TYPE, on: ScaleType.Log, off: ScaleType.Linear, label: '对数', text: 'L' },
  ]

  /** 快捷按钮复用菜单命令：未激活则写入开值，已激活则切回关值。 */
  function selectShortcut(shortcut: PriceAxisShortcut): void {
    select(shortcut.group, isShortcutSelected(shortcut) ? shortcut.off : shortcut.on)
  }

  /** 快捷按钮按下态来自其所属分组的开值。 */
  function isShortcutSelected(shortcut: PriceAxisShortcut): boolean {
    return isSelected(shortcut.group, shortcut.on)
  }

  const groups: ReadonlyArray<DropMenuGroup> = [
    {
      id: GROUP.TYPE,
      label: '轴类型',
      items: [
        { id: ScaleType.Log, label: '对数' },
        { id: ScaleType.Linear, label: '价格' },
        { id: ScaleType.Percent, label: '百分比' },
      ],
    },
    {
      id: GROUP.RANGE,
      label: '纵轴模式',
      items: [
        { id: PRICE_AXIS_RANGE_MODE.AUTO, label: '常规' },
        { id: PRICE_AXIS_RANGE_MODE.HAND, label: '锁定价格对 K 线比例' },
      ],
    },
    { id: GROUP.RESET, label: '重置', items: [{ id: RESET_AXIS, label: '重置价格轴' }] },
    {
      id: GROUP.POSITION,
      label: '位置',
      items: [
        { id: 'left', label: '左侧' },
        { id: 'right', label: '右侧' },
      ],
    },
  ]

  /** 从 controller 当前设置判断勾选项，重置组不属于模式选项。 */
  function isSelected(groupId: string, itemId: string): boolean {
    if (groupId === GROUP.TYPE) return settings.value.mainRightAxisTypeSetting === itemId
    if (groupId === GROUP.RANGE) return settings.value.mainPriceAxisRangeMode === itemId
    if (groupId === GROUP.POSITION) return settings.value.priceAxisPosition === itemId
    return false
  }

  /** 按菜单分组执行设置或重置；合并 kernel 当前设置，避免覆盖其他偏好。 */
  function select(groupId: string, itemId: string): void {
    const chart = controller.value
    if (!chart) return
    if (groupId === GROUP.RESET && itemId === RESET_AXIS) {
      chart.resetMainPriceAxis()
    } else if (
      groupId === GROUP.TYPE &&
      (itemId === ScaleType.Log || itemId === ScaleType.Linear || itemId === ScaleType.Percent)
    ) {
      applySettings({ ...chart.settings.peek(), mainRightAxisTypeSetting: itemId })
    } else if (
      groupId === GROUP.RANGE &&
      (itemId === PRICE_AXIS_RANGE_MODE.AUTO || itemId === PRICE_AXIS_RANGE_MODE.HAND)
    ) {
      applySettings({ ...chart.settings.peek(), mainPriceAxisRangeMode: itemId })
    } else if (groupId === GROUP.POSITION && (itemId === 'left' || itemId === 'right')) {
      applySettings({ ...chart.settings.peek(), priceAxisPosition: itemId })
    }
  }

  return { groups, select, isSelected, shortcuts, selectShortcut, isShortcutSelected }
}
