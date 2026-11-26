/** 定义参数弹窗的对外契约；指标与警报共用同一套参数模型。 */
import type { IndicatorInputDef } from '@363045841yyt/klinechart-core'

/** 单个定义的参数草稿：键为参数 key，值为当前编辑值。 */
export type ParamValues = Record<string, number | string | boolean>

/** 参数草稿的入参契约，供弹窗与测试复用。 */
export interface ParamsDraftInput {
  readonly values: ParamValues
  readonly visible: boolean
  readonly params: readonly IndicatorInputDef[]
}

/** 参数弹窗入参。 */
export interface ParamsDialogProps {
  visible: boolean
  definitionName: string
  description?: string
  params: readonly IndicatorInputDef[]
  values: ParamValues
}

/** 参数行入参：单个参数定义与当前草稿值。 */
export interface ParamItemProps {
  param: IndicatorInputDef
  value: number | string | boolean | undefined
}
