import type { BaseIndicatorState } from '../../../plugin'
import type { MACDPoint } from '../calculators'
import type { MACDSchedulerConfig } from '../workerProtocol'

/**
 * MACD 渲染器状态
 * 用 Record 而非 Map，兼容 JSON 序列化和 postMessage
 */
export interface MACDRenderState extends BaseIndicatorState {
  /** MACD 系列数据，与 K 线数据同长度 */
  series: MACDPoint[]
  /** 配置参数 */
  params: MACDSchedulerConfig
  /** 可视范围内的最小值 */
  visibleMin: number
  /** 可视范围内的最大值 */
  visibleMax: number
  /** 固定数值范围最小值 */
  valueMin: number
  /** 固定数值范围最大值 */
  valueMax: number
  /** 最新值 */
  latestValues?: { dif: number; dea: number; macd: number }
}

/**
 * MACD State 的命名空间 key
 * 格式: indicator:macd:{paneId}
 */
const MACD_STATE_KEY = 'indicator:macd'

/**
 * 创建 MACD State Key
 * @param paneId pane ID，如 'sub_MACD'
 */
export function createMACDStateKey(paneId: string): string {
  return `${MACD_STATE_KEY}:${paneId}`
}

/**
 * 空 MACD State（哨兵值）
 * visibleMin > visibleMax 表示无有效数据
 */
export const EMPTY_MACD_STATE: MACDRenderState = {
  timestamp: 0,
  series: [],
  params: {
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    showDIF: true,
    showDEA: true,
    showBAR: true,
  },
  visibleMin: Infinity,
  visibleMax: -Infinity,
  valueMin: -Infinity,
  valueMax: Infinity,
}
