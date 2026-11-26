/**
 * 对象树面板的视图层：桥接 Core 分组信号、转发对象命令，并维护拖拽落点与折叠状态。
 *
 * 这里不保存任何对象数据：行、显隐、锁定与顺序都来自 `ChartController.objects`。
 */

import type {
  PaneObjectGroup,
  PaneObjectRow,
  RenderObjectCommands,
} from '@363045841yyt/klinechart-core'
import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
import { useControllerSignal } from '@vue-src/composables/chart/useControllerSignal.js'
import { computed, type Ref, shallowRef } from 'vue'
import {
  createMoveTarget,
  createNewPaneTarget,
  neighbourDropIndex,
  type PaneDropSide,
} from './object-tree-dnd.js'

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

type DragTarget =
  | { readonly kind: 'new-pane'; readonly side: PaneDropSide }
  | ({ readonly kind: 'pane' } & DropTarget)

/** 一次拖拽会话：源行只解析一次，落点在同一对象里更新。 */
interface DragSession {
  readonly source: RowLocation
  readonly target: DragTarget | null
}

export function useObjectTreePanel(controller: Readonly<Ref<ChartController | null>>) {
  const groups = useControllerSignal(
    controller,
    (chart) => chart.objects.groups,
    () => [],
  )
  const dragSession = shallowRef<DragSession | null>(null)
  // 从行内操作按钮按下时不应启动整行拖拽；这是指针意图，不属于拖拽会话。
  let dragFromAction = false

  const draggingId = computed(() => dragSession.value?.source.row.objectId ?? null)
  const newPaneDropSide = computed(() => {
    const target = dragSession.value?.target
    return target?.kind === 'new-pane' ? target.side : null
  })

  const totalCount = computed(() =>
    groups.value.reduce((total, group) => total + group.rows.length, 0),
  )
  const isEmpty = computed(() => totalCount.value === 0)
  /** 正在拖动的对象是否允许迁移到新 Pane；决定两端“新窗口”是否出现。 */
  const canCreatePane = computed(
    () => dragSession.value?.source.row.capabilities.movable === true,
  )

  /** 按身份取对象的领域命令；对象已被移除时返回 null。 */
  function commandsFor(objectId: string): RenderObjectCommands | null {
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

  /** 行内按钮文案：禁用按钮不显示提示，文案只表达动作本身。 */
  function visibilityHint(row: PaneObjectRow): string {
    return row.visible ? '隐藏' : '显示'
  }

  function lockHint(row: PaneObjectRow): string {
    return row.locked ? '解锁' : '锁定'
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
    const source = findRow(row.objectId)
    if (!source) {
      event.preventDefault()
      return
    }
    dragSession.value = { source, target: null }
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
    dragSession.value = null
  }

  /** 记录预览落点：只更新拖拽会话，不提交业务命令。 */
  function previewDrop(event: DragEvent, session: DragSession, target: DragTarget): void {
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    dragSession.value = { ...session, target }
  }

  /** 拖到顶部或底部“新窗口”分割线：只接受可迁移的对象，并高亮该分割线。 */
  function onNewPaneDragOver(event: DragEvent, side: PaneDropSide): void {
    const session = dragSession.value
    if (!session?.source.row.capabilities.movable) return
    previewDrop(event, session, { kind: 'new-pane', side })
  }

  /** 松手创建新 Pane：走对象自己的 move 命令，最终落到 Pane 领域命令。 */
  function onNewPaneDrop(event: DragEvent, side: PaneDropSide): void {
    event.preventDefault()
    const session = dragSession.value
    const target = createNewPaneTarget(groups.value, side)
    dragSession.value = null
    if (!session || !session.source.row.capabilities.movable || target === null) return
    commandsFor(session.source.row.objectId)?.move(target)
  }

  /** 行上的拖动只更新落点指示，不改任何状态。 */
  function onRowDragOver(event: DragEvent, group: PaneObjectGroup, index: number): void {
    const session = dragSession.value
    if (!session || !canDropInto(group, session.source)) return
    previewDrop(event, session, {
      kind: 'pane',
      paneId: group.paneId,
      displayIndex: pointerDisplayIndex(event, index),
    })
  }

  /** 分组空白处表示放到该层带顶部。 */
  function onGroupDragOver(event: DragEvent, group: PaneObjectGroup, displayIndex: number): void {
    const session = dragSession.value
    if (!session || !canDropInto(group, session.source)) return
    previewDrop(event, session, { kind: 'pane', paneId: group.paneId, displayIndex })
  }

  /** 提交落点：跨 pane 走迁移，同 pane 走换序，最终都落到对象自己的命令。 */
  function onDrop(event: DragEvent, group: PaneObjectGroup, displayIndex: number): void {
    event.preventDefault()
    const session = dragSession.value
    dragSession.value = null
    if (!session || !canDropInto(group, session.source)) return
    commandsFor(session.source.row.objectId)?.move(
      createMoveTarget(group, displayIndex, session.source.row),
    )
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
    const target = dragSession.value?.target
    return target?.kind === 'pane' && target.paneId === group.paneId && target.displayIndex === index
  }

  function isDropAfter(group: PaneObjectGroup, index: number): boolean {
    const target = dragSession.value?.target
    return (
      target?.kind === 'pane' &&
      target.paneId === group.paneId &&
      target.displayIndex === group.rows.length &&
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
    draggingId,
    newPaneDropSide,
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
