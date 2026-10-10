import type { BaseIndicatorState } from '@/foundation/plugin/index.js'
import type { BOLLPoint } from '../calculators/index.js'

export const DEFAULT_BOLL_PERIOD = 20
export const DEFAULT_BOLL_MULTIPLIER = 2

/**
 * BOLL 渲染器状态（共享给渲染器和图例）
 * 包含全量 BOLL 数组、计算参数、以及视口极值
 */
export interface BOLLRenderState extends BaseIndicatorState {
  timestamp: number
  /** 全量 BOLL 数组（稀疏：前 period-1 个为 undefined） */
  series: Array<BOLLPoint | undefined>
  /** 计算和渲染参数（渲染器从此读取 showUpper/showMiddle/showLower） */
  params: {
    period: number
    multiplier: number
    showUpper: boolean
    showMiddle: boolean
    showLower: boolean
  }
  /** 视口内所有 BOLL 线的最低价 */
  visibleMin: number
  /** 视口内所有 BOLL 线的最高价 */
  visibleMax: number
}
