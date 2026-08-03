import type { BaseIndicatorState } from '../../../foundation/plugin/index'
import { createIndicatorStateKey } from '../../../foundation/plugin/stateKeys'

/**
 * GMMA（顾比均线）渲染器状态
 * 包含全量 EMA 序列、启用的周期列表、显示开关以及视口极值
 */
export interface GMMARenderState extends BaseIndicatorState {
  timestamp: number
  /** 周期 → 全量 EMA 数组（用 Record 而非 Map，兼容 JSON 序列化和 postMessage） */
  series: Record<number, (number | undefined)[]>
  /** 当前启用的周期列表（渲染器据此决定绘制哪些线） */
  enabledPeriods: number[]
  /** 显示开关等参数 */
  params: { showGMMA: boolean }
  /** 全量 EMA 极值（供 Y 轴刻度使用） */
  valueMin: number
  valueMax: number
  /** 视口内 EMA 极值（无有效数据时 visibleMin > visibleMax） */
  visibleMin: number
  visibleMax: number
}

/** 顾比均线短周期组（3~15，快速 EMA） */
export const GMMA_SHORT_PERIODS = [3, 5, 8, 10, 12, 15] as const
/** 顾比均线长周期组（30~60，慢速 EMA） */
export const GMMA_LONG_PERIODS = [30, 35, 40, 45, 50, 60] as const
/** 全部 12 条 GMMA 周期（短组在前、长组在后） */
export const GMMA_PERIODS = [...GMMA_SHORT_PERIODS, ...GMMA_LONG_PERIODS] as const

/**
 * GMMA 状态的 StateStore 键名
 * 格式：indicator:gmma:paneId
 */
export const createGMMAStateKey = (paneId: string) => createIndicatorStateKey('gmma', paneId)

/** 空数据占位状态（visibleMin > visibleMax 表示无有效数据） */
export const EMPTY_GMMA_STATE: GMMARenderState = {
  timestamp: 0,
  series: {},
  enabledPeriods: [],
  params: { showGMMA: true },
  valueMin: 0,
  valueMax: 1,
  visibleMin: Infinity,
  visibleMax: -Infinity,
}
