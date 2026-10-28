/** 多文档编辑会话：标签页持有各自草稿，当前编辑字段只投影活动标签。 */

import { generateUUID } from '@363045841yyt/klinechart-core'
import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
import type { LogEvent } from '@363045841yyt/klinechart-plot-contracts'
import { computed, onScopeDispose, type Ref, ref, shallowRef, watch } from 'vue'
import {
  createBlankSource,
  createCopySource,
  createLibrarySource,
  uniqueScriptName,
} from './scriptEditor/impl/createScriptDraft.js'
import type {
  ScriptEditorDocument,
  ScriptEditorFolder,
  ScriptEditorTab,
  ScriptIdentity,
  ScriptSourceStore,
  ScriptTreeAction,
} from './scriptEditor/types.js'

/** 文档草稿和已提交基线归同一个标签，切换时不复制当前编辑字段。 */
interface EditorDraft {
  id: string
  definitionId: string | null
  name: string | null
  title: string
  kind: 'indicator' | 'library'
  identity: ScriptIdentity
  source: string
  trusted: boolean
  revision: number | null
  baselineSource: string
  baselineTrusted: boolean
  saved: boolean
  error: string | null
  outputId: string | null
  /** 新建草稿的落盘目录；已提交文档以仓库记录为准。 */
  folder: string
}

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
  readonly error: Readonly<Ref<string | null>>
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

/** 判断草稿是否还没有提交，含未保存的新建文档。 */
function isDirty(draft: EditorDraft): boolean {
  return (
    draft.definitionId === null ||
    draft.source !== draft.baselineSource ||
    draft.trusted !== draft.baselineTrusted
  )
}

/** 草稿字段默认值只写一次；新建和打开文件只声明差异，避免结构漂移。 */
type DraftSeed = Pick<EditorDraft, 'id' | 'title' | 'kind' | 'source'> &
  Partial<Omit<EditorDraft, 'id' | 'title' | 'kind' | 'source'>>

function createDraft(seed: DraftSeed): EditorDraft {
  return {
    definitionId: null,
    name: null,
    trusted: false,
    identity: 'user',
    revision: null,
    baselineSource: '',
    baselineTrusted: false,
    saved: false,
    error: null,
    outputId: null,
    folder: '',
    ...seed,
  }
}

/** 创建会话；关闭编辑器不丢弃标签，显式关闭标签才移除草稿。 */
export function useScriptEditor(
  store: ScriptSourceStore | undefined,
  controller?: Readonly<Ref<ChartController | null>>,
): ScriptEditorSession {
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
  const tabs = computed<readonly ScriptEditorTab[]>(() =>
    drafts.value.map((item) => ({
      id: item.id,
      definitionId: item.definitionId,
      title: item.title,
      kind: item.kind,
      dirty: isDirty(item),
      folder: item.folder,
    })),
  )
  let sequence = 0

  /** 按标签身份更新不可变草稿，异步保存结果不落到其他文件。 */
  function update(id: string, changes: Partial<EditorDraft>): void {
    drafts.value = drafts.value.map((item) => (item.id === id ? { ...item, ...changes } : item))
  }
  const definitionId = computed(() => current.value?.definitionId ?? null)
  const name = computed(() => current.value?.name ?? null)
  const kind = computed(() => current.value?.kind ?? 'indicator')
  const identity = computed(() => current.value?.identity ?? 'builtin')
  const error = computed(() => treeError.value ?? current.value?.error ?? null)
  const saved = computed(() => current.value?.saved === true)
  const source = computed({
    get: () => current.value?.source ?? '',
    set(value: string) {
      const draft = current.value
      if (draft && draft.source !== value)
        update(draft.id, { source: value, trusted: false, saved: false })
    },
  })
  const trusted = computed({
    get: () => current.value?.trusted === true,
    set(value: boolean) {
      const draft = current.value
      if (draft && draft.trusted !== value) update(draft.id, { trusted: value, saved: false })
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
    outputId,
    (id) => {
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

  /** 目录刷新时仅同步未改动文档，脏草稿仍保留原版本以进行并发检查。 */
  function refreshDocuments(): void {
    documents.value = store ? store.list() : []
    folders.value = store ? store.listFolders() : []
    drafts.value = drafts.value.map((draft) => {
      const document = documents.value.find((item) => item.id === draft.definitionId)
      if (!document || isDirty(draft) || document.revision === draft.revision) return draft
      return {
        ...draft,
        source: document.source,
        baselineSource: document.source,
        trusted: document.trusted,
        baselineTrusted: document.trusted,
        revision: document.revision,
        name: document.definition.name,
        title: document.definition.name,
        folder: document.folder,
      }
    })
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
    const source = document?.source ?? ''
    const trusted = document?.trusted === true
    return createDraft({
      id: `draft_${++sequence}`,
      definitionId: documentId,
      name: document?.definition.name ?? null,
      title: document?.definition.name ?? fallbackId,
      kind: document?.kind ?? 'indicator',
      identity: document?.identity ?? 'builtin',
      source,
      trusted,
      revision: document?.revision ?? null,
      baselineSource: source,
      baselineTrusted: trusted,
      folder: document?.folder ?? '',
      error: document ? null : '此文件没有可编辑的脚本文档',
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

  /** 保存和添加到图表共用提交过程，并把结果绑定到发起操作的草稿。 */
  async function persistDraft(draft: EditorDraft, force = false): Promise<ScriptEditorDocument> {
    if (!store) throw new Error('此环境没有可编辑的脚本服务')
    if (!force && draft.definitionId !== null && !isDirty(draft)) {
      const document = store.read(draft.definitionId)
      if (!document) throw new Error('此文件没有可编辑的脚本文档')
      return document
    }
    if (draft.identity !== 'user') throw new Error('内置脚本只读，请创建副本')
    saving.value = true
    try {
      const document =
        draft.definitionId === null
          ? await store.create(draft.source, draft.trusted, draft.folder)
          : await store.update(
              draft.definitionId,
              draft.source,
              requireRevision(draft),
              draft.trusted,
            )
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
      refreshDocuments()
      return document
    } finally {
      saving.value = false
    }
  }

  /** 两个快捷操作共享状态、错误反馈与当前图表；调试只执行草稿，添加才提交定义。 */
  async function execute(action: 'run' | 'add-to-chart'): Promise<void> {
    const draft = current.value
    if (!draft || draft.kind !== 'indicator' || saving.value || executing.value !== null) return
    executing.value = action
    update(draft.id, { error: null })
    try {
      const chart = controller?.value
      if (!chart) throw new Error('当前图表尚未就绪')
      if (action === 'run') {
        if (!store?.run || !store.output) throw new Error('此环境没有脚本运行服务')
        const run = store.run.bind(store)
        const debugOutputId = `${sessionId}:${draft.id}`
        update(draft.id, { outputId: debugOutputId })
        await chart.withIndicatorData((bars, market) =>
          run({
            outputId: debugOutputId,
            source: draft.source,
            trusted: draft.trusted,
            bars,
            market,
          }),
        )
      } else {
        const document = await persistDraft(draft)
        if (!chart.indicators.peek().some((item) => item.definitionId === document.id)) {
          if (chart.addIndicator(document.id) === null) throw new Error('添加指标到图表失败')
        }
        update(draft.id, { outputId: document.id })
      }
    } catch (failure) {
      update(draft.id, { error: failure instanceof Error ? failure.message : String(failure) })
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
      activeTabId.value =
        drafts.value[Math.max(0, Math.min(activeIndex, drafts.value.length - 1))]?.id ?? null
  }

  /** 动作是通知，结果通过会话状态反馈，两个窗口不再各自解释异步失败。 */
  async function applyTreeAction(action: ScriptTreeAction): Promise<void> {
    if (saving.value || executing.value !== null) return
    treeError.value = null
    if (action.type === 'create-file') {
      openBlank(action.kind, action.folder)
      return
    }
    saving.value = true
    let copiedId: string | undefined
    try {
      if (!store) throw new Error('此环境没有可编辑的脚本服务')
      switch (action.type) {
        case 'create-folder':
          await store.createFolder({ kind: action.kind, path: action.path })
          break
        case 'remove-folder': {
          const removed = await store.removeFolder({ kind: action.kind, path: action.path })
          const ids = new Set(removed.documentIds)
          const paths = new Set(removed.folders.map((folder) => folder.path))
          removeDrafts((draft) =>
            draft.definitionId !== null
              ? ids.has(draft.definitionId)
              : draft.kind === action.kind && paths.has(draft.folder),
          )
          break
        }
        case 'copy-file': {
          const document = store.read(action.id)
          if (!document) throw new Error('脚本不存在')
          const title = uniqueName(`${document.definition.name} 副本`)
          const copy = await store.create(
            await createCopySource(document.source, title),
            document.trusted,
            document.folder,
          )
          copiedId = copy.id
          break
        }
        case 'delete-file': {
          const document = store.read(action.id)
          if (!document) throw new Error('脚本不存在')
          await store.remove(document.id, document.revision)
          removeDrafts((draft) => draft.definitionId === document.id)
          break
        }
      }
      refreshDocuments()
    } catch (failure) {
      treeError.value = failure instanceof Error ? failure.message : String(failure)
    } finally {
      saving.value = false
    }
    if (copiedId) {
      const wasOpen = open.value
      openDocument(copiedId)
      open.value = wasOpen
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
      if (activeTabId.value === id)
        activeTabId.value = drafts.value[Math.min(index, drafts.value.length - 1)]?.id ?? null
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
        if (current.value?.id === draft.id) {
          const wasOpen = open.value
          addDraft(draft.kind, title, copy, draft.folder)
          open.value = wasOpen
        }
      } catch (failure) {
        update(draft.id, { error: failure instanceof Error ? failure.message : String(failure) })
      }
    },
    async save() {
      const draft = current.value
      if (saving.value || executing.value !== null || !draft) return
      if (!store) {
        update(draft.id, { error: '此环境没有可编辑的脚本服务', saved: false })
        return
      }
      if (draft.identity !== 'user') {
        update(draft.id, { error: '内置脚本只读，请创建副本' })
        return
      }
      try {
        await persistDraft(draft, true)
      } catch (failure) {
        update(draft.id, {
          error: failure instanceof Error ? failure.message : String(failure),
          saved: false,
        })
      } finally {
        saving.value = false
      }
    },
  }
}

/** 已保存文件必须携带读取时的修订号，不能绕过乐观并发检查。 */
function requireRevision(draft: EditorDraft): number {
  if (draft.revision === null) throw new Error('此文件没有可编辑的脚本文档')
  return draft.revision
}
