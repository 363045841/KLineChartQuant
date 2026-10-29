/** 编辑草稿模型：纯数据与纯变换，会话只负责编排。 */
import type { ScriptEditorDocument, ScriptEditorTab, ScriptIdentity } from '../types.js'

/** 文档草稿和已提交基线归同一个标签，切换时不复制当前编辑字段。 */
export interface EditorDraft {
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
  /** 最近一次调试或添加失败；与保存失败分开记录，编辑源码后清空。 */
  executionError: string | null
  outputId: string | null
  /** 新建草稿的落盘目录；已提交文档以仓库记录为准。 */
  folder: string
}

/** 草稿字段默认值只写一次；新建和打开文件只声明差异，避免结构漂移。 */
type DraftSeed = Pick<EditorDraft, 'id' | 'title' | 'kind' | 'source'> &
  Partial<Omit<EditorDraft, 'id' | 'title' | 'kind' | 'source'>>

/** 创建草稿；未声明的字段取默认值。 */
export function createDraft(seed: DraftSeed): EditorDraft {
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
    executionError: null,
    outputId: null,
    folder: '',
    ...seed,
  }
}

/** 判断草稿是否还没有提交，含未保存的新建文档。 */
export function isDirty(draft: EditorDraft): boolean {
  return (
    draft.definitionId === null ||
    draft.source !== draft.baselineSource ||
    draft.trusted !== draft.baselineTrusted
  )
}

/** 标签页只消费摘要，源码仍留在草稿里。 */
export function toTabs(drafts: readonly EditorDraft[]): readonly ScriptEditorTab[] {
  return drafts.map((item) => ({
    id: item.id,
    definitionId: item.definitionId,
    title: item.title,
    kind: item.kind,
    dirty: isDirty(item),
    folder: item.folder,
  }))
}

/** 按标签身份更新不可变草稿，异步结果不会落到其他文件。 */
export function patchDrafts(
  drafts: readonly EditorDraft[],
  id: string,
  changes: Partial<EditorDraft>,
): readonly EditorDraft[] {
  return drafts.map((item) => (item.id === id ? { ...item, ...changes } : item))
}

/** 目录刷新只同步未改动文档；脏草稿保留原版本以做并发检查。 */
export function syncWithDocuments(
  drafts: readonly EditorDraft[],
  documents: readonly ScriptEditorDocument[],
): readonly EditorDraft[] {
  return drafts.map((draft) => {
    const document = documents.find((item) => item.id === draft.definitionId)
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
      error: null,
      executionError: null,
    }
  })
}

/** 被删除标签的位置落到相邻标签上，避免跳回第一个标签。 */
export function neighborId(drafts: readonly EditorDraft[], index: number): string | null {
  return drafts[Math.max(0, Math.min(index, drafts.length - 1))]?.id ?? null
}
