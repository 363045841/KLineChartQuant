/**
 * ZLEMA（零滞后指数移动平均）指标状态定义
 * 单线指标：series 为全量 ZLEMA 序列，params 记录周期与显隐开关
 */
import type { BaseIndicatorState } from '../../../foundation/plugin/index'
import { createIndicatorStateKey } from '../../../foundation/plugin/stateKeys'

/** ZLEMA 渲染器状态（共享给渲染器和图例） */
export interface ZLEMARenderState extends BaseIndicatorState {
  timestamp: number
  /** 全量 ZLEMA 序列（稀疏：warmup 早期为 undefined） */
  series: (number | undefined)[]
  /** 计算与渲染参数（渲染器从 showZLEMA 判断是否绘制） */
  params: { period: number; showZLEMA: boolean }
  valueMin: number
  valueMax: number
  /** 视口内 ZLEMA 最低值 */
  visibleMin: number
  /** 视口内 ZLEMA 最高值 */
  visibleMax: number
}

/** ZLEMA 状态的 StateStore 键名，格式 indicator:zlema:<paneId> */
export const createZLEMAStateKey = (paneId: string) => createIndicatorStateKey('zlema', paneId)

export const DEFAULT_ZLEMA_PERIOD = 14

/** 空数据占位状态，消费者用 visibleMin > visibleMax 判断"无有效数据" */
export const EMPTY_ZLEMA_STATE: ZLEMARenderState = {
  timestamp: 0,
  series: [],
  params: { period: DEFAULT_ZLEMA_PERIOD, showZLEMA: true },
  valueMin: 0,
  valueMax: 1,
  visibleMin: Infinity,
  visibleMax: -Infinity,
}
