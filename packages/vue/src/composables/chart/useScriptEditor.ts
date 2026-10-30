/** 多文档编辑会话：标签页持有各自草稿，当前编辑字段只投影活动标签。 */
import { generateUUID } from '@363045841yyt/klinechart-core'
import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
import type { LogEvent } from '@363045841yyt/klinechart-plot-contracts'
import { computed, onScopeDispose, type MaybeRef, type Ref, ref, shallowRef, unref, watch } from 'vue'
import {
  createBlankSource,
  createCopySource,
  createLibrarySource,
  uniqueScriptName,
} from './scriptEditor/impl/createScriptDraft.js'
import { errorText } from './scriptEditor/impl/errorText.js'
import {
  createDraft,
  type EditorDraft,
  isDirty,
  neighborId,
  patchDrafts,
  syncWithDocuments,
  toTabs,
} from './scriptEditor/impl/scriptDrafts.js'
import { addDraftToChart, runDraft } from './scriptEditor/impl/scriptExecution.js'
import { type DroppedTreeItems, performTreeAction } from './scriptEditor/impl/scriptTreeActions.js'
import type {
  ScriptEditorDocument,
  ScriptEditorFolder,
  ScriptEditorTab,
  ScriptIdentity,
  ScriptSourceStore,
  ScriptTreeAction,
} from './scriptEditor/types.js'

/** 一个图表的编辑标签、当前草稿投影与仓库操作。 */
export interface ScriptEditorSession {
  readonly tabs: Readonly<Ref<readonly ScriptEditorTab[]>>
  readonly activeTabId: Ref<string | null>
  selectTab(id: string): void
  closeTab(id: string): void
  moveTab(id: string, targetId: string): void
  readonly kind: Readonly<Ref<'indicator' | 'library'>>
  readonly documents: Ref<readonly ScriptEditorDocument[]>
  readonly folders: Ref<readonly ScriptEditorFolder[]>
  readonly libraries: Readonly<Ref<readonly { name: string; source: string }[]>>
  refreshDocuments(): void
  readonly logs: Ref<readonly LogEvent[]>
  clearOutput(): void
  readonly name: Readonly<Ref<string | null>>
  readonly identity: Readonly<Ref<ScriptIdentity>>
  readonly saving: Ref<boolean>
  createCopy(): Promise<void>
  readonly open: Ref<boolean>
  readonly definitionId: Readonly<Ref<string | null>>
  readonly source: Ref<string>
  readonly trusted: Ref<boolean>
  /** 当前标签保存/复制等操作失败；与代码诊断分开，写入问题列表。 */
  readonly error: Readonly<Ref<string | null>>
  /** 当前标签调试或添加失败；与 error 一起构成当前文档的失败，编辑源码后清空。 */
  readonly executionError: Readonly<Ref<string | null>>
  /** 文件树操作失败；只由目录区域展示，不混入代码问题。 */
  readonly treeError: Readonly<Ref<string | null>>
  readonly saved: Readonly<Ref<boolean>>
  openFor(id: string): void
  openBlank(kind?: 'indicator' | 'library', folder?: string): void
  /** 文件树操作的唯一入口；统一维护忙碌状态和可展示的失败原因。 */
  applyTreeAction(action: ScriptTreeAction): Promise<void>
  close(): void
  save(): Promise<void>
  readonly executing: Ref<'run' | 'add-to-chart' | null>
  run(): Promise<void>
  addToChart(): Promise<void>
}

/** 已保存文件必须携带读取时的修订号，不能绕过乐观并发检查。 */
function requireRevision(draft: EditorDraft): number {
  if (draft.revision === null) throw new Error('此文件没有可编辑的脚本文档')
  return draft.revision
}

/** 创建会话；关闭编辑器不丢弃标签，显式关闭标签才移除草稿。 */
export function useScriptEditor(
  sourceStore: MaybeRef<ScriptSourceStore | undefined>,
  controller?: Readonly<Ref<ChartController | null>>,
): ScriptEditorSession {
  let store = unref(sourceStore)
  watch(() => unref(sourceStore), (value) => {
    store = value
    refreshDocuments()
  }, { flush: 'sync' })
  const open = ref(false)
  const saving = ref(false)
  const treeError = ref<string | null>(null)
  const executing = ref<'run' | 'add-to-chart' | null>(null)
  const sessionId = generateUUID()
  const activeTabId = ref<string | null>(null)
  const drafts = shallowRef<readonly EditorDraft[]>([])
  const current = computed(() => drafts.value.find((item) => item.id === activeTabId.value))
  const documents = shallowRef<readonly ScriptEditorDocument[]>([])
  const folders = shallowRef<readonly ScriptEditorFolder[]>([])
  // 内置库的类型由编译器契约提供，编辑器只同步用户库，避免重复声明 ta。
  const libraries = computed(() =>
    documents.value
      .filter((item) => item.kind === 'library' && item.identity === 'user')
      .map((item) => ({ name: item.definition.name, source: item.source })),
  )
  const tabs = computed(() => toTabs(drafts.value))
  let sequence = 0

  /** 按标签身份更新不可变草稿，异步保存结果不落到其他文件。 */
  function update(id: string, changes: Partial<EditorDraft>): void {
    drafts.value = patchDrafts(drafts.value, id, changes)
  }
  const definitionId = computed(() => current.value?.definitionId ?? null)
  const name = computed(() => current.value?.name ?? null)
  const kind = computed(() => current.value?.kind ?? 'indicator')
  const identity = computed(() => current.value?.identity ?? 'builtin')
  const error = computed(() => current.value?.error ?? null)
  const executionError = computed(() => current.value?.executionError ?? null)
  const saved = computed(() => current.value?.saved === true)
  const source = computed({
    get: () => current.value?.source ?? '',
    set(value: string) {
      const draft = current.value
      if (draft && draft.source !== value)
        // 编辑即作废旧内容的保存与执行结论。
        update(draft.id, {
          source: value,
          trusted: false,
          saved: false,
          error: null,
          executionError: null,
        })
    },
  })
  const trusted = computed({
    get: () => current.value?.trusted === true,
    set(value: boolean) {
      const draft = current.value
      if (draft && draft.trusted !== value)
        update(draft.id, { trusted: value, saved: false, executionError: null })
    },
  })
  const logs = shallowRef<readonly LogEvent[]>([])
  let unsubscribeOutput: (() => void) | undefined
  const outputId = computed(() =>
    current.value
      ? (current.value.outputId ?? current.value.definitionId ?? current.value.id)
      : null,
  )
  watch(
    [outputId, () => unref(sourceStore)],
    ([id]) => {
      unsubscribeOutput?.()
      unsubscribeOutput = undefined
      logs.value = []
      if (id !== null)
        unsubscribeOutput = store?.output?.subscribe(id, (events) => {
          logs.value = events
        })
    },
    { flush: 'sync' },
  )
  onScopeDispose(() => unsubscribeOutput?.())

  /** 仓库只在有服务时可用；缺服务时给出可展示的原因。 */
  function requireStore(): ScriptSourceStore {
    if (!store) throw new Error('此环境没有可编辑的脚本服务')
    return store
  }

  /** 目录刷新时仅同步未改动文档，脏草稿仍保留原版本以进行并发检查。 */
  function refreshDocuments(): void {
    documents.value = store ? store.list() : []
    folders.value = store ? store.listFolders() : []
    drafts.value = syncWithDocuments(drafts.value, documents.value)
    // 目录重新读取即视为树状态已同步，上一次失败的提示不再保留。
    treeError.value = null
  }

  /** 名称同时避开已提交文件和未保存标签。 */
  function uniqueName(base: string): string {
    return uniqueScriptName(
      store,
      base,
      drafts.value.map((item) => item.title),
    )
  }

  /** 新草稿分配会话内稳定标签身份，保存后也不改变标签键。 */
  function addDraft(
    nextKind: 'indicator' | 'library',
    title: string,
    text: string,
    folder = '',
  ): void {
    const draft = createDraft({
      id: `draft_${++sequence}`,
      title,
      kind: nextKind,
      source: text,
      folder,
    })
    drafts.value = [...drafts.value, draft]
    activeTabId.value = draft.id
    open.value = true
  }

  /** 已提交文档转成编辑草稿；缺失文档保留只读身份与可见错误。 */
  function draftFromDocument(
    documentId: string,
    document: ScriptEditorDocument | undefined,
    fallbackId: string,
  ): EditorDraft {
    const id = `draft_${++sequence}`
    if (!document) {
      return createDraft({
        id,
        definitionId: documentId,
        title: fallbackId,
        kind: 'indicator',
        identity: 'builtin',
        source: '',
        error: '此文件没有可编辑的脚本文档',
      })
    }
    return createDraft({
      id,
      definitionId: documentId,
      name: document.definition.name,
      title: document.definition.name,
      kind: document.kind,
      identity: document.identity,
      source: document.source,
      trusted: document.trusted,
      revision: document.revision,
      baselineSource: document.source,
      baselineTrusted: document.trusted,
      folder: document.folder,
    })
  }

  /** 打开已提交文档的标签；重复打开只切换活动标签。 */
  function openDocument(id: string): void {
    if (saving.value) return
    refreshDocuments()
    const document = store?.read(id)
    const documentId = document ? document.id : id
    const existing = drafts.value.find((item) => item.definitionId === documentId)
    if (existing) activeTabId.value = existing.id
    else {
      const draft = draftFromDocument(documentId, document, id)
      drafts.value = [...drafts.value, draft]
      activeTabId.value = draft.id
    }
    open.value = true
  }

  /** 新建走 create，已提交文档带修订号 update。 */
  function commitDraft(
    service: ScriptSourceStore,
    draft: EditorDraft,
  ): Promise<ScriptEditorDocument> {
    if (draft.definitionId === null)
      return service.create(draft.source, draft.trusted, draft.folder)
    return service.update(draft.definitionId, draft.source, requireRevision(draft), draft.trusted)
  }

  /** 提交结果只回写发起操作的草稿；期间的新输入保持未保存。 */
  function applyCommitted(draft: EditorDraft, document: ScriptEditorDocument): void {
    const latest = drafts.value.find((item) => item.id === draft.id)
    update(draft.id, {
      definitionId: document.id,
      name: document.definition.name,
      title: document.definition.name,
      kind: document.kind,
      folder: document.folder,
      revision: document.revision,
      baselineSource: draft.source,
      baselineTrusted: draft.trusted,
      saved: latest?.source === draft.source && latest?.trusted === draft.trusted,
      error: null,
    })
  }

  /** 保存和添加到图表共用提交过程，并把结果绑定到发起操作的草稿。 */
  async function persistDraft(draft: EditorDraft, force = false): Promise<ScriptEditorDocument> {
    const service = requireStore()
    if (!force && draft.definitionId !== null && !isDirty(draft)) {
      const document = service.read(draft.definitionId)
      if (!document) throw new Error('此文件没有可编辑的脚本文档')
      return document
    }
    if (draft.identity !== 'user') throw new Error('内置脚本只读，请创建副本')
    saving.value = true
    try {
      const document = await commitDraft(service, draft)
      applyCommitted(draft, document)
      refreshDocuments()
      return document
    } finally {
      saving.value = false
    }
  }

  /** 保存或执行进行中时不再接受新的编辑动作。 */
  function busy(): boolean {
    return saving.value || executing.value !== null
  }

  /** 当前图表；未挂载时由执行函数给出可展示原因。 */
  function currentChart(): ChartController | null {
    return controller ? controller.value : null
  }

  /** 两个快捷操作共享状态、错误反馈与当前图表；调试只执行草稿，添加才提交定义。 */
  async function execute(action: 'run' | 'add-to-chart'): Promise<void> {
    const draft = current.value
    if (!draft || draft.kind !== 'indicator' || busy()) return
    executing.value = action
    update(draft.id, { executionError: null })
    try {
      if (action === 'run') {
        await runDraft({
          chart: currentChart(),
          store,
          sessionId,
          draft,
          onOutputId: (next) => update(draft.id, { outputId: next }),
        })
      } else {
        await addDraftToChart(currentChart(), draft, persistDraft, (document) =>
          update(draft.id, { outputId: document.id }),
        )
      }
    } catch (failure) {
      update(draft.id, { executionError: errorText(failure) })
    } finally {
      executing.value = null
    }
  }

  /** 在指定目录新建草稿。 */
  function openBlank(nextKind: 'indicator' | 'library' = 'indicator', folder = ''): void {
    if (saving.value) return
    refreshDocuments()
    const title = uniqueName(nextKind === 'library' ? 'myLibrary' : '我的脚本')
    addDraft(
      nextKind,
      title,
      store ? (nextKind === 'library' ? createLibrarySource(title) : createBlankSource(title)) : '',
      folder,
    )
  }

  /** 仓库提交成功后才清理会话；文件与目录删除共用标签选择规则。 */
  function removeDrafts(matches: (draft: EditorDraft) => boolean): void {
    const activeIndex = drafts.value.findIndex((draft) => draft.id === activeTabId.value)
    drafts.value = drafts.value.filter((draft) => !matches(draft))
    if (!drafts.value.some((draft) => draft.id === activeTabId.value))
      activeTabId.value = neighborId(drafts.value, activeIndex)
  }

  /** 仓库删除成功后同步标签：已保存文档按定义 id 匹配，草稿按目录匹配。 */
  function dropTabs(items: DroppedTreeItems): void {
    const { documentIds, folder } = items
    removeDrafts((draft) => {
      if (draft.definitionId !== null) return documentIds.has(draft.definitionId)
      return folder !== undefined && draft.kind === folder.kind && folder.paths.has(draft.folder)
    })
  }

  /** 动作是通知，结果通过会话状态反馈，两个窗口不再各自解释异步失败。 */
  async function applyTreeAction(action: ScriptTreeAction): Promise<void> {
    if (busy()) return
    if (action.type === 'create-file') {
      openBlank(action.kind, action.folder)
      return
    }
    saving.value = true
    try {
      await performTreeAction({
        action,
        store,
        uniqueName,
        dropDocument: dropTabs,
        openDocument(id) {
          const wasOpen = open.value
          openDocument(id)
          open.value = wasOpen
        },
      })
      refreshDocuments()
    } catch (failure) {
      treeError.value = errorText(failure)
    } finally {
      saving.value = false
    }
  }

  return {
    tabs,
    activeTabId,
    kind,
    documents,
    folders,
    libraries,
    refreshDocuments,
    logs,
    name,
    identity,
    saving,
    open,
    definitionId,
    source,
    trusted,
    error,
    treeError,
    executionError,
    saved,
    executing,
    run: () => execute('run'),
    addToChart: () => execute('add-to-chart'),
    clearOutput() {
      if (outputId.value !== null) store?.output?.clear(outputId.value)
      logs.value = []
    },
    selectTab(id) {
      if (!saving.value && drafts.value.some((item) => item.id === id)) activeTabId.value = id
    },
    moveTab(id, targetId) {
      if (saving.value || id === targetId) return
      const from = drafts.value.findIndex((item) => item.id === id)
      const to = drafts.value.findIndex((item) => item.id === targetId)
      if (from < 0 || to < 0) return
      const next = [...drafts.value]
      const [draft] = next.splice(from, 1)
      if (!draft) return
      next.splice(to, 0, draft)
      drafts.value = next
    },
    closeTab(id) {
      if (saving.value) return
      const index = drafts.value.findIndex((item) => item.id === id)
      if (index < 0) return
      drafts.value = drafts.value.filter((item) => item.id !== id)
      if (activeTabId.value === id) activeTabId.value = neighborId(drafts.value, index)
    },
    openFor(id) {
      openDocument(id)
    },
    openBlank,
    applyTreeAction,
    close() {
      if (saving.value) return
      open.value = false
      activeTabId.value = null
    },
    async createCopy() {
      const draft = current.value
      if (!store || !draft || !draft.definitionId || saving.value) return
      try {
        const title = uniqueName(`${draft.name} 副本`)
        const copy = await createCopySource(draft.source, title)
        if (current.value?.id !== draft.id) return
        const wasOpen = open.value
        addDraft(draft.kind, title, copy, draft.folder)
        open.value = wasOpen
      } catch (failure) {
        update(draft.id, { error: errorText(failure) })
      }
    },
    async save() {
      const draft = current.value
      if (busy() || !draft) return
      try {
        await persistDraft(draft, true)
      } catch (failure) {
        update(draft.id, { error: errorText(failure), saved: false })
      }
    },
  }
}
