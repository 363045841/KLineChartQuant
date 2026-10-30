/** 工作台拥有脚本服务的生命周期，晚到的初始化结果同样必须释放。 */
import { onScopeDispose, provide, shallowRef } from 'vue'
import type { ScriptService } from '@363045841yyt/klinechart-script-chart'
import { SCRIPT_SOURCE_STORE_KEY } from '../../composables/chart/scriptEditor/types.js'

/** 返回初始化操作；服务只在明确启用脚本功能时创建。 */
export function useWorkbenchServices(enabled: boolean) {
  let disposed = false
  let service: ScriptService | undefined
  const sourceStore = shallowRef<ScriptService>()
  if (enabled) provide(SCRIPT_SOURCE_STORE_KEY, sourceStore)
  onScopeDispose(() => {
    disposed = true
    service?.dispose()
  })

  /** 后台加载内置指标并发布服务，界面无需等待脚本工作区恢复。 */
  async function initialize(): Promise<ScriptService | undefined> {
    if (!enabled) return undefined
    const { createBuiltinScriptService } = await import('@363045841yyt/klinechart-script-chart')
    if (disposed) return undefined
    const created = await createBuiltinScriptService()
    if (disposed) {
      created.dispose()
      return undefined
    }
    service = created
    sourceStore.value = created
    return service
  }

  return { initialize }
}
