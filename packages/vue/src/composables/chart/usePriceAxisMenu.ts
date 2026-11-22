/** 轴菜单绑定一条已提交的轴：目标由宿主控件所在的轴列决定，菜单不提供轴选择。 */
import { PRICE_SERIES_AXIS_ID } from '@363045841yyt/klinechart-core'
import {
  AUTO_PRICE_AXIS_RANGE_MODES,
  type AutoPriceAxisRangeMode,
  type ChartSettings,
  normalizeSettings,
  PRICE_AXIS_RANGE_MODE,
  ScaleType,
} from '@363045841yyt/klinechart-core/config'
import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
import type { DropMenuGroup, DropMenuItem } from '@vue-src/components/common/menu/DropMenu.vue'
import { computed, type Ref } from 'vue'
import { useControllerSignal } from './useControllerSignal.js'

const GROUP = {
  TYPE: 'scaleType',
  RANGE: 'rangeMode',
  RESET: 'reset',
  POSITION: 'priceAxisPosition',
} as const
const RESET_AXIS = 'reset-price-axis'
/** 自动开关：勾选回到自动拟合，取消进入手动；本身不是一种范围口径。 */
const AUTO_TOGGLE = 'auto-range'

/** 自动口径的界面文案；顺序由共用常量决定。 */
const RANGE_LABELS: Readonly<Record<AutoPriceAxisRangeMode, string>> = {
  [PRICE_AXIS_RANGE_MODE.All]: '全部数据',
  [PRICE_AXIS_RANGE_MODE.Bars]: '仅缩放价格图表',
  [PRICE_AXIS_RANGE_MODE.Ratio]: '固定 K 线占比',
}

/** 轴菜单的快捷按钮；勾选态与命令都由绑定轴决定。 */
export interface PriceAxisShortcut {
  group: string
  on: string
  off: string
  label: string
  text: string
}

/**
 * 生成单条轴的类型、范围、重置与位置命令。
 *
 * @param controller 图表控制器
 * @param applySettings 写回图表级设置（价格轴位置）
 * @param axisId 读取宿主当前目标；不保存初始化时的轴身份
 */
export function usePriceAxisMenu(
  controller: Ref<ChartController | null>,
  applySettings: (settings: ChartSettings) => void,
  axisId: () => string | undefined,
) {
  const settings = useControllerSignal(controller, (chart) => chart.settings, normalizeSettings)
  const panes = useControllerSignal(
    controller,
    (chart) => chart.paneGeometry,
    () => [],
  )
  // 身份、配置和失效均来自同一次提交；旧控件尚未卸载时也不会反查已注销轴。
  const axis = computed(() =>
    panes.value.flatMap((pane) => pane.axisColumns).find((column) => column.axisId === axisId()),
  )
  /** 仅主价格轴承载行情价格，指标轴没有可拟合的 K 线。 */
  const isPriceAxis = computed(() => axis.value?.axisId === PRICE_SERIES_AXIS_ID)
  const shortcuts: ReadonlyArray<PriceAxisShortcut> = [
    { group: GROUP.RANGE, on: AUTO_TOGGLE, off: PRICE_AXIS_RANGE_MODE.Manual, label: '自动', text: 'A' },
    { group: GROUP.TYPE, on: ScaleType.Log, off: ScaleType.Linear, label: '对数', text: 'L' },
  ]

  const groups = computed<ReadonlyArray<DropMenuGroup>>(() => {
    const config = axis.value?.configuration
    const blocked = config === undefined
    const manual = config?.rangeMode === PRICE_AXIS_RANGE_MODE.Manual
    const base = config?.baseValue ?? null
    const percentReady = base !== null && base !== 0
    const rangeItems: DropMenuItem[] = [
      {
        id: AUTO_TOGGLE,
        label: '自动',
        disabled: blocked,
        checked: !manual,
        selection: 'checkbox',
      },
    ]
    // 口径由轴的配置下发：只有多个自动口径可选时才需要单选组，单一由「自动」开关表达。
    if (config) {
      const autoModes = config.availableRangeModes.filter(
        (mode): mode is AutoPriceAxisRangeMode => mode !== PRICE_AXIS_RANGE_MODE.Manual,
      )
      if (autoModes.length > 1)
        for (const mode of autoModes)
          rangeItems.push({
            id: mode,
            label: RANGE_LABELS[mode],
            disabled: manual,
            checked: config.rangeMode === mode,
            selection: 'radio',
          })
    }
    const positionGroup: DropMenuGroup[] = isPriceAxis.value
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

  /** 轴命令只作用于绑定轴；价格轴位置是整图设置。 */
  function select(groupId: string, itemId: string): void {
    const chart = controller.value
    const target = axis.value
    if (!chart || !target) return
    const { axisId: targetAxisId, configuration: config } = target
    if (groupId === GROUP.POSITION && (itemId === 'left' || itemId === 'right')) {
      applySettings({ ...settings.value, priceAxisPosition: itemId })
      return
    }
    if (groupId === GROUP.RANGE && itemId === AUTO_TOGGLE) {
      // 自动是开关：取消勾选冻结当前范围，重新勾选回到全并口径。
      chart.axes.setRangeMode(
        targetAxisId,
        config.rangeMode === PRICE_AXIS_RANGE_MODE.Manual
          ? PRICE_AXIS_RANGE_MODE.All
          : PRICE_AXIS_RANGE_MODE.Manual,
      )
      return
    }
    if (groupId === GROUP.RANGE && itemId === PRICE_AXIS_RANGE_MODE.Manual) {
      chart.axes.setRangeMode(targetAxisId, PRICE_AXIS_RANGE_MODE.Manual)
      return
    }
    if (groupId === GROUP.RANGE && isAutoRangeItem(itemId)) {
      chart.axes.setRangeMode(targetAxisId, itemId)
      return
    }
    if (
      groupId === GROUP.TYPE &&
      (itemId === ScaleType.Log || itemId === ScaleType.Linear || itemId === ScaleType.Percent)
    )
      chart.axes.setScaleType(targetAxisId, itemId)
    else if (groupId === GROUP.RESET && itemId === RESET_AXIS) chart.axes.resetRange(targetAxisId)
  }

  /** 菜单项 id 即口径取值，命令入口只接受已声明的自动口径。 */
  function isAutoRangeItem(itemId: string): itemId is AutoPriceAxisRangeMode {
    return (AUTO_PRICE_AXIS_RANGE_MODES as ReadonlyArray<string>).includes(itemId)
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
