/** 轴菜单只提交显式 axisId；同一窗口多轴时先选择轴，不猜测主轴或行情身份。 */
import {
  type ChartSettings,
  normalizeSettings,
  PRICE_AXIS_RANGE_MODE,
  ScaleType,
} from '@363045841yyt/klinechart-core/config'
import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
import type { DropMenuGroup } from '@vue-src/components/common/DropMenu.vue'
import { computed, type Ref, shallowRef } from 'vue'
import { useControllerSignal } from './useControllerSignal.js'

const GROUP = {
  AXIS: 'axis',
  TYPE: 'mainRightAxisTypeSetting',
  RANGE: 'mainPriceAxisRangeMode',
  RESET: 'reset',
  POSITION: 'priceAxisPosition',
} as const
const RESET_AXIS = 'reset-price-axis'

export interface PriceAxisShortcut {
  group: string
  on: string
  off: string
  label: string
  text: string
}

/** 传入 paneId 时只列出该窗口的轴，省略时列出图表全部对象轴。 */
export function usePriceAxisMenu(
  controller: Ref<ChartController | null>,
  applySettings: (settings: ChartSettings) => void,
  paneId?: string,
) {
  const settings = useControllerSignal(controller, (chart) => chart.settings, normalizeSettings)
  const objects = useControllerSignal(
    controller,
    (chart) => chart.objects.groups,
    () => [],
  )
  const scaleTypes = useControllerSignal<ReadonlyMap<string, ScaleType>>(
    controller,
    (chart) => chart.paneScaleTypes,
    () => new Map(),
  )
  const ranges = useControllerSignal<ReturnType<ChartController['panePriceAxisRanges']['peek']>>(
    controller,
    (chart) => chart.panePriceAxisRanges,
    () => ({}),
  )
  const selected = shallowRef<string | null>(null)
  const axes = computed(() => {
    objects.value
    return controller.value
      ? controller.value.axes
          .list()
          .filter((axis) => paneId === undefined || axis.paneId === paneId)
      : []
  })
  const axisId = computed(() => {
    if (selected.value !== null && axes.value.some((axis) => axis.axisId === selected.value))
      return selected.value
    return axes.value.length === 1 ? axes.value[0]!.axisId : null
  })
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
  const groups = computed<ReadonlyArray<DropMenuGroup>>(() => {
    const disabled = axisId.value === null
    const base =
      axisId.value === null ? null : controller.value!.axes.configuration(axisId.value).baseValue
    return [
      ...(axes.value.length > 1
        ? [
            {
              id: GROUP.AXIS,
              label: '坐标轴',
              items: axes.value.map((axis, index) => ({
                id: axis.axisId,
                label: `坐标轴 ${index + 1}`,
              })),
            },
          ]
        : []),
      {
        id: GROUP.TYPE,
        label: '轴类型',
        items: [
          { id: ScaleType.Log, label: '对数', disabled },
          { id: ScaleType.Linear, label: '数值', disabled },
          {
            id: ScaleType.Percent,
            label: base === null || base === 0 ? '百分比（需要基准值）' : '百分比',
            disabled: disabled || base === null || base === 0,
          },
        ],
      },
      {
        id: GROUP.RANGE,
        label: '纵轴模式',
        items: [
          { id: PRICE_AXIS_RANGE_MODE.AUTO, label: '自动', disabled },
          { id: PRICE_AXIS_RANGE_MODE.HAND, label: '锁定范围', disabled },
        ],
      },
      {
        id: GROUP.RESET,
        label: '重置',
        items: [{ id: RESET_AXIS, label: '重置坐标轴', disabled }],
      },
      {
        id: GROUP.POSITION,
        label: '位置',
        items: [
          { id: 'left', label: '左侧' },
          { id: 'right', label: '右侧' },
        ],
      },
    ]
  })

  /** 勾选状态直接读取指定轴的配置。 */
  function isSelected(groupId: string, itemId: string): boolean {
    if (groupId === GROUP.AXIS) return axisId.value === itemId
    if (groupId === GROUP.POSITION) return settings.value.priceAxisPosition === itemId
    if (axisId.value === null) return false
    scaleTypes.value
    ranges.value
    const configuration = controller.value!.axes.configuration(axisId.value)
    if (groupId === GROUP.TYPE) return configuration.scaleType === itemId
    if (groupId === GROUP.RANGE) return configuration.rangeMode === itemId
    return false
  }

  /** 界面未选择目标时按钮禁用；有效命令交给 Core API 校验后执行。 */
  function select(groupId: string, itemId: string): void {
    const chart = controller.value
    if (!chart) return
    if (groupId === GROUP.AXIS) {
      selected.value = itemId
      return
    }
    if (groupId === GROUP.POSITION && (itemId === 'left' || itemId === 'right')) {
      applySettings({ ...chart.settings.peek(), priceAxisPosition: itemId })
      return
    }
    const target = axisId.value
    if (target === null) return
    if (
      groupId === GROUP.TYPE &&
      (itemId === ScaleType.Log || itemId === ScaleType.Linear || itemId === ScaleType.Percent)
    )
      chart.axes.setScaleType(target, itemId)
    else if (
      groupId === GROUP.RANGE &&
      (itemId === PRICE_AXIS_RANGE_MODE.AUTO || itemId === PRICE_AXIS_RANGE_MODE.HAND)
    )
      chart.axes.setRangeMode(target, itemId)
    else if (groupId === GROUP.RESET && itemId === RESET_AXIS) chart.axes.resetRange(target)
  }

  function isShortcutSelected(shortcut: PriceAxisShortcut): boolean {
    return isSelected(shortcut.group, shortcut.on)
  }
  function selectShortcut(shortcut: PriceAxisShortcut): void {
    select(shortcut.group, isShortcutSelected(shortcut) ? shortcut.off : shortcut.on)
  }
  return { groups, select, isSelected, shortcuts, selectShortcut, isShortcutSelected }
}
