/** 指标弹窗目录：跟随注册表重建，脚本定义晚到也必须进入列表。 */
import {
  allIndicatorDefinitions,
  onIndicatorDefinitionChanged,
  type IndicatorSelectorController,
} from '@363045841yyt/klinechart-core/controllers'
import { onScopeDispose } from 'vue'

// 注册表变化即重建：内置脚本在服务启动后才注册，只读启动快照会把它们全部漏掉。
export function useIndicatorCatalog(controller: IndicatorSelectorController): void {
  const refresh = (): void => controller.catalog.set(allIndicatorDefinitions())
  refresh()
  const unsubscribe = onIndicatorDefinitionChanged(refresh)
  onScopeDispose(() => {
    unsubscribe()
    controller.dispose()
  })
}
