/** 脚本编辑器的宿主源码仓库契约；Vue 不持有源码注册表。 */
import type { InjectionKey } from 'vue'

/** 编辑器只允许用户身份修改源码，未指定身份时保持只读。 */
export type ScriptIdentity = 'builtin' | 'user'

/** 编辑器读取的已提交脚本文档。 */
export interface ScriptEditorDocument {
  readonly id: string
  readonly source: string
  readonly revision: number
  readonly identity: ScriptIdentity
}

/** 宿主提供的源码读写接口，统一访问脚本注册时使用的仓库。 */
export interface ScriptSourceStore {
  read(id: string): ScriptEditorDocument | undefined
  /** 提交一份新脚本，返回它的定义 id 与首个版本号。 */
  create(source: string): Promise<ScriptEditorDocument>
  update(id: string, source: string, expectedRevision: number): Promise<ScriptEditorDocument>
  /** 删除指定版本的用户脚本，持久化成功后通知目录更新。 */
  remove(id: string, expectedRevision: number): Promise<void>
}

/** 应用级源码仓库注入键，供所有图表编辑器共用。 */
export const SCRIPT_SOURCE_STORE_KEY: InjectionKey<ScriptSourceStore> = Symbol('ScriptSourceStore')
/** 编辑器虚拟文件的固定身份；会话通过独立 Worker 隔离。 */
export const SCRIPT_EDITOR_FILE = '/indicator.ts'

import type { createWorker } from '@valtown/codemirror-ts/worker'

/** 现成语言适配的协议与 TypeScript 参数签名查询。 */
/** 代码文本中的半开区间，以 UTF-16 偏移定位。 */
export interface ScriptTextRange {
  readonly from: number
  readonly to: number
}

/** 所有只读代码提示共用的展示与生命周期接口。 */
export interface ScriptCodeView {
  readonly dom: HTMLElement
  update(text: string, emphasis?: ScriptTextRange | null): void
  destroy(): void
}

/** TypeScript 返回的签名文本及当前参数范围，不包含展示样式。 */
export interface ScriptSignatureHelp {
  readonly text: string
  readonly activeParameter: ScriptTextRange | null
}

/** 签名交互只依赖异步数据查询，不依赖 Worker 传输实现。 */
export interface ScriptSignatureProvider {
  getSignatureHelp(path: string, position: number): Promise<ScriptSignatureHelp | null>
}

/** 编辑器语言服务与独立 Worker 共用的查询契约。 */
export interface ScriptLanguageWorker extends ReturnType<typeof createWorker> {
  getSignatureHelp(path: string, position: number): ScriptSignatureHelp | null
}
