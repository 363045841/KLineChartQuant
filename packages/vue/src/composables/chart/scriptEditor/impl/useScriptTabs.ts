/** 标签交互：关闭确认、键盘切换、拖拽排序；不涉及目录或仓库操作。 */
import { computed, nextTick, type Ref, ref, watch } from 'vue'
import type { ScriptEditorTab } from '../types.js'

interface TabActions {
  tabs(): readonly ScriptEditorTab[]
  activeTabId(): string | null
  select(id: string): void
  close(id: string): void
  move(id: string, targetId: string): void
  readonly tabsHost: Readonly<Ref<HTMLElement | null>>
}

export function useScriptTabs(actions: TabActions) {
  const pendingClose = ref<string | null>(null)
  const draggedTabId = ref<string | null>(null)
  const dropTargetId = ref<string | null>(null)
  const closingTab = computed(() => actions.tabs().find((tab) => tab.id === pendingClose.value))
  watch(
    () => actions.tabs(),
    () => {
      if (!closingTab.value) pendingClose.value = null
    },
  )
  watch(
    () => actions.activeTabId(),
    async () => {
      await nextTick()
      actions.tabsHost.value
        ?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    },
  )
  function requestClose(id: string): void {
    if (actions.tabs().find((tab) => tab.id === id)?.dirty) pendingClose.value = id
    else actions.close(id)
  }
  function discard(): void {
    if (pendingClose.value) actions.close(pendingClose.value)
    pendingClose.value = null
  }
  function onTabAuxClick(event: MouseEvent, id: string): void {
    if (event.button !== 1) return
    event.preventDefault()
    requestClose(id)
  }
  function onTabKeydown(event: KeyboardEvent, id: string): void {
    if (event.key === 'Delete') {
      event.preventDefault()
      requestClose(id)
      return
    }
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const tabs = actions.tabs()
    const index = tabs.findIndex((tab) => tab.id === id)
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabs.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
    const tab = tabs[next]
    if (!tab) return
    actions.select(tab.id)
    actions.tabsHost.value?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
  }
  function onTabDragStart(event: DragEvent, id: string): void {
    draggedTabId.value = id
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', id)
    }
  }
  function onTabDragOver(event: DragEvent, id: string): void {
    if (draggedTabId.value === null || draggedTabId.value === id) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    dropTargetId.value = id
  }
  function endTabDrag(): void {
    draggedTabId.value = null
    dropTargetId.value = null
  }
  function onTabDrop(event: DragEvent, targetId: string): void {
    event.preventDefault()
    if (draggedTabId.value !== null && draggedTabId.value !== targetId)
      actions.move(draggedTabId.value, targetId)
    endTabDrag()
  }
  return {
    pendingClose,
    closingTab,
    requestClose,
    discard,
    onTabAuxClick,
    onTabKeydown,
    draggedTabId,
    dropTargetId,
    onTabDragStart,
    onTabDragOver,
    onTabDrop,
    endTabDrag,
  }
}
