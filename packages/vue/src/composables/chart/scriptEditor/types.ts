/** 脚本编辑器与宿主的源码仓库契约；不依赖 script 包，保持图表包的 Apache 边界。 */

import type { ScriptOutputSource } from '@363045841yyt/klinechart-plot-contracts'
import type { Diagnostic } from '@codemirror/lint'
import type { InjectionKey } from 'vue'

/** 问题面板的诊断快照；服务或保存失败没有可跳转的位置。 */
export interface ScriptEditorProblem {
  severity: Diagnostic['severity']
  message: string
  source?: string
  location: { from: number; to: number; line: number; column: number } | null
}

/** 编辑器只用于用户脚本源码；未指定归属时按只读处理。 */
export type ScriptIdentity = 'builtin' | 'user'

/** 标签页只读摘要；源码和保存版本由编辑会话独立持有。 */
export interface ScriptEditorTab {
  readonly id: string
  readonly definitionId: string | null
  readonly title: string
  readonly kind: 'indicator' | 'library'
  readonly dirty: boolean
}

/** 编辑器读取或提交的脚本文档。 */
export interface ScriptEditorDocument {
  readonly kind: 'indicator' | 'library'
  readonly trusted: boolean
  readonly id: string
  readonly definition: { readonly name: string }
  readonly source: string
  readonly revision: number
  readonly identity: ScriptIdentity
}

/** 宿主提供的源码读写接口，统一访问脚本注册时使用的仓库。 */
export interface ScriptSourceStore {
  list(): readonly ScriptEditorDocument[]
  /** 宿主支持脚本运行输出时提供；纯源码仓库可以省略。 */
  readonly output?: ScriptOutputSource
  read(id: string): ScriptEditorDocument | undefined
  /** 提交一个新脚本，返回分配的稳定 id 与首个版本号。 */
  create(source: string, trusted?: boolean): Promise<ScriptEditorDocument>
  update(
    id: string,
    source: string,
    expectedRevision: number,
    trusted?: boolean,
  ): Promise<ScriptEditorDocument>
  /** 删除指定版本的脚本，持久化成功后通知目录更新。 */
  remove(id: string, expectedRevision: number): Promise<void>
}

/** 应用源码仓库注入键；图表与编辑器共用。 */
export const SCRIPT_SOURCE_STORE_KEY: InjectionKey<ScriptSourceStore> = Symbol('ScriptSourceStore')
