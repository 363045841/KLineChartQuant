/**
 * indicatorSelector 模块公共出口。
 *
 * 对外暴露 IndicatorSelectorController 工厂实现与模块契约类型；调用方应从本模块
 * 导入，避免直接依赖 impl/ 下的实现文件。
 */

export { createIndicatorSelectorController } from './impl/createIndicatorSelectorController.js'
export type {
  ActiveIndicator,
  IndicatorDefinition,
  IndicatorSelectorController,
  IndicatorSelectorInit,
} from './types.js'
