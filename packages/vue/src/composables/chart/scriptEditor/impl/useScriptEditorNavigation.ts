/**
 * 文件目录：行模型、搜索、标签拖拽排序与右键菜单。
 *
 * 身份只有两种：文件夹行（含 path === '' 的分组根）与文件行。菜单内容、禁用原因、
 * 行激活与展开都由本模块统一给出，组件只负责渲染和转发动作。
 */
import { computed, nextTick, onScopeDispose, type Ref, ref, watch } from 'vue'
import type {
  ScriptEditorDocument,
  ScriptEditorFolder,
  ScriptEditorTab,
  ScriptTreeAction,
} from '../types.js'
import { createScriptMenu, type ScriptMenu } from './scriptMenu.js'

type ScriptKind = 'indicator' | 'library'

/** 分组根的唯一定义：身份与显示名来自这一份表。 */
const ROOT_FOLDERS: ReadonlyArray<readonly [ScriptKind, string]> = [
  ['indicator', '指标'],
  ['library', '库'],
]

/** 文件行的身份来源：已提交文档或未保存草稿。 */
export type ScriptTreeFileTarget =
  | { readonly kind: 'document'; readonly documentId: string }
  | { readonly kind: 'draft'; readonly tabId: string }

/** 目录树的一行：文件夹或文件。分组根是 path 为 '' 的文件夹。 */
export type ScriptTreeRow =
  | {
      readonly type: 'folder'
      readonly key: string
      readonly kind: ScriptKind
      /** 分组根为 ''；根与普通文件夹共用同一套路径规则。 */
      readonly path: string
      readonly name: string
      /** 相对分组根的层数，由 CSS 换算成缩进。 */
      readonly depth: number
      readonly expanded: boolean
    }
  | {
      readonly type: 'file'
      readonly key: string
      readonly kind: ScriptKind
      readonly target: ScriptTreeFileTarget
      readonly name: string
      readonly folder: string
      readonly depth: number
      readonly tabId: string | null
      readonly readonly: boolean
      readonly dirty: boolean
    }

/** 文件目录依赖的会话能力；动作统一从 apply 出口进入会话。 */
export interface ScriptFileTreeActions {
  readonly documents: () => readonly ScriptEditorDocument[]
  readonly folders: () => readonly ScriptEditorFolder[]
  readonly tabs: () => readonly ScriptEditorTab[]
  readonly activeTabId: () => string | null
  readonly select: (tabId: string) => void
  readonly close: (tabId: string) => void
  readonly move: (id: string, targetId: string) => void
  readonly openFile: (id: string) => void
  /** 唯一动作出口：文件树只声明动作，不关心会话如何执行。 */
  readonly apply: (action: ScriptTreeAction) => void | Promise<void>
  /** 编辑会话是否允许写入；保存或执行中禁用菜单入口。 */
  readonly writable: () => boolean
  readonly tabsHost: Readonly<Ref<HTMLElement | null>>
  /** 菜单挂载点，必须位于模态弹窗或独立窗口内部。 */
  readonly treeHost: Readonly<Ref<HTMLElement | null>>
}

/** 目录树的文件条目：已提交文档或未保存草稿。 */
interface TreeEntry {
  readonly key: string
  readonly target: ScriptTreeFileTarget
  readonly name: string
  readonly folder: string
  readonly readonly: boolean
  readonly tabId: string | null
  readonly dirty: boolean
}

/** 菜单条目的唯一声明形态；disabled 为空表示可用，非空即禁用原因。 */
interface ScriptMenuEntry {
  readonly label: string
  readonly disabled: string
  /** 与上一组菜单之间画分隔线。 */
  readonly separatorBefore?: boolean
  readonly run: () => void | Promise<void>
}

/** 父文件夹路径；根目录返回 ''。 */
function parentPath(path: string): string {
  const index = path.lastIndexOf('/')
  return index < 0 ? '' : path.slice(0, index)
}

/** 从文档、草稿与文件夹派生目录行；根目录也是文件夹行。 */
export function useScriptEditorNavigation(actions: ScriptFileTreeActions) {
  const explorerOpen = ref(true)
  const query = ref('')
  /** 折叠态唯一来源：键为 `${kind}:${path}`，根目录为 `${kind}:`。 */
  const collapsed = ref<ReadonlySet<string>>(new Set())
  const pendingClose = ref<string | null>(null)
  const draggedTabId = ref<string | null>(null)
  const dropTargetId = ref<string | null>(null)

  let menu: ScriptMenu | undefined
  /** 首次右键时才创建菜单：模态弹窗内必须挂到工作区 DOM，body 处于 inert。 */
  function scriptMenu(): ScriptMenu {
    menu ??= createScriptMenu(document, { host: actions.treeHost.value ?? document.body })
    return menu
  }
  onScopeDispose(() => menu?.destroy())

  const rows = computed<readonly ScriptTreeRow[]>(() => {
    const search = query.value.trim().toLocaleLowerCase()
    if (search) {
      return ROOT_FOLDERS.flatMap(([kind]) =>
        entries(kind)
          .filter((entry) => `${entry.name}.ts`.toLocaleLowerCase().includes(search))
          .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
          .map((entry) => fileRow(kind, entry, 0)),
      )
    }
    return ROOT_FOLDERS.flatMap(([kind, label]) => rootRows(kind, label))
  })

  /** 根文件夹及其可见内容。 */
  function rootRows(kind: ScriptKind, label: string): readonly ScriptTreeRow[] {
    const expanded = !collapsed.value.has(`${kind}:`)
    const root: ScriptTreeRow = {
      type: 'folder',
      key: `folder:${kind}:`,
      kind,
      path: '',
      name: label,
      depth: 0,
      expanded,
    }
    return expanded ? [root, ...folderRows(kind, '', 1)] : [root]
  }

  /** 指定目录的可见行：先子文件夹（递归展开），再当前层的文件。 */
  function folderRows(kind: ScriptKind, folder: string, depth: number): readonly ScriptTreeRow[] {
    const list = entries(kind)
    const rows: ScriptTreeRow[] = []
    const paths = actions
      .folders()
      .filter((item) => item.kind === kind && parentPath(item.path) === folder)
      .map((item) => item.path)
      .sort((a, b) => a.localeCompare(b, 'zh-CN'))
    for (const path of paths) {
      const expanded = !collapsed.value.has(`${kind}:${path}`)
      rows.push({
        type: 'folder',
        key: `folder:${kind}:${path}`,
        kind,
        path,
        name: path.slice(path.lastIndexOf('/') + 1),
        depth,
        expanded,
      })
      if (expanded) rows.push(...folderRows(kind, path, depth + 1))
    }
    rows.push(
      ...list
        .filter((entry) => entry.folder === folder)
        .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
        .map((entry) => fileRow(kind, entry, depth)),
    )
    return rows
  }

  /** 某一分组下所有文件条目：已提交文档在前，未保存草稿作为同一层文件。 */
  function entries(kind: ScriptKind): readonly TreeEntry[] {
    const tabs = actions.tabs()
    const saved = actions
      .documents()
      .filter((item) => item.kind === kind)
      .map<TreeEntry>((item) => ({
        key: `file:${item.id}`,
        target: { kind: 'document', documentId: item.id },
        name: item.definition.name,
        folder: item.folder,
        readonly: item.identity === 'builtin',
        tabId: tabs.find((tab) => tab.definitionId === item.id)?.id ?? null,
        dirty: tabs.some((tab) => tab.definitionId === item.id && tab.dirty),
      }))
    const drafts = tabs
      .filter((tab) => tab.kind === kind && tab.definitionId === null)
      .map<TreeEntry>((tab) => ({
        key: `draft:${tab.id}`,
        target: { kind: 'draft', tabId: tab.id },
        name: tab.title,
        folder: tab.folder,
        readonly: false,
        tabId: tab.id,
        dirty: true,
      }))
    return [...saved, ...drafts]
  }

  /** 文件条目转成一行，草稿与已提交文档共用同一渲染结构。 */
  function fileRow(kind: ScriptKind, entry: TreeEntry, depth: number): ScriptTreeRow {
    return {
      type: 'file',
      key: entry.key,
      kind,
      target: entry.target,
      name: entry.name,
      folder: entry.folder,
      depth,
      tabId: entry.tabId,
      readonly: entry.readonly,
      dirty: entry.dirty,
    }
  }

  /** 行点击：文件夹切换展开，已打开文件切换标签，其余打开文档。 */
  function activate(row: ScriptTreeRow): void {
    if (row.type === 'folder') {
      toggle(row)
      return
    }
    if (row.tabId !== null) actions.select(row.tabId)
    else if (row.target.kind === 'document') actions.openFile(row.target.documentId)
  }

  /** 文件夹展开/折叠；根目录与普通文件夹共用同一状态。 */
  function toggle(row: ScriptTreeRow): void {
    if (row.type !== 'folder') return
    const key = `${row.kind}:${row.path}`
    const next = new Set(collapsed.value)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    collapsed.value = next
  }

  const closingTab = computed(() => actions.tabs().find((item) => item.id === pendingClose.value))
  watch(
    () => actions.tabs(),
    () => {
      if (!closingTab.value) pendingClose.value = null
    },
  )

  // 打开或新建标签时展开其所属目录，避免文件被折叠在看不见的位置。
  watch(
    () => actions.activeTabId(),
    async (id) => {
      await nextTick()
      if (id !== null) revealTab(id)
      actions.tabsHost.value
        ?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    },
  )

  /** 展开目标标签的文件夹链，包含分组根。 */
  function revealTab(id: string): void {
    const tab = actions.tabs().find((item) => item.id === id)
    if (!tab) return
    const folder =
      tab.definitionId === null
        ? tab.folder
        : (actions.documents().find((item) => item.id === tab.definitionId)?.folder ?? '')
    const next = new Set(collapsed.value)
    next.delete(`${tab.kind}:`)
    let path = folder
    while (path !== '') {
      next.delete(`${tab.kind}:${path}`)
      path = parentPath(path)
    }
    collapsed.value = next
  }

  /** 仅关闭脏标签时确认，普通切换不阻塞编辑。 */
  function requestClose(id: string): void {
    if (actions.tabs().find((item) => item.id === id)?.dirty) pendingClose.value = id
    else actions.close(id)
  }
  /** 标签支持鼠标中键关闭，和浏览器标签页一致；脏标签仍走确认。 */
  function onTabAuxClick(event: MouseEvent, id: string): void {
    if (event.button !== 1) return
    event.preventDefault()
    requestClose(id)
  }
  /** 放弃当前待关闭标签的草稿。 */
  function discard(): void {
    if (pendingClose.value) actions.close(pendingClose.value)
    pendingClose.value = null
  }
  /** 标签用方向键、Home/End 切换，Delete 请求关闭。 */
  function onTabKeydown(event: KeyboardEvent, id: string): void {
    const items = actions.tabs()
    if (event.key === 'Delete') {
      event.preventDefault()
      requestClose(id)
      return
    }
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const index = items.findIndex((item) => item.id === id)
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length
    const tab = items[next]
    if (!tab) return
    actions.select(tab.id)
    const buttons =
      event.currentTarget instanceof HTMLElement
        ? event.currentTarget
            .closest('[role="tablist"]')
            ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
        : undefined
    buttons?.[next]?.focus()
  }

  /** 原生拖放只移动本工作区标签，不接受外部文本或文件作为标签。 */
  function onTabDragStart(event: DragEvent, id: string): void {
    draggedTabId.value = id
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', id)
    }
  }

  /** 悬浮目标只反馈位置，真正排序统一交给会话提交。 */
  function onTabDragOver(event: DragEvent, id: string): void {
    if (draggedTabId.value === null || draggedTabId.value === id) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    dropTargetId.value = id
  }

  /** 取消与完成都清除拖动状态。 */
  function endTabDrag(): void {
    draggedTabId.value = null
    dropTargetId.value = null
  }

  /** 移动到目标标签的位置，活动标签和编辑历史不变。 */
  function onTabDrop(event: DragEvent, targetId: string): void {
    event.preventDefault()
    const id = draggedTabId.value
    if (id !== null && id !== targetId) actions.move(id, targetId)
    endTabDrag()
  }

  /**
   * 唯一的菜单配置。
   *
   * 文件夹（含分组根）给出三项：新建文件、新建文件夹、删除文件夹，同属一组；
   * 文件在此基础上换成复制/删除文件，并单独成组。禁用只影响可用性，不改变菜单形状。
   */
  function menuEntries(row: ScriptTreeRow, menu: ScriptMenu): readonly ScriptMenuEntry[] {
    const blocked = actions.writable() ? '' : '正在保存或执行，请稍后重试'
    const folder = row.type === 'folder' ? row.path : row.folder
    const create: readonly ScriptMenuEntry[] = [
      {
        label: '新建文件',
        disabled: blocked,
        run: () => {
          actions.apply({ type: 'create-file', kind: row.kind, folder })
          menu.close()
        },
      },
      {
        label: '新建文件夹',
        disabled: blocked,
        run: () => {
          menu.input({
            label: '新建文件夹',
            value: '',
            submit: (name) =>
              actions.apply({
                type: 'create-folder',
                kind: row.kind,
                path: folder === '' ? name : `${folder}/${name}`,
              }),
            validate: (name) => (name.includes('/') ? '文件夹名称不能包含 /' : null),
          })
        },
      },
    ]
    if (row.type === 'folder') {
      return [
        ...create,
        {
          label: '删除文件夹',
          disabled: row.path === '' ? '分组根目录不能删除' : blocked,
          run: () => {
            menu.confirm({
              text: `删除文件夹「${row.name}」及其中的内容？`,
              confirmLabel: '删除文件夹',
              onConfirm: () =>
                actions.apply({ type: 'remove-folder', kind: row.kind, path: row.path }),
            })
          },
        },
      ]
    }
    const draftBlocked = row.target.kind === 'draft' ? '未保存的草稿，请先保存' : ''
    return [
      ...create,
      {
        label: '复制文件',
        separatorBefore: true,
        disabled: blocked || draftBlocked,
        run: async () => {
          if (row.target.kind !== 'document') return
          await actions.apply({ type: 'copy-file', id: row.target.documentId })
          menu.close()
        },
      },
      {
        label: '删除文件',
        disabled: row.readonly ? '内置脚本只读，无法删除' : blocked || draftBlocked,
        run: async () => {
          if (row.target.kind !== 'document') return
          await actions.apply({ type: 'delete-file', id: row.target.documentId })
          menu.close()
        },
      },
    ]
  }

  /** 统一的菜单渲染：条目表只在一处生成，这里不区分文件或文件夹。 */
  function openContextMenu(event: MouseEvent, row: ScriptTreeRow): void {
    event.preventDefault()
    event.stopPropagation()
    const menu = scriptMenu()
    menu.open(event.clientX, event.clientY, 'menu')
    menu.element.setAttribute('aria-label', '脚本文件菜单')
    for (const entry of menuEntries(row, menu)) {
      if (entry.separatorBefore) menu.separator()
      menu.button(entry.label, entry.run, {
        disabled: Boolean(entry.disabled),
        reason: entry.disabled,
      })
    }
  }

  return {
    explorerOpen,
    query,
    rows,
    pendingClose,
    closingTab,
    requestClose,
    onTabAuxClick,
    discard,
    onTabKeydown,
    activate,
    toggle,
    openContextMenu,
    draggedTabId,
    dropTargetId,
    onTabDragStart,
    onTabDragOver,
    onTabDrop,
    endTabDrag,
  }
}
