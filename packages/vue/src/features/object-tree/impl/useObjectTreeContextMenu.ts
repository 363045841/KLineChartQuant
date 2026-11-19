/**
 * 对象树图元右键菜单：复用图元菜单模型，只接管图元行。
 *
 * 菜单内容与动作全部来自 useDrawingContextMenu，与画布图元菜单同一份；
 * 这里只负责判定行来源、快照目标并在指针处打开。
 */

import type { PaneObjectRow } from '@363045841yyt/klinechart-core'
import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
import { isTimeShareDataView } from '@363045841yyt/klinechart-core/controllers'
import { useControllerSignal } from '@vue-src/composables/chart/useControllerSignal.js'
import {
  resolveContextMenuSource,
  useDrawingContextMenu,
} from '@vue-src/composables/chart/useDrawingContextMenu.js'
import { injectCommands } from '@vue-src/composables/commands/useCommands.js'
import { computed, type Ref } from 'vue'

/** 菜单锚点能力；由面板的 useMenuAnchor 提供，右键时在指针处打开。 */
export interface DrawingContextMenuHandle {
  anchorAt(x: number, y: number): void
}

/**
 * 创建对象树的图元右键菜单。
 *
 * @param controller 图表控制器；行来源与菜单动作都作用于它
 * @param menu 菜单锚点；在指针处打开图元菜单
 * @returns 菜单分组、行右键入口与选择事件转发
 */
export function useObjectTreeContextMenu(
  controller: Readonly<Ref<ChartController | null>>,
  menu: DrawingContextMenuHandle,
) {
  // 命令表由共同父级提供，菜单与画布共用同一份快捷键文案。
  const commands = injectCommands()
  // 分时视图不适用周期规则，与画布图元菜单保持同一判定。
  const chartMode = useControllerSignal(
    controller,
    (chart) => chart.chartMode,
    () => 'kline' as const,
  )
  const lastBarPeriod = useControllerSignal(
    controller,
    (chart) => chart.lastBarPeriod,
    () => '',
  )
  const currentPeriod = computed<string | null>(() =>
    isTimeShareDataView(chartMode.value) || lastBarPeriod.value === '' ? null : lastBarPeriod.value,
  )
  const {
    groups: contextMenuGroups,
    capture,
    select,
  } = useDrawingContextMenu({ controller, commands, currentPeriod })

  /**
   * 行右键：只有图元行接管，快照目标后在指针处打开同一份图元菜单。
   *
   * @param event 行上的 contextmenu 事件
   * @param row 命中行
   * @returns 是否接管该右键；非图元行保留浏览器菜单
   */
  function openRowContextMenu(event: MouseEvent, row: PaneObjectRow): boolean {
    const source = resolveContextMenuSource(null, {
      kind: 'object',
      source: row.domainId,
      objectKind: row.kind,
    })
    if (source === null) return false
    event.preventDefault()
    event.stopPropagation()
    capture(source.drawingId)
    menu.anchorAt(event.clientX, event.clientY)
    return true
  }

  /** DropMenu 只给出 itemId/parentId，动作交给菜单模型。 */
  function onContextMenuSelect(_groupId: string, itemId: string, parentId?: string): void {
    select(itemId, parentId)
  }

  return { contextMenuGroups, openRowContextMenu, onContextMenuSelect }
}
