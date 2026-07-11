import type { BaseIndicatorState } from '../../../foundation/plugin/index'
import { createIndicatorStateKey } from '../../../foundation/plugin/stateKeys'

/**
 * MA 渲染器状态（共享给渲染器和图例）
 * 包含全量 MA 数组、启用的周期列表、以及视口极值
 */
export interface MARenderState extends BaseIndicatorState {
  timestamp: number
  /** period → 全量 MA 数组（用 Record 而非 Map，兼容 JSON 序列化和 postMessage） */
  series: Record<number, (number | undefined)[]>
  /** 当前启用的周期列表（渲染器直接从此字段决定绘制哪些线） */
  enabledPeriods: number[]
  /** 视口内所有 MA 线的最低价（供 Y 轴刻度渲染器使用） */
  visibleMin: number
  /** 视口内所有 MA 线的最高价 */
  visibleMax: number
}

/**
 * MA 状态的 StateStore 键名
 * 格式：indicator:ma:main
 */
export const MA_STATE_KEY = createIndicatorStateKey('ma', 'main')

/**
 * 空数据占位状态
 * 消费者应检查 visibleMin > visibleMax 判断"无有效数据"
 */
export const EMPTY_MA_STATE: MARenderState = {
  timestamp: 0,
  series: {},
  enabledPeriods: [],
  visibleMin: Infinity,
  visibleMax: -Infinity,
}
