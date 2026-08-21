/** 本文件定义主线程指标结果池的所属方模型。 */

import type { IndicatorInstanceCalculationResult } from '../indicators/workerProtocol'

/** 指标结果池支持的所属方。 */
export const INDICATOR_RESULT_OWNER = {
  CHART: 'chart',
  AGENT: 'agent',
} as const

/** 图表实例结果，由主线程在 Worker 结果之外补充所属方。 */
export interface IndicatorChartSeriesResult extends IndicatorInstanceCalculationResult {
  readonly owner: typeof INDICATOR_RESULT_OWNER.CHART
}

/** Agent 自定义计算产生的无所属方结果。 */
export interface IndicatorAgentCalculationResult {
  readonly agentResultId: string
  readonly definitionId: string
  readonly params: Readonly<Record<string, number>>
  readonly series: unknown
  readonly firstReadyIndex: number | null
}

/** Agent 自定义计算结果，不包含图表实例和 pane 身份。 */
export interface IndicatorAgentSeriesResult extends IndicatorAgentCalculationResult {
  readonly owner: typeof INDICATOR_RESULT_OWNER.AGENT
}

/** 结果池中可保存的指标计算结果。 */
export type IndicatorSeriesResult = IndicatorChartSeriesResult | IndicatorAgentSeriesResult

/** 在主线程为纯计算结果附加图表所属方。 */
export function ownChartIndicatorResult(
  result: IndicatorInstanceCalculationResult,
): IndicatorChartSeriesResult {
  return { ...result, owner: INDICATOR_RESULT_OWNER.CHART }
}

/** 在主线程为 Agent 计算结果附加所属方。 */
export function ownAgentIndicatorResult(
  result: IndicatorAgentCalculationResult,
): IndicatorAgentSeriesResult {
  return { ...result, owner: INDICATOR_RESULT_OWNER.AGENT }
}
