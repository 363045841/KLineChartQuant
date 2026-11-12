/** 图表右键菜单：按 group 键聚合菜单项、快照十字线价格并分发动作。 */
import type { CommandRegistry } from '@363045841yyt/klinechart-core'
import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
import type { DropMenuGroup } from '@vue-src/components/common/DropMenu.vue'
import { useToast } from '@vue-src/composables/toast/useToast.js'
import type { Component } from 'vue'
import { computed, type Ref, ref } from 'vue'
import IconTablerCopy from '~icons/tabler/copy'
import IconTablerEraser from '~icons/tabler/eraser'
import IconTablerRefresh from '~icons/tabler/refresh'
import IconTablerSettings from '~icons/tabler/settings'
import { useControllerSignalValue } from './useControllerSignal.js'

/** 菜单项 id；视图与设置命令复用命令注册表，复制价格与清空指标是菜单专属动作。 */
export const CHART_CONTEXT_MENU_ITEM = {
  RESET: 'view.reset',
  COPY_PRICE: 'copy-price',
  CLEAR_INDICATORS: 'indicator.clearAll',
  SETTINGS: 'settings.open',
} as const

/** 菜单项图标；与命令按钮使用同一套 tabler 图标。 */
const ICONS: Readonly<Record<string, Component>> = {
  [CHART_CONTEXT_MENU_ITEM.RESET]: IconTablerRefresh,
  [CHART_CONTEXT_MENU_ITEM.COPY_PRICE]: IconTablerCopy,
  [CHART_CONTEXT_MENU_ITEM.CLEAR_INDICATORS]: IconTablerEraser,
  [CHART_CONTEXT_MENU_ITEM.SETTINGS]: IconTablerSettings,
}

/**
 * 菜单项声明：`group` 是分组键，相同键的连续项合成一段，组与组之间由 DropMenu
 * 画分隔线。新增菜单项只在这里补一行，不需要手写 groups 数组。
 */
interface MenuItemDeclaration {
  readonly id: string
  readonly group: string
  readonly label: string
  /** 命令 id；存在时可用性、快捷键与执行都复用命令注册表。 */
  readonly command?: string
}

const MENU_ITEMS: ReadonlyArray<MenuItemDeclaration> = [
  { id: CHART_CONTEXT_MENU_ITEM.RESET, group: 'view', label: '重置图表', command: 'view.reset' },
  { id: CHART_CONTEXT_MENU_ITEM.COPY_PRICE, group: 'price', label: '复制价格' },
  {
    id: CHART_CONTEXT_MENU_ITEM.CLEAR_INDICATORS,
    group: 'indicator',
    label: '移除所有指标',
  },
  {
    id: CHART_CONTEXT_MENU_ITEM.SETTINGS,
    group: 'settings',
    label: '设置',
    command: 'settings.open',
  },
]

/** 十字线价格文本：与价格轴价签一样保留两位小数。 */
function formatPrice(price: number | null): string | null {
  return price === null ? null : price.toFixed(2)
}

export interface ChartContextMenuOptions {
  /** 当前图表 controller；未就绪时重置、清空指标与复制不可用。 */
  readonly controller: Readonly<Ref<ChartController | null>>
  /** 图表命令注册表；重置与设置调用与工具栏、快捷键同一份命令。 */
  readonly commands: CommandRegistry | null
}

export function useChartContextMenu(options: ChartContextMenuOptions) {
  const toast = useToast()
  // 打开瞬间快照十字线价格：指针移入菜单会触发 pointerleave 并清空 crosshair。
  const price = ref<number | null>(null)
  // 指标实例由 Core 持有，经 Vue 桥接只投影“是否有指标”，避免菜单保存业务副本。
  const hasIndicators = useControllerSignalValue(
    options.controller,
    (controller) => controller.indicators,
    (instances) => instances.length > 0,
    () => false,
  )

  /** 菜单项文案；复制价格带当前十字线价格，其余直接取声明。 */
  function labelOf(item: MenuItemDeclaration): string {
    if (item.id !== CHART_CONTEXT_MENU_ITEM.COPY_PRICE) return item.label
    const text = formatPrice(price.value)
    return text === null ? item.label : `${item.label} ${text}`
  }

  /** 从命令注册表取当前平台快捷键文本；命令未绑定快捷键时返回 undefined。 */
  function shortcutOf(item: MenuItemDeclaration): string | undefined {
    if (!item.command || !options.commands) return undefined
    const shortcut = options.commands.get(item.command)?.shortcut
    const combo = Array.isArray(shortcut) ? shortcut[0] : shortcut
    return combo ? options.commands.formatShortcut(combo) : undefined
  }

  /** 是否可用：无十字线时复制禁用，没有指标实例时清空禁用。 */
  function disabledOf(item: MenuItemDeclaration): boolean {
    if (item.id === CHART_CONTEXT_MENU_ITEM.RESET) return options.controller.value === null
    if (item.id === CHART_CONTEXT_MENU_ITEM.COPY_PRICE) return price.value === null
    if (item.id === CHART_CONTEXT_MENU_ITEM.CLEAR_INDICATORS) return !hasIndicators.value
    return options.commands === null
  }

  const groups = computed<ReadonlyArray<DropMenuGroup>>(() => {
    // 构建期使用可变数组，返回契约仍是只读分组。
    const result: Array<{
      id: string
      label: string
      items: Array<DropMenuGroup['items'][number]>
    }> = []
    for (const item of MENU_ITEMS) {
      let group = result.at(-1)
      if (group?.id !== item.group) {
        group = { id: item.group, label: '', items: [] }
        result.push(group)
      }
      group.items.push({
        id: item.id,
        label: labelOf(item),
        shortcut: shortcutOf(item),
        disabled: disabledOf(item),
      })
    }
    return result
  })

  /** 每次打开前刷新十字线价格；没有有效指针位置时复制项保持禁用。 */
  function capturePrice(): void {
    price.value = options.controller.value?.interactionState.peek().crosshairPrice ?? null
  }

  /** 菜单选择：复制本地处理，清空指标走 controller 聚合命令，其余交给命令层。 */
  function select(itemId: string): void {
    if (itemId === CHART_CONTEXT_MENU_ITEM.COPY_PRICE) {
      void copyPrice()
      return
    }
    if (itemId === CHART_CONTEXT_MENU_ITEM.CLEAR_INDICATORS) {
      options.controller.value?.clearAllIndicators()
      return
    }
    void options.commands?.execute(itemId)
  }

  /** 写入剪贴板；成功不打扰用户，失败才给出可重试原因。 */
  async function copyPrice(): Promise<void> {
    const text = formatPrice(price.value)
    if (text === null) return
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      toast.show({ message: '复制失败，请检查剪贴板权限', tone: 'danger' })
    }
  }

  return { groups, icons: ICONS, capturePrice, select }
}
