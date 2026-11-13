/**
 * 对象树面板的视图层：桥接 Core 分组信号、转发对象命令，并维护拖拽落点与折叠状态。
 *
 * 这里不保存任何对象数据：行、显隐、锁定与顺序都来自 `ChartController.objects`。
 */

import type { PaneObjectGroup, PaneObjectRow } from '@363045841yyt/klinechart-core'
import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
import { useControllerSignal } from '@vue-src/composables/chart/useControllerSignal.js'
import { computed, type Ref, ref } from 'vue'
import { createMoveTarget, neighbourDropIndex } from './object-tree-dnd.js'

/** 当前拖拽落点：目标分组 + 展示顺序中的插入位置。 */
interface DropTarget {
  readonly paneId: string
  readonly displayIndex: number
}

/** 分组内命中的对象行及其所属分组。 */
interface RowLocation {
  readonly group: PaneObjectGroup
  readonly row: PaneObjectRow
}

export function useObjectTreePanel(controller: Readonly<Ref<ChartController | null>>) {
  const groups = useControllerSignal(
    controller,
    (chart) => chart.objects.groups,
    () => [],
  )
  const draggingId = ref<string | null>(null)
  const dropTarget = ref<DropTarget | null>(null)
  /** 最底端分割线是否处于“新建 Pane”的落点高亮。 */
  const newPaneDropActive = ref(false)
  // 从行内操作按钮按下时不应启动整行拖拽。
  let dragFromAction = false

  const totalCount = computed(() =>
    groups.value.reduce((total, group) => total + group.rows.length, 0),
  )
  const isEmpty = computed(() => totalCount.value === 0)
  /** 正在拖动的对象是否允许迁移到新 Pane；决定最底端“新窗口”是否出现。 */
  const canCreatePane = computed(() => {
    const source = draggingId.value === null ? null : findRow(draggingId.value)
    return source?.row.capabilities.movable === true
  })

  /** 按身份取对象的领域命令；对象已被移除时返回 null。 */
  function commandsFor(objectId: string) {
    return controller.value?.objects.commandsFor(objectId) ?? null
  }

  /** 在分组内查找对象，拖拽落点需要它的层带与能力。 */
  function findRow(objectId: string): RowLocation | null {
    for (const group of groups.value) {
      const row = group.rows.find((item) => item.objectId === objectId)
      if (row) return { group, row }
    }
    return null
  }

  /** 显隐不受锁定影响，只受对象能力限制。 */
  function toggleVisible(row: PaneObjectRow): void {
    if (!row.capabilities.hideable) return
    commandsFor(row.objectId)?.setVisible(!row.visible)
  }

  function toggleLocked(row: PaneObjectRow): void {
    if (!row.capabilities.lockable) return
    commandsFor(row.objectId)?.setLocked(!row.locked)
  }

  function removeRow(row: PaneObjectRow): void {
    if (!row.capabilities.removable || row.locked) return
    commandsFor(row.objectId)?.remove()
  }

  function canDrag(row: PaneObjectRow): boolean {
    return row.capabilities.orderable && !row.locked
  }

  /** 目标分组是否接受该对象：同 pane 需要可排序，跨 pane 需要可迁移。 */
  function canDropInto(group: PaneObjectGroup, source: RowLocation): boolean {
    if (source.row.locked) return false
    return group.paneId === source.group.paneId
      ? source.row.capabilities.orderable
      : source.row.capabilities.movable
  }

  /** 行内按钮的提示文案；不可用时说明原因。 */
  function visibilityHint(row: PaneObjectRow): string {
    if (!row.capabilities.hideable) return '该对象不支持显隐'
    return row.visible ? '隐藏' : '显示'
  }

  function lockHint(row: PaneObjectRow): string {
    return row.locked ? '解锁' : '锁定'
  }

  function removeHint(row: PaneObjectRow): string {
    return row.locked ? '已锁定，先解锁' : '删除'
  }

  /** 指针落在行的上半部分插到前面，下半部分插到后面。 */
  function pointerDisplayIndex(event: DragEvent, index: number): number {
    const element = event.currentTarget
    if (!(element instanceof HTMLElement)) return index
    const rect = element.getBoundingClientRect()
    return event.clientY > rect.top + rect.height / 2 ? index + 1 : index
  }

  function onDragStart(event: DragEvent, row: PaneObjectRow): void {
    if (!canDrag(row) || dragFromAction) {
      dragFromAction = false
      event.preventDefault()
      return
    }
    draggingId.value = row.objectId
    dropTarget.value = null
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', row.objectId)
    }
  }

  /** 记录按下位置，行内按钮不触发整行拖拽。 */
  function onRowPointerDown(event: PointerEvent): void {
    const target = event.target instanceof Element ? event.target : null
    dragFromAction = target?.closest('.object-row__actions') !== null
  }

  function onDragEnd(): void {
    draggingId.value = null
    dropTarget.value = null
    newPaneDropActive.value = false
  }

  /** 最后一个有内容的分组；最底端拖放以它为锚点新建 Pane。 */
  function lastGroupPaneId(): string | null {
    for (let index = groups.value.length - 1; index >= 0; index--) {
      const group = groups.value[index]
      if (group && group.rows.length > 0) return group.paneId
    }
    return null
  }

  /** 拖到最底端分割线：只接受可迁移的对象，并高亮该分割线。 */
  function onNewPaneDragOver(event: DragEvent): void {
    const source = draggingId.value === null ? null : findRow(draggingId.value)
    if (!source || !source.row.capabilities.movable) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    dropTarget.value = null
    newPaneDropActive.value = true
  }

  /** 松手创建新 Pane：走对象自己的 move 命令，最终落到 Pane 领域命令。 */
  function onNewPaneDrop(event: DragEvent): void {
    event.preventDefault()
    const objectId = draggingId.value
    const source = objectId === null ? null : findRow(objectId)
    const anchorPaneId = lastGroupPaneId()
    newPaneDropActive.value = false
    dropTarget.value = null
    draggingId.value = null
    if (!objectId || !source || !source.row.capabilities.movable || anchorPaneId === null) return
    commandsFor(objectId)?.move({ kind: 'newPane', anchorPaneId, placement: 'below' })
  }

  /** 行上的拖动只更新落点指示，不改任何状态。 */
  function onRowDragOver(event: DragEvent, group: PaneObjectGroup, index: number): void {
    const source = draggingId.value === null ? null : findRow(draggingId.value)
    if (!source || !canDropInto(group, source)) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    newPaneDropActive.value = false
    dropTarget.value = { paneId: group.paneId, displayIndex: pointerDisplayIndex(event, index) }
  }

  /** 分组空白处表示放到该层带顶部。 */
  function onGroupDragOver(event: DragEvent, group: PaneObjectGroup, displayIndex: number): void {
    const source = draggingId.value === null ? null : findRow(draggingId.value)
    if (!source || !canDropInto(group, source)) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    newPaneDropActive.value = false
    dropTarget.value = { paneId: group.paneId, displayIndex }
  }

  /** 提交落点：跨 pane 走迁移，同 pane 走换序，最终都落到对象自己的命令。 */
  function onDrop(event: DragEvent, group: PaneObjectGroup, displayIndex: number): void {
    event.preventDefault()
    const objectId = draggingId.value
    const source = objectId === null ? null : findRow(objectId)
    dropTarget.value = null
    draggingId.value = null
    newPaneDropActive.value = false
    if (!objectId || !source || !canDropInto(group, source)) return
    commandsFor(objectId)?.move(createMoveTarget(group, displayIndex, source.row))
  }

  function onRowDrop(event: DragEvent, group: PaneObjectGroup, index: number): void {
    onDrop(event, group, pointerDisplayIndex(event, index))
  }

  /** 键盘等价操作：Alt+↑/↓ 换位、H 显隐、Delete 删除。 */
  function onRowKeydown(event: KeyboardEvent, group: PaneObjectGroup, row: PaneObjectRow): void {
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault()
      if (!row.capabilities.orderable || row.locked) return
      const displayIndex = neighbourDropIndex(group, row, event.key === 'ArrowUp' ? 'up' : 'down')
      if (displayIndex === null) return
      commandsFor(row.objectId)?.move(createMoveTarget(group, displayIndex, row))
      return
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (!row.capabilities.removable || row.locked) return
      event.preventDefault()
      removeRow(row)
      return
    }
    if (event.key.toLowerCase() === 'h') {
      if (!row.capabilities.hideable) return
      event.preventDefault()
      toggleVisible(row)
    }
  }

  function isDropBefore(group: PaneObjectGroup, index: number): boolean {
    return dropTarget.value?.paneId === group.paneId && dropTarget.value.displayIndex === index
  }

  function isDropAfter(group: PaneObjectGroup, index: number): boolean {
    return (
      dropTarget.value?.paneId === group.paneId &&
      dropTarget.value.displayIndex === group.rows.length &&
      index === group.rows.length - 1
    )
  }

  return {
    groups,
    totalCount,
    isEmpty,
    canCreatePane,
    toggleVisible,
    toggleLocked,
    removeRow,
    canDrag,
    canDropInto,
    visibilityHint,
    lockHint,
    removeHint,
    draggingId,
    newPaneDropActive,
    onDragStart,
    onRowPointerDown,
    onDragEnd,
    onRowDragOver,
    onGroupDragOver,
    onDrop,
    onRowDrop,
    onNewPaneDragOver,
    onNewPaneDrop,
    onRowKeydown,
    isDropBefore,
    isDropAfter,
  }
}
