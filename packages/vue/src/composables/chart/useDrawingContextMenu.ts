/** 绘图图元右键菜单：判定右键来源、快照操作范围，并按快照调用 Core 绘图 API。 */
import type { CommandRegistry } from '@363045841yyt/klinechart-core'
import type { ChartController, DrawingObject } from '@363045841yyt/klinechart-core/controllers'
import type { DropMenuGroup } from '@vue-src/components/common/DropMenu.vue'
import type { Component } from 'vue'
import { computed, type Ref, shallowRef } from 'vue'
import IconTablerCopy from '~icons/tabler/copy'
import IconTablerCopyPlus from '~icons/tabler/copy-plus'
import IconTablerEyeOff from '~icons/tabler/eye-off'
import IconTablerLock from '~icons/tabler/lock'
import IconTablerLockOpen from '~icons/tabler/lock-open'
import IconTablerTrash from '~icons/tabler/trash'

/** 图元菜单项 id；与图表菜单共用 DropMenu，但动作范围来自图元快照。 */
export const DRAWING_CONTEXT_MENU_ITEM = {
  COPY: 'copy',
  CLONE: 'clone',
  LOCK: 'lock',
  HIDE: 'hide',
  REMOVE: 'remove',
} as const

/** 右键命中的最小查询面；DrawingInteractionController 结构上满足该端口。 */
export interface DrawingHitTestPort {
  hitTestAt(x: number, y: number): DrawingObject | null
}

/** 右键触发源：由唯一命中检测决定，菜单只消费这个判别值。 */
export type ContextMenuSource =
  | { readonly kind: 'chart' }
  | { readonly kind: 'drawing'; readonly drawingId: string }

/**
 * 判定右键来源：命中可见图元时返回图元来源，否则返回图表来源。
 *
 * 只保留图元 id，菜单不持有图元快照；操作范围与锁定态在打开时另行快照。
 */
export function resolveContextMenuSource(
  drawing: DrawingHitTestPort | null,
  x: number,
  y: number,
): ContextMenuSource {
  const hit = drawing?.hitTestAt(x, y) ?? null
  return hit ? { kind: 'drawing', drawingId: hit.id } : { kind: 'chart' }
}

/**
 * 菜单项声明：group 相同的连续项合成一段；命令 id 只用于复用快捷键文案，
 * 执行始终按打开瞬间的 ids 走 Controller API，不重新读取实时选中集合。
 */
interface MenuItemDeclaration {
  readonly id: string
  readonly group: string
  readonly label: string
  readonly command?: string
}

const MENU_ITEMS: ReadonlyArray<MenuItemDeclaration> = [
  { id: DRAWING_CONTEXT_MENU_ITEM.COPY, group: 'copy', label: '复制', command: 'drawing.copy' },
  { id: DRAWING_CONTEXT_MENU_ITEM.CLONE, group: 'copy', label: '克隆', command: 'drawing.clone' },
  { id: DRAWING_CONTEXT_MENU_ITEM.LOCK, group: 'visibility', label: '锁定' },
  { id: DRAWING_CONTEXT_MENU_ITEM.HIDE, group: 'visibility', label: '隐藏' },
  { id: DRAWING_CONTEXT_MENU_ITEM.REMOVE, group: 'remove', label: '移除' },
]

/** 固定图标；锁定项按快照状态在打开时选择锁定/解锁图标。 */
const ICONS: Readonly<Record<string, Component>> = {
  [DRAWING_CONTEXT_MENU_ITEM.COPY]: IconTablerCopy,
  [DRAWING_CONTEXT_MENU_ITEM.CLONE]: IconTablerCopyPlus,
  [DRAWING_CONTEXT_MENU_ITEM.HIDE]: IconTablerEyeOff,
  [DRAWING_CONTEXT_MENU_ITEM.REMOVE]: IconTablerTrash,
}

export interface DrawingContextMenuOptions {
  /** 当前图表 controller；未就绪时菜单动作不可用。 */
  readonly controller: Readonly<Ref<ChartController | null>>
  /** 图表命令注册表；只读取复制与克隆的快捷键文本。 */
  readonly commands: CommandRegistry | null
}

export function useDrawingContextMenu(options: DrawingContextMenuOptions) {
  // 打开瞬间快照目标与锁定态；菜单期间不重新读取选中集合。
  const targetIds = shallowRef<ReadonlyArray<string>>(Object.freeze([]))
  const allLocked = shallowRef(false)

  /**
   * 快照本次右键的操作范围。
   *
   * 命中图元已在选中集合内时操作整组，保留多选语义；否则只操作该图元，并把选中态
   * 同步到同一范围，保证画面选择与菜单动作一致。右键本身不会改变选中集合。
   */
  function capture(drawingId: string): void {
    const controller = options.controller.value
    const selected = controller?.selectedDrawingIds.peek() ?? []
    const selectedHit = selected.includes(drawingId)
    const ids = selectedHit ? [...selected] : [drawingId]
    if (!selectedHit) controller?.setSelectedDrawingIds(ids)
    targetIds.value = Object.freeze(ids)

    const targetSet = new Set(ids)
    const targets = (controller?.drawings.peek() ?? []).filter((drawing) =>
      targetSet.has(drawing.id),
    )
    allLocked.value =
      targets.length === ids.length && targets.every((drawing) => drawing.locked === true)
  }

  /** 锁定项文案随快照切换；其余项使用固定文案。 */
  function labelOf(item: MenuItemDeclaration): string {
    if (item.id === DRAWING_CONTEXT_MENU_ITEM.LOCK) return allLocked.value ? '解锁' : '锁定'
    return item.label
  }

  /** 移除在全部锁定时禁用；没有目标时整份菜单禁用。 */
  function disabledOf(item: MenuItemDeclaration): boolean {
    if (item.id === DRAWING_CONTEXT_MENU_ITEM.REMOVE) return allLocked.value
    return targetIds.value.length === 0
  }

  /** 只读取快捷键文案；执行不交给命令层，避免命令重新读取实时选中集合。 */
  function shortcutOf(item: MenuItemDeclaration): string | undefined {
    if (!item.command || !options.commands) return undefined
    const shortcut = options.commands.get(item.command)?.shortcut
    const combo = Array.isArray(shortcut) ? shortcut[0] : shortcut
    return combo ? options.commands.formatShortcut(combo) : undefined
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

  const icons = computed<Readonly<Record<string, Component | undefined>>>(() => ({
    ...ICONS,
    [DRAWING_CONTEXT_MENU_ITEM.LOCK]: allLocked.value ? IconTablerLockOpen : IconTablerLock,
  }))

  /** 所有动作都按打开瞬间的 ids 提交；单图元同样走批量入口。 */
  function select(itemId: string): void {
    const controller = options.controller.value
    const ids = targetIds.value
    if (!controller || ids.length === 0) return
    if (itemId === DRAWING_CONTEXT_MENU_ITEM.COPY) {
      controller.copyDrawingsToClipboard(ids)
      return
    }
    if (itemId === DRAWING_CONTEXT_MENU_ITEM.CLONE) {
      controller.copyDrawings(ids)
      return
    }
    if (itemId === DRAWING_CONTEXT_MENU_ITEM.LOCK) {
      controller.updateBatch(ids, { locked: !allLocked.value })
      return
    }
    if (itemId === DRAWING_CONTEXT_MENU_ITEM.HIDE) {
      controller.updateBatch(ids, { visible: false })
      return
    }
    if (itemId === DRAWING_CONTEXT_MENU_ITEM.REMOVE) controller.removeBatch(ids)
  }

  return { groups, icons, capture, select }
}
