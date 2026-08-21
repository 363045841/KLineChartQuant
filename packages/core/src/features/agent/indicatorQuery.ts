// 本文件定义 Agent 查询指标计算结果的 MVP 接口与 DTO。

/** 调用指标计算链路并返回当前行情对应的查询结果。 */
export interface IndicatorQuery {
  queryIndicator(input: IndicatorQueryInput): Promise<IndicatorQueryResult>
}

/** Agent 发起一次指标计算查询所需的参数。 */
export interface IndicatorQueryInput {
  readonly definitionId: string
  readonly params?: Readonly<Record<string, number>>
  readonly from?: number
  readonly to?: number
  readonly limit?: number
}

/** 单个时间点的指标字段值，null 表示历史数据不足以产生有效指标值或该字段缺失。 */
export interface IndicatorQueryPoint {
  readonly timestamp: number
  readonly values: Readonly<Record<string, number | null>>
}

/** Agent 可读取的指标查询结果。 */
export interface IndicatorQueryResult {
  readonly definitionId: string
  readonly params: Readonly<Record<string, number>>
  readonly points: readonly IndicatorQueryPoint[]
}
