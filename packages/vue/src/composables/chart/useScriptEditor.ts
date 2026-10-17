/**
 * 脚本编辑器会话：管理打开状态、当前脚本与草稿。
 *
 * 源码由宿主提供的仓库管理；编辑器只持有当前草稿，不维护第二份注册表。
 */
import { type Ref, ref, watch } from 'vue'
import {
  createBlankSource,
  createCopySource,
  uniqueScriptName,
} from './scriptEditor/impl/createScriptDraft.js'
import type { ScriptIdentity, ScriptSourceStore } from './scriptEditor/types.js'

/** 一个图表实例持有的编辑器会话状态与操作。 */
export interface ScriptEditorSession {
  /** 最近提交的显示名称，独立于框架生成的身份。 */
  readonly name: Ref<string | null>
  readonly identity: Ref<ScriptIdentity>
  readonly saving: Ref<boolean>
  /** 从当前内置源码创建独立的用户草稿。 */
  createCopy(): Promise<void>
  /** 编辑器是否打开。 */
  readonly open: Ref<boolean>
  /** 当前编辑的脚本所属指标定义 id。 */
  readonly definitionId: Ref<string | null>
  /** 草稿源码，编辑期间不写回注册表。 */
  readonly source: Ref<string>
  /** 当前源码的信任草稿；随保存一并提交。 */
  readonly trusted: Ref<boolean>
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
  save(): Promise<void>
}

/** 创建脚本编辑器会话；每个图表实例独立，不共享开关状态。 */
export function useScriptEditor(store: ScriptSourceStore | undefined): ScriptEditorSession {
  const open = ref(false)
  const definitionId = ref<string | null>(null)
  const name = ref<string | null>(null)
  const source = ref('')
  const trusted = ref(false)
  const error = ref<string | null>(null)
  const saved = ref(false)
  const identity = ref<ScriptIdentity>('user')
  const saving = ref(false)
  let revision: number | null = null

  // 草稿一旦变化即回到「未保存」，勾标只在最近一次成功保存后保持。
  watch(
    [source, trusted],
    () => {
      saved.value = false
    },
    { flush: 'sync' },
  )

  // 信任仅属于当前源码，编辑后必须由用户重新授予。
  watch(
    source,
    () => {
      trusted.value = false
    },
    { flush: 'sync' },
  )

  return {
    name,
    identity,
    saving,
    open,
    definitionId,
    source,
    trusted,
    error,
    saved,
    openFor(id) {
      if (saving.value) return
      error.value = null
      saved.value = false
      const document = store?.read(id)
      definitionId.value = document?.id ?? id
      name.value = document?.definition.name ?? null
      identity.value = document?.identity ?? 'builtin'
      source.value = document?.source ?? ''
      trusted.value = document?.trusted === true
      revision = document?.revision ?? null
      if (!document) error.value = '此指标没有可编辑的脚本文档'
      open.value = true
    },
    openBlank() {
      if (saving.value) return
      identity.value = 'user'
      definitionId.value = null
      name.value = null
      error.value = null
      saved.value = false
      source.value = store ? createBlankSource(uniqueScriptName(store, '我的脚本')) : ''
      trusted.value = false
      revision = null
      open.value = true
    },
    close() {
      if (saving.value) return
      open.value = false
      definitionId.value = null
      name.value = null
      error.value = null
      saved.value = false
      revision = null
      trusted.value = false
    },
    async createCopy() {
      if (!store || identity.value !== 'builtin' || !definitionId.value) return
      try {
        const originalId = definitionId.value
        const copyName = uniqueScriptName(store, `${name.value} 副本`)
        const copy = await createCopySource(source.value, copyName)
        if (definitionId.value !== originalId || identity.value !== 'builtin') return
        source.value = copy
        trusted.value = false
        definitionId.value = null
        name.value = null
        revision = null
        identity.value = 'user'
        error.value = null
        saved.value = false
      } catch (failure) {
        error.value = failure instanceof Error ? failure.message : String(failure)
      }
    },
    async save() {
      if (saving.value) return
      // 没有脚本身份即新建；保存后回填 id，后续保存转为更新。
      if (!store) {
        error.value = '此环境没有可编辑的脚本服务'
        saved.value = false
        return
      }
      if (identity.value !== 'user') {
        error.value = '内置脚本只读，请创建副本'
        return
      }
      try {
        saving.value = true
        const submittedSource = source.value
        const submittedTrusted = trusted.value
        if (definitionId.value === null) {
          const created = await store.create(submittedSource, submittedTrusted)
          definitionId.value = created.id
          name.value = created.definition.name
          revision = created.revision
        } else {
          if (revision === null) throw new Error('此指标没有可编辑的脚本文档')
          const document = await store.update(
            definitionId.value,
            submittedSource,
            revision,
            submittedTrusted,
          )
          name.value = document.definition.name
          revision = document.revision
        }
        error.value = null
        saved.value = source.value === submittedSource && trusted.value === submittedTrusted
      } catch (failure) {
        error.value = failure instanceof Error ? failure.message : String(failure)
        saved.value = false
      } finally {
        saving.value = false
      }
    },
  }
}
