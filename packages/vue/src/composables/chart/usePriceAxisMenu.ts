/** 轴菜单绑定一条已提交的轴：目标由宿主控件所在的轴列决定，菜单不提供轴选择。 */
import { PRICE_SERIES_AXIS_ID } from '@363045841yyt/klinechart-core'
import {
  type ChartSettings,
  normalizeSettings,
  PRICE_AXIS_RANGE_MODE,
  ScaleType,
} from '@363045841yyt/klinechart-core/config'
import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
import type { DropMenuGroup, DropMenuItem } from '@vue-src/components/common/DropMenu.vue'
import { computed, type Ref } from 'vue'
import { useControllerSignal } from './useControllerSignal.js'

const GROUP = {
  TYPE: 'scaleType',
  RANGE: 'rangeMode',
  RESET: 'reset',
  POSITION: 'priceAxisPosition',
} as const
const RESET_AXIS = 'reset-price-axis'
/** 仅缩放价格图表：整图一个设置，只对主价格轴生效。 */
const PRICE_ONLY = 'mainPriceAxisPriceOnly'

/** 轴菜单的快捷按钮；勾选态与命令都由绑定轴决定。 */
export interface PriceAxisShortcut {
  group: string
  on: string
  off: string
  label: string
  text: string
}

type AxisConfiguration = ReturnType<ChartController['axes']['configuration']>

/**
 * 生成单条轴的类型、范围、重置与位置命令。
 *
 * @param controller 图表控制器
 * @param applySettings 写回图表级设置（位置与仅缩放价格图表）
 * @param axisId 宿主控件所在列的轴身份
 */
export function usePriceAxisMenu(
  controller: Ref<ChartController | null>,
  applySettings: (settings: ChartSettings) => void,
  axisId: string,
) {
  const settings = useControllerSignal(controller, (chart) => chart.settings, normalizeSettings)
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
  /** 仅主价格轴承载行情价格，指标轴没有可拟合的 K 线。 */
  const isPriceAxis = axisId === PRICE_SERIES_AXIS_ID
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

  /** 绑定轴的运行时配置；没有控制器时菜单整体禁用。 */
  function configuration(): AxisConfiguration | null {
    return controller.value ? controller.value.axes.configuration(axisId) : null
  }

  const groups = computed<ReadonlyArray<DropMenuGroup>>(() => {
    // 订阅轴配置信号，配置变化后重建勾选态与禁用态。
    scaleTypes.value
    ranges.value
    const config = configuration()
    const blocked = config === null
    const base = config?.baseValue ?? null
    const percentReady = base !== null && base !== 0
    const rangeItems: DropMenuItem[] = [
      {
        id: PRICE_AXIS_RANGE_MODE.AUTO,
        label: '自动',
        disabled: blocked,
        checked: config?.rangeMode === PRICE_AXIS_RANGE_MODE.AUTO,
        selection: 'checkbox',
      },
    ]
    if (isPriceAxis) {
      // 自动范围下的口径：锁定范围时不影响，但随时可改。
      rangeItems.push({
        id: PRICE_ONLY,
        label: '仅缩放价格图表',
        checked: settings.value.mainPriceAxisPriceOnly === true,
        selection: 'checkbox',
        disabled: blocked,
      })
    }
    const positionGroup: DropMenuGroup[] = isPriceAxis
      ? [
          {
            id: GROUP.POSITION,
            label: '位置',
            items: [
              {
                id: 'left',
                label: '左侧',
                checked: settings.value.priceAxisPosition === 'left',
                selection: 'radio',
              },
              {
                id: 'right',
                label: '右侧',
                checked: settings.value.priceAxisPosition === 'right',
                selection: 'radio',
              },
            ],
          },
        ]
      : []
    return [
      {
        id: GROUP.TYPE,
        label: '轴类型',
        items: [
          {
            id: ScaleType.Log,
            label: '对数',
            disabled: blocked,
            checked: config?.scaleType === ScaleType.Log,
            selection: 'radio',
          },
          {
            id: ScaleType.Linear,
            label: '数值',
            disabled: blocked,
            checked: config?.scaleType === ScaleType.Linear,
            selection: 'radio',
          },
          {
            id: ScaleType.Percent,
            label: percentReady ? '百分比' : '百分比（需要基准值）',
            disabled: blocked || !percentReady,
            checked: config?.scaleType === ScaleType.Percent,
            selection: 'radio',
          },
        ],
      },
      { id: GROUP.RANGE, label: '纵轴模式', items: rangeItems },
      {
        id: GROUP.RESET,
        label: '重置',
        items: [{ id: RESET_AXIS, label: '重置坐标轴', disabled: blocked }],
      },
      ...positionGroup,
    ]
  })

  /** 轴命令只作用于绑定轴；位置与仅缩放价格图表是整图设置。 */
  function select(groupId: string, itemId: string): void {
    const chart = controller.value
    if (!chart) return
    if (groupId === GROUP.POSITION && (itemId === 'left' || itemId === 'right')) {
      applySettings({ ...settings.value, priceAxisPosition: itemId })
      return
    }
    if (groupId === GROUP.RANGE && itemId === PRICE_ONLY) {
      applySettings({
        ...settings.value,
        mainPriceAxisPriceOnly: !settings.value.mainPriceAxisPriceOnly,
      })
      return
    }
    const config = chart.axes.configuration(axisId)
    if (
      groupId === GROUP.TYPE &&
      (itemId === ScaleType.Log || itemId === ScaleType.Linear || itemId === ScaleType.Percent)
    )
      chart.axes.setScaleType(axisId, itemId)
    else if (groupId === GROUP.RANGE && itemId === PRICE_AXIS_RANGE_MODE.AUTO) {
      // 自动本身是开关：勾选即每帧拟合，取消即冻结当前范围交给手动拖拽。
      chart.axes.setRangeMode(
        axisId,
        config.rangeMode === PRICE_AXIS_RANGE_MODE.AUTO
          ? PRICE_AXIS_RANGE_MODE.HAND
          : PRICE_AXIS_RANGE_MODE.AUTO,
      )
    } else if (groupId === GROUP.RANGE && itemId === PRICE_AXIS_RANGE_MODE.HAND)
      chart.axes.setRangeMode(axisId, PRICE_AXIS_RANGE_MODE.HAND)
    else if (groupId === GROUP.RESET && itemId === RESET_AXIS) chart.axes.resetRange(axisId)
  }

  /** 快捷按钮的按下态与菜单同源：读菜单数据里的 checked，不另起一条状态读取路径。 */
  function isShortcutSelected(shortcut: PriceAxisShortcut): boolean {
    const group = groups.value.find((candidate) => candidate.id === shortcut.group)
    return group?.items.some((item) => item.id === shortcut.on && item.checked === true) === true
  }
  function selectShortcut(shortcut: PriceAxisShortcut): void {
    select(shortcut.group, isShortcutSelected(shortcut) ? shortcut.off : shortcut.on)
  }
  return { groups, select, shortcuts, selectShortcut, isShortcutSelected }
}
