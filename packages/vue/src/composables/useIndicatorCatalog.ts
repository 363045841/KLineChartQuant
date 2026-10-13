/** 指标弹窗目录：初始读取注册表，并订阅运行时新增的脚本定义。 */
import {
  allIndicatorDefinitions,
  type IndicatorSelectorController,
  onIndicatorDefinitionChanged,
} from '@363045841yyt/klinechart-core/controllers'
import { onScopeDispose } from 'vue'

// 跟随组件作用域释放注册监听，目录保持唯一来源。
export function useIndicatorCatalog(controller: IndicatorSelectorController): void {
  const refresh = () => controller.catalog.set(allIndicatorDefinitions())
  refresh()
  onScopeDispose(onIndicatorDefinitionChanged(refresh))
  onScopeDispose(() => controller.dispose())
}
