/** 指标弹窗目录：初始读取注册表，并订阅运行时新增的脚本定义。 */
import {
  allIndicatorDefinitions,
  type IndicatorSelectorController,
} from '@363045841yyt/klinechart-core/controllers'
import { effect } from '@363045841yyt/klinechart-core/reactivity'
import { onScopeDispose } from 'vue'

// 跟随组件作用域释放注册监听，目录保持唯一来源。
export function useIndicatorCatalog(controller: IndicatorSelectorController): void {
  // 读取已提交目录的响应式快照，避免在定义发布事务中读取尚未重算的目录。
  onScopeDispose(effect(() => controller.catalog.set(allIndicatorDefinitions())))
  onScopeDispose(() => controller.dispose())
}
