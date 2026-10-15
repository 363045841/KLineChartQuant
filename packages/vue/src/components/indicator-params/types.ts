/** 指标参数弹窗的对外契约与共享数据类型。 */
import type { ParamConfig } from '@363045841yyt/klinechart-core/engine/renderers/Indicator/indicatorCatalog'

/** 单个指标的参数草稿：键为参数 key，值为当前编辑值。 */
export type IndicatorParamValues = Record<string, number | string | boolean>

/** 参数草稿的入参契约，供弹窗与测试复用。 */
export interface IndicatorParamsDraftInput {
  readonly values: IndicatorParamValues
  readonly visible: boolean
  readonly params: readonly ParamConfig[]
}

/** 参数弹窗入参。 */
export interface IndicatorParamsDialogProps {
  visible: boolean
  indicatorId: string
  indicatorName: string
  indicatorDescription?: string
  params: ParamConfig[]
  values: IndicatorParamValues
}

/** 参数行入参：单个参数定义、当前草稿值与说明的展开状态。 */
export interface IndicatorParamItemProps {
  param: ParamConfig
  value: number | string | boolean | undefined
  showDescription: boolean
}
