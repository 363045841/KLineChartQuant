/**
 * 脚本编辑器会话：管理打开状态、当前脚本与草稿。
 *
 * 源码由宿主提供的仓库管理；编辑器只持有当前草稿，不维护第二份注册表。
 */
import { type Ref, ref, watch } from 'vue'
import type { ScriptSourceStore } from './scriptEditor/types.js'

/** 一个图表实例持有的编辑器会话状态与操作。 */
export interface ScriptEditorSession {
  /** 编辑器是否打开。 */
  readonly open: Ref<boolean>
  /** 当前编辑的脚本所属指标定义 id。 */
  readonly definitionId: Ref<string | null>
  /** 草稿源码，编辑期间不写回注册表。 */
  readonly source: Ref<string>
  /** 保存校验失败时的可读错误。 */
  readonly error: Ref<string | null>
  /** 最近一次保存是否成功；草稿再次变化或重新打开时复位。 */
  readonly saved: Ref<boolean>
  /** 打开编辑器并载入该指标的当前源码。 */
  openFor(definitionId: string): void
  /** 打开编辑器并留空源码，用于新建脚本。 */
  openBlank(): void
  /** 关闭编辑器并清空当前脚本身份。 */
  close(): void
  /** 把草稿写回注册表。 */
  save(): void
}

/** 创建脚本编辑器会话；每个图表实例独立，不共享开关状态。 */
export function useScriptEditor(store: ScriptSourceStore | undefined): ScriptEditorSession {
  const open = ref(false)
  const definitionId = ref<string | null>(null)
  const source = ref('')
  const error = ref<string | null>(null)
  const saved = ref(false)
  let revision: number | null = null

  // 草稿一旦变化即回到「未保存」，勾标只在最近一次成功保存后保持。
  watch(
    source,
    () => {
      saved.value = false
    },
    { flush: 'sync' },
  )

  return {
    open,
    definitionId,
    source,
    error,
    saved,
    openFor(id) {
      definitionId.value = id
      error.value = null
      saved.value = false
      const document = store?.read(id)
      source.value = document?.source ?? ''
      revision = document?.revision ?? null
      if (!document) error.value = '此指标没有可编辑的脚本文档'
      open.value = true
    },
    openBlank() {
      definitionId.value = null
      error.value = null
      saved.value = false
      source.value = ''
      revision = null
      open.value = true
    },
    close() {
      open.value = false
      definitionId.value = null
      error.value = null
      saved.value = false
      revision = null
    },
    save() {
      // 没有脚本身份即新建；保存后回填 id，后续保存转为更新。
      if (!store) {
        error.value = '此环境没有可编辑的脚本服务'
        saved.value = false
        return
      }
      try {
        if (definitionId.value === null) {
          const created = store.create(source.value)
          definitionId.value = created.id
          revision = created.revision
        } else {
          if (revision === null) throw new Error('此指标没有可编辑的脚本文档')
          const document = store.update(definitionId.value, source.value, revision)
          revision = document.revision
        }
        error.value = null
        saved.value = true
      } catch (failure) {
        error.value = failure instanceof Error ? failure.message : String(failure)
        saved.value = false
      }
    },
  }
}
