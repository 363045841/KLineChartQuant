/**
 * 指标实例与计算结果的领域模型。
 *
 * 计算结果由执行层按计算身份保存，按实例身份投影到图表。
 * 名词与脚本 API 对齐：`inputs` 是 `input.*` 的取值，`series` 是一次计算的输出。
 */
/** 递归 JSON-like 输入对象；用 interface 承载以避免类型别名循环引用。 */
export interface IndicatorInputObject {
  readonly [key: string]: IndicatorInputValue
}

export type IndicatorInputValue =
  | null
  | boolean
  | number
  | string
  | readonly IndicatorInputValue[]
  | IndicatorInputObject

export type IndicatorInputs = Readonly<Record<string, IndicatorInputValue>>

/** 可跨 Worker 传输的计算错误，不携带 Error 原型或堆栈。 */
export interface IndicatorError {
  readonly message: string
  readonly code?: string
  readonly plotId?: string
  readonly barIndex?: number
}

/** 一次计算的已提交结果；身份由结果仓库的键与实例池的键承担。 */
export interface IndicatorResult {
  /** 计算时的时间轴；展示映射在投影边界生成。 */
  readonly timestamps: readonly number[]
  readonly dataRevision: number
  readonly marketRevision: number
  readonly series: unknown
  readonly error?: IndicatorError
}
