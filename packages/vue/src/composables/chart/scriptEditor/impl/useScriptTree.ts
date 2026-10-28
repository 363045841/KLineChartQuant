/** 文件树投影：文档、草稿和目录只在这里组合；组件只消费可见行。 */
import { computed, ref, watch } from 'vue'
import type {
  ScriptEditorDocument,
  ScriptEditorFolder,
  ScriptEditorTab,
  ScriptTreeRow,
} from '../types.js'

type ScriptKind = ScriptEditorFolder['kind']
const ROOTS: readonly (readonly [ScriptKind, string])[] = [
  ['indicator', '指标'],
  ['library', '库'],
]

interface TreeSource {
  documents(): readonly ScriptEditorDocument[]
  folders(): readonly ScriptEditorFolder[]
  tabs(): readonly ScriptEditorTab[]
  activeTabId(): string | null
  select(id: string): void
  openFile(id: string): void
}

/** 折叠状态和父子索引共用目录身份。 */
function key(kind: ScriptKind, path: string): string {
  return `${kind}:${path}`
}

/** 目录层级仅用于呈现，路径有效性由仓库维护。 */
function parent(path: string): string {
  const index = path.lastIndexOf('/')
  return index < 0 ? '' : path.slice(0, index)
}

type FileRow = Extract<ScriptTreeRow, { type: 'file' }>

/** 建立索引后遍历可见节点，展开和搜索不重复扫描全部文档。 */
export function useScriptTree(source: TreeSource) {
  const explorerOpen = ref(true)
  const query = ref('')
  const collapsed = ref<ReadonlySet<string>>(new Set())

  const index = computed(() => {
    const tabs = new Map(
      source
        .tabs()
        .filter((tab) => tab.definitionId !== null)
        .map((tab) => [tab.definitionId, tab]),
    )
    const documents = new Map(source.documents().map((document) => [document.id, document]))
    const files = new Map<string, FileRow[]>()
    const folders = new Map<string, ScriptEditorFolder[]>()
    /** 每个文件只投影一次，之后按所属目录直接取子项。 */
    function add(row: FileRow): void {
      const folderKey = key(row.kind, row.folder)
      const list = files.get(folderKey) ?? []
      list.push(row)
      files.set(folderKey, list)
    }
    for (const document of documents.values()) {
      const tab = tabs.get(document.id)
      add({
        type: 'file',
        key: `file:${document.id}`,
        kind: document.kind,
        target: { kind: 'document', documentId: document.id },
        name: document.definition.name,
        folder: document.folder,
        depth: 0,
        tabId: tab?.id ?? null,
        readonly: document.identity === 'builtin',
        dirty: tab?.dirty ?? false,
      })
    }
    for (const tab of source.tabs()) {
      if (tab.definitionId !== null) continue
      add({
        type: 'file',
        key: `draft:${tab.id}`,
        kind: tab.kind,
        target: { kind: 'draft', tabId: tab.id },
        name: tab.title,
        folder: tab.folder,
        depth: 0,
        tabId: tab.id,
        readonly: false,
        dirty: tab.dirty,
      })
    }
    for (const folder of source.folders()) {
      const parentKey = key(folder.kind, parent(folder.path))
      const list = folders.get(parentKey) ?? []
      list.push(folder)
      folders.set(parentKey, list)
    }
    for (const list of files.values()) list.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
    for (const list of folders.values()) list.sort((a, b) => a.path.localeCompare(b.path, 'zh-CN'))
    return { files, folders, documents }
  })

  const rows = computed<readonly ScriptTreeRow[]>(() => {
    const search = query.value.trim().toLocaleLowerCase()
    // 搜索是平铺文件结果，保留每个文件原有身份与所属目录。
    if (search) {
      const files = [...index.value.files.values()].flat()
      return ROOTS.flatMap(([kind]) =>
        files
          .filter(
            (file) => file.kind === kind && `${file.name}.ts`.toLocaleLowerCase().includes(search),
          )
          .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')),
      )
    }
    const result: ScriptTreeRow[] = []
    /** 根目录和普通目录使用同一条递归路径。 */
    function visit(kind: ScriptKind, path: string, name: string, depth: number): void {
      const folderKey = key(kind, path)
      const expanded = !collapsed.value.has(folderKey)
      result.push({ type: 'folder', key: `folder:${folderKey}`, kind, path, name, depth, expanded })
      if (!expanded) return
      for (const child of index.value.folders.get(folderKey) ?? [])
        visit(kind, child.path, child.path.slice(child.path.lastIndexOf('/') + 1), depth + 1)
      for (const file of index.value.files.get(folderKey) ?? [])
        result.push({ ...file, depth: depth + 1 })
    }
    for (const [kind, name] of ROOTS) visit(kind, '', name, 0)
    return result
  })

  /** 文件夹切换展开；文件激活已有标签或通知宿主打开文档。 */
  function activate(row: ScriptTreeRow): void {
    if (row.type === 'folder') {
      const next = new Set(collapsed.value)
      const folderKey = key(row.kind, row.path)
      if (next.has(folderKey)) next.delete(folderKey)
      else next.add(folderKey)
      collapsed.value = next
    } else if (row.tabId !== null) source.select(row.tabId)
    else if (row.target.kind === 'document') source.openFile(row.target.documentId)
  }

  watch(
    () => source.activeTabId(),
    (id) => {
      const tab = source.tabs().find((item) => item.id === id)
      if (!tab) return
      let path =
        tab.definitionId === null
          ? tab.folder
          : (index.value.documents.get(tab.definitionId)?.folder ?? '')
      const next = new Set(collapsed.value)
      next.delete(key(tab.kind, ''))
      while (path) {
        next.delete(key(tab.kind, path))
        path = parent(path)
      }
      collapsed.value = next
    },
  )

  return { explorerOpen, query, rows, activate }
}
