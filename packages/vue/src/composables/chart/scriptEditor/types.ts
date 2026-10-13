/** 脚本编辑器的宿主源码仓库契约；Vue 不持有源码注册表。 */
import type { InjectionKey } from 'vue'

/** 宿主提供的源码读写接口，统一访问脚本注册时使用的仓库。 */
export interface ScriptSourceStore {
  read(id: string): { readonly source: string; readonly revision: number } | undefined
  /** 提交一份新脚本，返回它的定义 id 与首个版本号。 */
  create(source: string): { readonly id: string; readonly source: string; readonly revision: number }
  update(
    id: string,
    source: string,
    expectedRevision: number,
  ): { readonly source: string; readonly revision: number }
}

/** 应用级源码仓库注入键，供所有图表编辑器共用。 */
export const SCRIPT_SOURCE_STORE_KEY: InjectionKey<ScriptSourceStore> = Symbol('ScriptSourceStore')
/** 编辑器虚拟文件的固定身份；会话通过独立 Worker 隔离。 */
export const SCRIPT_EDITOR_FILE = '/indicator.js'

import type { createWorker } from '@valtown/codemirror-ts/worker'

/** 现成语言适配的协议与 TypeScript 参数签名查询。 */
export interface ScriptLanguageWorker extends ReturnType<typeof createWorker> {
  getSignatureHelp(path: string, position: number): string | null
}
