/** 视图转移的输入与决策结果，不持有图表状态。 */
import type { SymbolSpec } from '../../controllers/types.js'
import type { ChartDataView } from '../state/modeState.js'

export interface ViewTransitionInput {
  readonly period: string | undefined
  readonly comparisonSpecs: ReadonlyArray<SymbolSpec>
}

export interface ViewTransition {
  readonly dataView: ChartDataView
  readonly timeShare: boolean
  readonly comparison: boolean
}
