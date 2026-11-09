/** 工作台把页面级脚本服务挂到当前作用域，供编辑器与图表共用；不拥有它的生命周期。 */
import { provide, shallowRef } from 'vue'
import type { ScriptService } from '@363045841yyt/klinechart-script-chart'
import { SCRIPT_SOURCE_STORE_KEY } from '../../composables/chart/scriptEditor/types.js'
import { sharedScriptService } from './scriptService.js'

/** 返回初始化操作；服务只在明确启用脚本功能时创建。 */
export function useWorkbenchServices(enabled: boolean) {
  const sourceStore = shallowRef<ScriptService>()
  if (enabled) provide(SCRIPT_SOURCE_STORE_KEY, sourceStore)

  /** 后台加载内置指标并发布服务，界面无需等待脚本工作区恢复。 */
  async function initialize(): Promise<ScriptService | undefined> {
    if (!enabled) return undefined
    const service = await sharedScriptService()
    sourceStore.value = service
    return service
  }

  return { initialize }
}
