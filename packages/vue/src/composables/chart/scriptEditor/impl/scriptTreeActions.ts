/** 文件树动作：目录与文档的一次写操作，会话负责清理标签与统一反馈。 */
import type { ScriptEditorFolder, ScriptSourceStore, ScriptTreeAction } from '../types.js'
import { createCopySource } from './createScriptDraft.js'

/** 已由仓库确认的删除结果，供会话清理对应标签。 */
export interface DroppedTreeItems {
  readonly documentIds: ReadonlySet<string>
  /** 目录删除时同时清理该目录下的未保存草稿。 */
  readonly folder?: {
    readonly kind: ScriptEditorFolder['kind']
    readonly paths: ReadonlySet<string>
  }
}

/** 树动作所需的仓库、命名与结果回写。 */
export interface TreeActionRequest {
  readonly action: Exclude<ScriptTreeAction, { type: 'create-file' }>
  readonly store: ScriptSourceStore | undefined
  /** 为副本生成不与现有文档冲突的名称。 */
  uniqueName(base: string): string
  dropDocument(items: DroppedTreeItems): void
  /** 副本创建成功后打开它。 */
  openDocument(id: string): void
}

/** 执行一次目录或文档写操作；失败直接抛出，由会话统一展示。 */
export async function performTreeAction(request: TreeActionRequest): Promise<void> {
  const { action, store, uniqueName, dropDocument, openDocument } = request
  if (!store) throw new Error('此环境没有可编辑的脚本服务')
  switch (action.type) {
    case 'create-folder':
      await store.createFolder({ kind: action.kind, path: action.path })
      return
    case 'remove-folder': {
      const removed = await store.removeFolder({ kind: action.kind, path: action.path })
      dropDocument({
        documentIds: new Set(removed.documentIds),
        folder: { kind: action.kind, paths: new Set(removed.folders.map((folder) => folder.path)) },
      })
      return
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
      openDocument(copy.id)
      return
    }
    case 'delete-file': {
      const document = store.read(action.id)
      if (!document) throw new Error('脚本不存在')
      await store.remove(document.id, document.revision)
      dropDocument({ documentIds: new Set([document.id]) })
    }
  }
}
