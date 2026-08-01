import type { BaseIndicatorState } from '../../../foundation/plugin/index'
import { createIndicatorStateKey } from '../../../foundation/plugin/stateKeys'

/**
 * DMA 单点：DIF = MA(close,p1) - MA(close,p2)，AMA = MA(DIF,p3)
 */
export interface DMAPoint {
  dif: number
  ama: number
}

/**
 * DMA 渲染器状态（共享给渲染器和图例）
 * 包含全量点数组、计算参数、以及视口极值
 */
export interface DMARenderState extends BaseIndicatorState {
  timestamp: number
  /** 全量点数组（稀疏：未定义处表示无有效值） */
  series: (DMAPoint | undefined)[]
  /** 计算参数 */
  params: {
    p1: number
    p2: number
    p3: number
    showDMA: boolean
  }
  valueMin: number
  valueMax: number
  /** 视口内 DMA 线的最低值 */
  visibleMin: number
  /** 视口内 DMA 线的最高值 */
  visibleMax: number
}

/**
 * DMA 状态键：indicator:dma:{paneId}
 */
export const createDMAStateKey = (paneId: string) => createIndicatorStateKey('dma', paneId)

export const DEFAULT_DMA_P1 = 10
export const DEFAULT_DMA_P2 = 50
export const DEFAULT_DMA_P3 = 10

/**
 * 空数据占位状态
 * 消费者应检查 visibleMin > visibleMax 判断"无有效数据"
 */
export const EMPTY_DMA_STATE: DMARenderState = {
  timestamp: 0,
  series: [],
  params: { p1: DEFAULT_DMA_P1, p2: DEFAULT_DMA_P2, p3: DEFAULT_DMA_P3, showDMA: true },
  valueMin: 0,
  valueMax: 1,
  visibleMin: Infinity,
  visibleMax: -Infinity,
}
