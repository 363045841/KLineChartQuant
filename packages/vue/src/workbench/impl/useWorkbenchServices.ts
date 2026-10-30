/** 工作台拥有脚本服务的生命周期，晚到的初始化结果同样必须释放。 */
import { onScopeDispose } from 'vue'
import type { ScriptService } from '@363045841yyt/klinechart-script-chart'

/** 返回初始化操作；服务只在明确启用脚本功能时创建。 */
export function useWorkbenchServices(enabled: boolean) {
  let disposed = false
  let service: ScriptService | undefined
  onScopeDispose(() => {
    disposed = true
    service?.dispose()
  })

  /** 加载内置指标后才挂载图表，保持与源码预览一致的初始化顺序。 */
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
    return service
  }

  return { initialize }
}
