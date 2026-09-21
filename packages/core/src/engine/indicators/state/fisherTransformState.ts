/**
 * Fisher Transform 渲染状态定义及默认配置。
 */

import type { BaseIndicatorState } from '../../../foundation/plugin/index.js'
import type { FisherPoint } from '../calculators/fisherTransform.js'

export interface FisherTransformRenderState extends BaseIndicatorState {
  timestamp: number
  series: (FisherPoint | undefined)[]
  params: { period: number; showFisher: boolean; showSignal: boolean }
  valueMin: number
  valueMax: number
  visibleMin: number
  visibleMax: number
}

/**
 * 创建 Fisher Transform 的 pane 级状态键。
 * @param paneId 目标副图 ID。
 * @returns Fisher Transform 状态命名空间键。
 */

export const EMPTY_FISHER_TRANSFORM_STATE: FisherTransformRenderState = {
  timestamp: 0,
  series: [],
  params: { period: 10, showFisher: true, showSignal: true },
  valueMin: 0,
  valueMax: 0,
  visibleMin: Infinity,
  visibleMax: -Infinity,
}
