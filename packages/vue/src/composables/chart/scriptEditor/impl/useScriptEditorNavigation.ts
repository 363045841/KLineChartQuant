/** 文件目录、名称搜索和标签关闭交互；源码状态仍由编辑会话管理。 */
import { computed, nextTick, ref, type Ref, watch } from 'vue'
import type { ScriptEditorDocument, ScriptEditorTab } from '../types.js'

/** 从已提交文件与新建标签派生两级目录，搜索时自动展开匹配目录。 */
export function useScriptEditorNavigation(
  documents: () => readonly ScriptEditorDocument[],
  tabs: () => readonly ScriptEditorTab[],
  select: (id: string) => void,
  close: (id: string) => void,
  tabsHost: Readonly<Ref<HTMLElement | null>>,
  activeTabId: () => string | null,
) {
  const explorerOpen = ref(true)
  const query = ref('')
  const folders = ref({ indicator: true, library: true })
  const pendingClose = ref<string | null>(null)
  watch(activeTabId, async () => {
    await nextTick()
    tabsHost.value?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  })
  const groups = computed(() => {
    const search = query.value.trim().toLocaleLowerCase()
    return (['indicator', 'library'] as const).map((kind) => {
      const saved = documents().filter((item) => item.kind === kind).map((item) => ({
        id: item.id, name: item.definition.name, kind, tabId: tabs().find((tab) => tab.definitionId === item.id)?.id,
        readonly: item.identity === 'builtin', dirty: tabs().some((tab) => tab.definitionId === item.id && tab.dirty),
      }))
      const drafts = tabs().filter((item) => item.kind === kind && item.definitionId === null).map((item) => ({
        id: item.id, name: item.title, kind, tabId: item.id, readonly: false, dirty: true,
      }))
      return { kind, label: kind === 'indicator' ? '指标' : '库', expanded: Boolean(search) || folders.value[kind], files: [...saved, ...drafts].filter((item) => `${item.name}.ts`.toLocaleLowerCase().includes(search)).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')) }
    }).filter((group) => !search || group.files.length > 0)
  })
  const closingTab = computed(() => tabs().find((item) => item.id === pendingClose.value))
  watch(tabs, () => { if (!closingTab.value) pendingClose.value = null })

  /** 仅关闭脏标签时确认，普通切换不阻塞编辑。 */
  function requestClose(id: string): void {
    if (tabs().find((item) => item.id === id)?.dirty) pendingClose.value = id
    else close(id)
  }
  /** 标签支持鼠标中键关闭，和浏览器标签页一致；脏标签仍走确认。 */
  function onTabAuxClick(event: MouseEvent, id: string): void {
    if (event.button !== 1) return
    event.preventDefault()
    requestClose(id)
  }
  /** 放弃当前待关闭标签的草稿。 */
  function discard(): void {
    if (pendingClose.value) close(pendingClose.value)
    pendingClose.value = null
  }
  /** 标签用方向键、Home/End 切换，Delete 请求关闭。 */
  function onTabKeydown(event: KeyboardEvent, id: string): void {
    const items = tabs()
    if (event.key === 'Delete') { event.preventDefault(); requestClose(id); return }
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const index = items.findIndex((item) => item.id === id)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length
    const tab = items[next]
    if (!tab) return
    select(tab.id)
    const buttons = event.currentTarget instanceof HTMLElement ? event.currentTarget.closest('[role="tablist"]')?.querySelectorAll<HTMLButtonElement>('[role="tab"]') : undefined
    buttons?.[next]?.focus()
  }
  return { explorerOpen, query, folders, groups, pendingClose, closingTab, requestClose, onTabAuxClick, discard, onTabKeydown }
}
