/** 多文档编辑会话：标签页持有各自草稿，当前编辑字段只投影活动标签。 */
import type { LogEvent } from '@363045841yyt/klinechart-plot-contracts'
import { computed, onScopeDispose, type Ref, ref, shallowRef, watch } from 'vue'
import { createBlankSource, createCopySource, createLibrarySource, uniqueScriptName } from './scriptEditor/impl/createScriptDraft.js'
import type { ScriptEditorDocument, ScriptEditorTab, ScriptIdentity, ScriptSourceStore } from './scriptEditor/types.js'

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
}

/** 一个图表的编辑标签、当前草稿投影与仓库操作。 */
export interface ScriptEditorSession {
  readonly tabs: Readonly<Ref<readonly ScriptEditorTab[]>>
  readonly activeTabId: Ref<string | null>
  selectTab(id: string): void
  closeTab(id: string): void
  readonly kind: Readonly<Ref<'indicator' | 'library'>>
  readonly documents: Ref<readonly ScriptEditorDocument[]>
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
  openBlank(kind?: 'indicator' | 'library'): void
  close(): void
  save(): Promise<void>
}

/** 判断草稿是否还没有提交，含未保存的新建文档。 */
function isDirty(draft: EditorDraft): boolean {
  return draft.definitionId === null || draft.source !== draft.baselineSource || draft.trusted !== draft.baselineTrusted
}

/** 草稿字段默认值只写一次；新建和打开文件只声明差异，避免结构漂移。 */
type DraftSeed = Pick<EditorDraft, 'id' | 'title' | 'kind' | 'source'> & Partial<Omit<EditorDraft, 'id' | 'title' | 'kind' | 'source'>>

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
    ...seed,
  }
}

/** 创建会话；关闭编辑器不丢弃标签，显式关闭标签才移除草稿。 */
export function useScriptEditor(store: ScriptSourceStore | undefined): ScriptEditorSession {
  const open = ref(false)
  const saving = ref(false)
  const activeTabId = ref<string | null>(null)
  const drafts = shallowRef<readonly EditorDraft[]>([])
  const current = computed(() => drafts.value.find((item) => item.id === activeTabId.value))
  const documents = shallowRef<readonly ScriptEditorDocument[]>([])
  // 内置库的类型由编译器契约提供，编辑器只同步用户库，避免重复声明 ta。
  const libraries = computed(() => documents.value.filter((item) => item.kind === 'library' && item.identity === 'user').map((item) => ({ name: item.definition.name, source: item.source })))
  const tabs = computed<readonly ScriptEditorTab[]>(() => drafts.value.map((item) => ({ id: item.id, definitionId: item.definitionId, title: item.title, kind: item.kind, dirty: isDirty(item) })))
  let sequence = 0

  /** 按标签身份更新不可变草稿，异步保存结果不落到其他文件。 */
  function update(id: string, changes: Partial<EditorDraft>): void {
    drafts.value = drafts.value.map((item) => item.id === id ? { ...item, ...changes } : item)
  }
  const definitionId = computed(() => current.value?.definitionId ?? null)
  const name = computed(() => current.value?.name ?? null)
  const kind = computed(() => current.value?.kind ?? 'indicator')
  const identity = computed(() => current.value?.identity ?? 'builtin')
  const error = computed(() => current.value?.error ?? null)
  const saved = computed(() => current.value?.saved === true)
  const source = computed({
    get: () => current.value?.source ?? '',
    set(value: string) {
      const draft = current.value
      if (draft && draft.source !== value) update(draft.id, { source: value, trusted: false, saved: false })
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
  watch(definitionId, (id) => {
    unsubscribeOutput?.()
    unsubscribeOutput = undefined
    logs.value = []
    if (id !== null) unsubscribeOutput = store?.output?.subscribe(id, (events) => { logs.value = events })
  }, { flush: 'sync' })
  onScopeDispose(() => unsubscribeOutput?.())

  /** 目录刷新时仅同步未改动文档，脏草稿仍保留原版本以进行并发检查。 */
  function refreshDocuments(): void {
    documents.value = store ? store.list() : []
    drafts.value = drafts.value.map((draft) => {
      const document = documents.value.find((item) => item.id === draft.definitionId)
      if (!document || isDirty(draft) || document.revision === draft.revision) return draft
      return { ...draft, source: document.source, baselineSource: document.source, trusted: document.trusted, baselineTrusted: document.trusted, revision: document.revision, name: document.definition.name, title: document.definition.name }
    })
  }

  /** 名称同时避开已提交文件和未保存标签。 */
  function uniqueName(base: string): string {
    return uniqueScriptName(store, base, drafts.value.map((item) => item.title))
  }

  /** 新草稿分配会话内稳定标签身份，保存后也不改变标签键。 */
  function addDraft(nextKind: 'indicator' | 'library', title: string, text: string): void {
    const draft = createDraft({ id: `draft_${++sequence}`, title, kind: nextKind, source: text })
    drafts.value = [...drafts.value, draft]
    activeTabId.value = draft.id
    open.value = true
  }

  /** 已提交文档转成编辑草稿；缺失文档保留只读身份与可见错误。 */
  function draftFromDocument(documentId: string, document: ScriptEditorDocument | undefined, fallbackId: string): EditorDraft {
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
      error: document ? null : '此文件没有可编辑的脚本文档',
    })
  }

  return {
    tabs, activeTabId, kind, documents, libraries, refreshDocuments, logs, name, identity, saving, open, definitionId, source, trusted, error, saved,
    clearOutput() {
      if (definitionId.value !== null) store?.output?.clear(definitionId.value)
      logs.value = []
    },
    selectTab(id) {
      if (!saving.value && drafts.value.some((item) => item.id === id)) activeTabId.value = id
    },
    closeTab(id) {
      if (saving.value) return
      const index = drafts.value.findIndex((item) => item.id === id)
      if (index < 0) return
      drafts.value = drafts.value.filter((item) => item.id !== id)
      if (activeTabId.value === id) activeTabId.value = drafts.value[Math.min(index, drafts.value.length - 1)]?.id ?? null
    },
    openFor(id) {
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
    },
    openBlank(nextKind = 'indicator') {
      if (saving.value) return
      refreshDocuments()
      const title = uniqueName(nextKind === 'library' ? 'myLibrary' : '我的脚本')
      addDraft(nextKind, title, store ? nextKind === 'library' ? createLibrarySource(title) : createBlankSource(title) : '')
    },
    close() {
      if (saving.value) return
      open.value = false
      activeTabId.value = null
    },
    async createCopy() {
      const draft = current.value
      if (!store || !draft || draft.kind !== 'indicator' || draft.identity !== 'builtin' || !draft.definitionId || saving.value) return
      try {
        const title = uniqueName(`${draft.name} 副本`)
        const copy = await createCopySource(draft.source, title)
        if (current.value?.id === draft.id) {
          const wasOpen = open.value
          addDraft('indicator', title, copy)
          open.value = wasOpen
        }
      } catch (failure) {
        update(draft.id, { error: failure instanceof Error ? failure.message : String(failure) })
      }
    },
    async save() {
      const draft = current.value
      if (saving.value || !draft) return
      if (!store) { update(draft.id, { error: '此环境没有可编辑的脚本服务', saved: false }); return }
      if (draft.identity !== 'user') { update(draft.id, { error: '内置脚本只读，请创建副本' }); return }
      try {
        saving.value = true
        const document = draft.definitionId === null
          ? await store.create(draft.source, draft.trusted)
          : await store.update(draft.definitionId, draft.source, requireRevision(draft), draft.trusted)
        const latest = drafts.value.find((item) => item.id === draft.id)
        update(draft.id, { definitionId: document.id, name: document.definition.name, title: document.definition.name, kind: document.kind, revision: document.revision, baselineSource: draft.source, baselineTrusted: draft.trusted, saved: latest?.source === draft.source && latest?.trusted === draft.trusted, error: null })
        refreshDocuments()
      } catch (failure) {
        update(draft.id, { error: failure instanceof Error ? failure.message : String(failure), saved: false })
      } finally { saving.value = false }
    },
  }
}

/** 已保存文件必须携带读取时的修订号，不能绕过乐观并发检查。 */
function requireRevision(draft: EditorDraft): number {
  if (draft.revision === null) throw new Error('此文件没有可编辑的脚本文档')
  return draft.revision
}
