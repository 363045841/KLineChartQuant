/** 脚本编辑器的宿主源码仓库契约；Vue 不持有源码注册表。 */
import type { InjectionKey } from 'vue'

/** 宿主提供的源码读写接口，统一访问脚本注册时使用的仓库。 */
export interface ScriptSourceStore {
  read(id: string): { readonly source: string; readonly revision: number } | undefined
  update(
    id: string,
    source: string,
    expectedRevision: number,
  ): { readonly source: string; readonly revision: number }
}

/** 应用级源码仓库注入键，供所有图表编辑器共用。 */
export const SCRIPT_SOURCE_STORE_KEY: InjectionKey<ScriptSourceStore> = Symbol('ScriptSourceStore')
