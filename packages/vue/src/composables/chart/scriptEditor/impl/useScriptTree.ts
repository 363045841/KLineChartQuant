/** 文件树投影：文档、草稿和目录只在这里组合；组件只消费可见行。 */
import { parentFolderPath } from '@363045841yyt/klinechart-plot-contracts'
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

type FileRow = Extract<ScriptTreeRow, { type: 'file' }>

/** 文件行只投影一次，按所属目录分桶；打开标签决定脏状态与选中身份。 */
function indexFiles(
  documents: readonly ScriptEditorDocument[],
  tabs: readonly ScriptEditorTab[],
): Map<string, FileRow[]> {
  const openTabs = new Map(
    tabs.filter((tab) => tab.definitionId !== null).map((tab) => [tab.definitionId, tab] as const),
  )
  const indexed = new Map<string, FileRow[]>()
  /** 分桶只发生在建索引阶段，遍历时不再扫描全量文档。 */
  function add(row: FileRow): void {
    const bucket = key(row.kind, row.folder)
    const list = indexed.get(bucket) ?? []
    list.push(row)
    indexed.set(bucket, list)
  }
  for (const document of documents) {
    const tab = openTabs.get(document.id)
    add({
      type: 'file',
      key: `file:${document.id}`,
      kind: document.kind,
      target: { kind: 'document', documentId: document.id },
      name: document.definition.name,
      folder: document.folder,
      depth: 0,
      tabId: tab ? tab.id : null,
      readonly: document.identity === 'builtin',
      dirty: tab ? tab.dirty : false,
    })
  }
  for (const tab of tabs) {
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
  for (const list of indexed.values()) list.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  return indexed
}

/** 目录按父路径分桶；子目录与文件共用同一个父键。 */
function indexFolders(folders: readonly ScriptEditorFolder[]): Map<string, ScriptEditorFolder[]> {
  const indexed = new Map<string, ScriptEditorFolder[]>()
  for (const folder of folders) {
    const bucket = key(folder.kind, parentFolderPath(folder.path))
    const list = indexed.get(bucket) ?? []
    list.push(folder)
    indexed.set(bucket, list)
  }
  for (const list of indexed.values()) list.sort((a, b) => a.path.localeCompare(b.path, 'zh-CN'))
  return indexed
}

/** 建立索引后遍历可见节点，展开和搜索不重复扫描全部文档。 */
export function useScriptTree(source: TreeSource) {
  const query = ref('')
  const collapsed = ref<ReadonlySet<string>>(new Set())

  const index = computed(() => ({
    files: indexFiles(source.documents(), source.tabs()),
    folders: indexFolders(source.folders()),
    documents: new Map(source.documents().map((document) => [document.id, document] as const)),
  }))

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
      const document =
        tab.definitionId === null ? undefined : index.value.documents.get(tab.definitionId)
      let path = document ? document.folder : tab.folder
      const next = new Set(collapsed.value)
      next.delete(key(tab.kind, ''))
      while (path) {
        next.delete(key(tab.kind, path))
        path = parentFolderPath(path)
      }
      collapsed.value = next
    },
  )

  return { query, rows, activate }
}
